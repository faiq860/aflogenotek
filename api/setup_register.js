import pg from 'pg';
const { Client } = pg;

export default async function handler(req, res) {
  // CORS setup
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { machine_hash, analyzer_serial, client_name, ip_address, timestamp } = req.body;

    if (!machine_hash || !client_name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      return res.status(500).json({ error: "DATABASE_URL is not set" });
    }
    
    const client = new Client({
      connectionString: connectionString,
    });

    await client.connect();

    // Ensure machines table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS machines (
        hardware_id TEXT PRIMARY KEY,
        machine_name TEXT,
        status TEXT,
        last_seen TIMESTAMP,
        machine_hash TEXT,
        analyzer_serial TEXT,
        authorized_machine_hash TEXT,
        authorized_analyzer_serial TEXT,
        blocked_tests TEXT,
        blocked_pages TEXT
      );
    `);

    // We use a short hash as hardware_id for now if not provided, or we can use the full hash
    const hardwareId = machine_hash.substring(0, 12);

    // Try to find if this device already exists
    const checkRes = await client.query('SELECT hardware_id FROM machines WHERE machine_hash = $1 OR hardware_id = $2', [machine_hash, hardwareId]);

    if (checkRes.rows.length > 0) {
      const existingId = checkRes.rows[0].hardware_id;
      // Update existing device
      await client.query(
        `UPDATE machines 
         SET machine_name = $1, analyzer_serial = $2, authorized_machine_hash = $3, authorized_analyzer_serial = $4, status = 'online', last_seen = NOW()
         WHERE hardware_id = $5`,
        [client_name, analyzer_serial || '', machine_hash, analyzer_serial || '', existingId]
      );
    } else {
      // Create new device record
      await client.query(
        `INSERT INTO machines (hardware_id, machine_name, status, last_seen, machine_hash, analyzer_serial, authorized_machine_hash, authorized_analyzer_serial, blocked_tests, blocked_pages)
         VALUES ($1, $2, 'online', NOW(), $3, $4, $3, $4, '', '')`,
        [hardwareId, client_name, machine_hash, analyzer_serial || '']
      );
    }

    await client.end();
    return res.status(200).json({ success: true, message: 'Setup registered successfully' });
  } catch (error) {
    console.error('Setup register error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
