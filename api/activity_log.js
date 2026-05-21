import pg from 'pg';
const { Client } = pg;

async function ensureActivityLogTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS machine_activity_log (
      id SERIAL PRIMARY KEY,
      hardware_id TEXT NOT NULL,
      machine_name TEXT,
      event_type TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      logged_at TIMESTAMP DEFAULT NOW()
    );
  `);

  const extraCols = ['ip_address', 'details'];
  for (const col of extraCols) {
    try {
      await client.query(`ALTER TABLE machine_activity_log ADD COLUMN IF NOT EXISTS ${col} TEXT;`);
    } catch (e) { /* column exists */ }
  }
}

export default async function handler(req, res) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return res.status(500).json({ error: 'DATABASE_URL is not set' });
  }

  const client = new Client({ connectionString });

  try {
    await client.connect();
    await ensureActivityLogTable(client);

    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const hardware_id = url.searchParams.get('hardware_id');
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10), 500);

      let result;
      if (hardware_id) {
        result = await client.query(`
          SELECT id, hardware_id, machine_name, event_type, details, ip_address, logged_at
          FROM machine_activity_log
          WHERE hardware_id = $1
          ORDER BY logged_at DESC
          LIMIT $2
        `, [hardware_id, limit]);
      } else {
        result = await client.query(`
          SELECT id, hardware_id, machine_name, event_type, details, ip_address, logged_at
          FROM machine_activity_log
          ORDER BY logged_at DESC
          LIMIT $1
        `, [limit]);
      }

      const logs = result.rows.map(r => ({
        id: r.id,
        hardware_id: r.hardware_id,
        machine_name: r.machine_name,
        event_type: r.event_type,
        details: r.details,
        ip_address: r.ip_address,
        logged_at: r.logged_at,
        // Display-friendly aliases used by ActivityLog component in App.jsx
        time: r.logged_at,
        device: r.machine_name || r.hardware_id,
        event: r.event_type,
        data: [r.details, r.ip_address].filter(Boolean).join(' | ') || r.event_type
      }));

      return res.status(200).json({ logs });

    } else if (req.method === 'POST') {
      const { hardware_id, machine_name, event_type, details, ip_address } = req.body;

      if (!hardware_id || !event_type) {
        return res.status(400).json({ error: 'Missing hardware_id or event_type' });
      }

      // Also auto-log a notification for critical events
      const criticalEvents = ['PC_SWAP_DETECTED', 'ANALYZER_SWAP_DETECTED', 'TAMPER_DETECTED', 'BLOCKED'];
      if (criticalEvents.includes(event_type)) {
        try {
          await client.query(`
            INSERT INTO notifications (hardware_id, machine_name, type, message)
            VALUES ($1, $2, $3, $4)
          `, [
            hardware_id,
            machine_name || '',
            event_type.toLowerCase(),
            `${machine_name || hardware_id}: ${details || event_type}`
          ]);
        } catch (e) {
          // notifications table may not exist yet — non-fatal
        }
      }

      await client.query(`
        INSERT INTO machine_activity_log (hardware_id, machine_name, event_type, details, ip_address)
        VALUES ($1, $2, $3, $4, $5)
      `, [hardware_id, machine_name || '', event_type, details || '', ip_address || '']);

      return res.status(201).json({ success: true });

    } else if (req.method === 'DELETE') {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const hardware_id = url.searchParams.get('hardware_id');
      const before_days = parseInt(url.searchParams.get('before_days') || '30', 10);

      if (hardware_id) {
        await client.query(`DELETE FROM machine_activity_log WHERE hardware_id = $1`, [hardware_id]);
      } else {
        await client.query(`
          DELETE FROM machine_activity_log
          WHERE logged_at < NOW() - ($1 || ' days')::INTERVAL
        `, [before_days]);
      }

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('activity_log error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    await client.end();
  }
}
