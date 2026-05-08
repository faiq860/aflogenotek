import pg from 'pg';
const { Client } = pg;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { hardwareId, machineName } = req.body;

  if (!hardwareId || !machineName) {
    return res.status(400).json({ error: 'Missing hardwareId or machineName' });
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return res.status(500).json({ error: "DATABASE_URL is not set" });
  }
  
  const client = new Client({
    connectionString: connectionString,
  });

  try {
    await client.connect();
    
    await client.query(`
      INSERT INTO machines (hardware_id, machine_name, status, last_seen)
      VALUES ($1, $2, 'Active', NOW())
      ON CONFLICT (hardware_id) DO UPDATE 
      SET machine_name = $2, last_seen = NOW();
    `, [hardwareId, machineName]);

    res.status(200).json({ success: true, message: 'Device registered successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  } finally {
    await client.end();
  }
}
