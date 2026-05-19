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

    // Try to find if this device already exists
    const checkRes = await client.query('SELECT id FROM devices WHERE machine_hash = $1', [machine_hash]);

    if (checkRes.rows.length > 0) {
      // Update existing device
      await client.query(
        `UPDATE devices 
         SET customer_name = $1, analyzer_serial = $2, device_name = $3, status = 'online', last_seen = NOW()
         WHERE machine_hash = $4`,
        [client_name, analyzer_serial || '', ip_address || '', machine_hash]
      );
    } else {
      // Create new device record (we map client_name to customer_name)
      await client.query(
        `INSERT INTO devices (hardware_id, customer_name, device_name, status, last_seen, machine_hash, analyzer_serial)
         VALUES ($1, $2, $3, 'online', NOW(), $4, $5)`,
        [machine_hash.substring(0, 8), client_name, ip_address || '', machine_hash, analyzer_serial || '']
      );
    }

    await client.end();
    return res.status(200).json({ success: true, message: 'Setup registered successfully' });
  } catch (error) {
    console.error('Setup register error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
