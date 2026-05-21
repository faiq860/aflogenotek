import pg from 'pg';
const { Client } = pg;

async function ensureNotificationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      hardware_id TEXT NOT NULL,
      machine_name TEXT,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  try {
    await client.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false;`);
  } catch (e) { /* column exists */ }
}

export default async function handler(req, res) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return res.status(500).json({ error: 'DATABASE_URL is not set' });
  }

  const client = new Client({ connectionString });

  try {
    await client.connect();
    await ensureNotificationsTable(client);

    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const unreadOnly = url.searchParams.get('unread') === 'true';

      // Auto-generate notifications for devices offline >48h that have no existing unread alert
      const offlineResult = await client.query(`
        SELECT hardware_id, machine_name, last_seen
        FROM machines
        WHERE last_seen IS NOT NULL
          AND last_seen < NOW() - INTERVAL '48 hours'
          AND status != 'blocked'
      `);

      for (const row of offlineResult.rows) {
        // Insert notification only if one doesn't already exist in last 24h to avoid spam
        const existing = await client.query(`
          SELECT id FROM notifications
          WHERE hardware_id = $1
            AND type = 'offline_48h'
            AND is_read = false
            AND created_at > NOW() - INTERVAL '24 hours'
          LIMIT 1
        `, [row.hardware_id]);

        if (existing.rows.length === 0) {
          const hoursOffline = Math.floor((Date.now() - new Date(row.last_seen).getTime()) / 3600000);
          await client.query(`
            INSERT INTO notifications (hardware_id, machine_name, type, message)
            VALUES ($1, $2, 'offline_48h', $3)
          `, [
            row.hardware_id,
            row.machine_name,
            `الجهاز "${row.machine_name}" منقطع منذ ${hoursOffline} ساعة`
          ]);
        }
      }

      // Fetch notifications
      const whereClause = unreadOnly ? 'WHERE is_read = false' : '';
      const result = await client.query(`
        SELECT id, hardware_id, machine_name, type, message, is_read, created_at
        FROM notifications
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT 100
      `);

      const unreadCount = await client.query(`
        SELECT COUNT(*) FROM notifications WHERE is_read = false
      `);

      return res.status(200).json({
        notifications: result.rows,
        unreadCount: parseInt(unreadCount.rows[0].count, 10)
      });

    } else if (req.method === 'POST') {
      const { action, id, hardware_id } = req.body;

      if (action === 'mark_read') {
        if (id) {
          await client.query(`UPDATE notifications SET is_read = true WHERE id = $1`, [id]);
        } else if (hardware_id) {
          await client.query(`UPDATE notifications SET is_read = true WHERE hardware_id = $1`, [hardware_id]);
        } else {
          // Mark all as read
          await client.query(`UPDATE notifications SET is_read = true`);
        }
        return res.status(200).json({ success: true });

      } else if (action === 'clear_all') {
        await client.query(`DELETE FROM notifications WHERE is_read = true`);
        return res.status(200).json({ success: true });

      } else if (action === 'create') {
        const { machine_name, type, message } = req.body;
        if (!hardware_id || !type || !message) {
          return res.status(400).json({ error: 'Missing required fields' });
        }
        await client.query(`
          INSERT INTO notifications (hardware_id, machine_name, type, message)
          VALUES ($1, $2, $3, $4)
        `, [hardware_id, machine_name || '', type, message]);
        return res.status(201).json({ success: true });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('notify error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    await client.end();
  }
}
