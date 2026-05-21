import pg from 'pg';
const { Client } = pg;

// Single endpoint for notifications + activity log
// Route: /api/monitoring?scope=notify  OR  /api/monitoring?scope=activity

async function ensureTables(client) {
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
  try { await client.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false;`); } catch {}

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
  for (const col of ['ip_address', 'details']) {
    try { await client.query(`ALTER TABLE machine_activity_log ADD COLUMN IF NOT EXISTS ${col} TEXT;`); } catch {}
  }
}

// ── NOTIFY handlers ──────────────────────────────────────────────────────────

async function handleNotify(req, res, client) {
  if (req.method === 'GET') {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const unreadOnly = url.searchParams.get('unread') === 'true';

    // Auto-generate offline_48h notifications
    const offlineRows = await client.query(`
      SELECT hardware_id, machine_name, last_seen FROM machines
      WHERE last_seen IS NOT NULL
        AND last_seen < NOW() - INTERVAL '48 hours'
        AND status != 'blocked'
    `);
    for (const row of offlineRows.rows) {
      const existing = await client.query(`
        SELECT id FROM notifications
        WHERE hardware_id = $1 AND type = 'offline_48h' AND is_read = false
          AND created_at > NOW() - INTERVAL '24 hours'
        LIMIT 1
      `, [row.hardware_id]);
      if (existing.rows.length === 0) {
        const h = Math.floor((Date.now() - new Date(row.last_seen).getTime()) / 3600000);
        await client.query(`
          INSERT INTO notifications (hardware_id, machine_name, type, message)
          VALUES ($1, $2, 'offline_48h', $3)
        `, [row.hardware_id, row.machine_name, `الجهاز "${row.machine_name}" منقطع منذ ${h} ساعة`]);
      }
    }

    const where = unreadOnly ? 'WHERE is_read = false' : '';
    const result = await client.query(`
      SELECT id, hardware_id, machine_name, type, message, is_read, created_at
      FROM notifications ${where}
      ORDER BY created_at DESC LIMIT 100
    `);
    const count = await client.query(`SELECT COUNT(*) FROM notifications WHERE is_read = false`);
    return res.status(200).json({ notifications: result.rows, unreadCount: parseInt(count.rows[0].count, 10) });
  }

  if (req.method === 'POST') {
    const { action, id, hardware_id, machine_name, type, message } = req.body;
    if (action === 'mark_read') {
      if (id)          await client.query(`UPDATE notifications SET is_read = true WHERE id = $1`, [id]);
      else if (hardware_id) await client.query(`UPDATE notifications SET is_read = true WHERE hardware_id = $1`, [hardware_id]);
      else             await client.query(`UPDATE notifications SET is_read = true`);
      return res.status(200).json({ success: true });
    }
    if (action === 'clear_all') {
      await client.query(`DELETE FROM notifications WHERE is_read = true`);
      return res.status(200).json({ success: true });
    }
    if (action === 'create') {
      if (!hardware_id || !type || !message) return res.status(400).json({ error: 'Missing fields' });
      await client.query(`INSERT INTO notifications (hardware_id, machine_name, type, message) VALUES ($1,$2,$3,$4)`,
        [hardware_id, machine_name || '', type, message]);
      return res.status(201).json({ success: true });
    }
    return res.status(400).json({ error: 'Unknown action' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ── ACTIVITY LOG handlers ────────────────────────────────────────────────────

async function handleActivity(req, res, client) {
  if (req.method === 'GET') {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const hardware_id = url.searchParams.get('hardware_id');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10), 500);

    const result = hardware_id
      ? await client.query(`SELECT * FROM machine_activity_log WHERE hardware_id = $1 ORDER BY logged_at DESC LIMIT $2`, [hardware_id, limit])
      : await client.query(`SELECT * FROM machine_activity_log ORDER BY logged_at DESC LIMIT $1`, [limit]);

    const logs = result.rows.map(r => ({
      ...r,
      time: r.logged_at,
      device: r.machine_name || r.hardware_id,
      event: r.event_type,
      data: [r.details, r.ip_address].filter(Boolean).join(' | ') || r.event_type
    }));
    return res.status(200).json({ logs });
  }

  if (req.method === 'POST') {
    const { hardware_id, machine_name, event_type, details, ip_address } = req.body;
    if (!hardware_id || !event_type) return res.status(400).json({ error: 'Missing hardware_id or event_type' });

    const criticalEvents = ['PC_SWAP_DETECTED', 'ANALYZER_SWAP_DETECTED', 'TAMPER_DETECTED', 'BLOCKED'];
    if (criticalEvents.includes(event_type)) {
      try {
        await client.query(`INSERT INTO notifications (hardware_id, machine_name, type, message) VALUES ($1,$2,$3,$4)`,
          [hardware_id, machine_name || '', event_type.toLowerCase(), `${machine_name || hardware_id}: ${details || event_type}`]);
      } catch {}
    }

    await client.query(`
      INSERT INTO machine_activity_log (hardware_id, machine_name, event_type, details, ip_address)
      VALUES ($1,$2,$3,$4,$5)
    `, [hardware_id, machine_name || '', event_type, details || '', ip_address || '']);
    return res.status(201).json({ success: true });
  }

  if (req.method === 'DELETE') {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const hardware_id = url.searchParams.get('hardware_id');
    const before_days = parseInt(url.searchParams.get('before_days') || '30', 10);
    if (hardware_id) await client.query(`DELETE FROM machine_activity_log WHERE hardware_id = $1`, [hardware_id]);
    else await client.query(`DELETE FROM machine_activity_log WHERE logged_at < NOW() - ($1 || ' days')::INTERVAL`, [before_days]);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return res.status(500).json({ error: 'DATABASE_URL is not set' });

  const url = new URL(req.url, `http://${req.headers.host}`);
  const scope = url.searchParams.get('scope');

  if (!scope || !['notify', 'activity'].includes(scope)) {
    return res.status(400).json({ error: 'Missing or invalid ?scope= (use notify or activity)' });
  }

  const client = new Client({ connectionString });
  try {
    await client.connect();
    await ensureTables(client);
    if (scope === 'notify')   return await handleNotify(req, res, client);
    if (scope === 'activity') return await handleActivity(req, res, client);
  } catch (error) {
    console.error('monitoring error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    await client.end();
  }
}
