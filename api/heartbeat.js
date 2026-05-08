import pg from 'pg';
const { Client } = pg;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { HardwareId, CustomerName, DeviceName, Status } = req.body;

  if (!HardwareId) {
    return res.status(400).json({ error: 'Missing HardwareId' });
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
    
    // تحديث أو إدخال الجهاز
    await client.query(`
      INSERT INTO machines (hardware_id, machine_name, status, last_seen)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (hardware_id) DO UPDATE 
      SET status = $3, last_seen = NOW(), machine_name = COALESCE($2, machines.machine_name);
    `, [HardwareId, CustomerName || DeviceName, Status || 'online']);

    res.status(200).json({ success: true, message: 'Heartbeat received' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  } finally {
    await client.end();
  }
}
