import pg from 'pg';
const { Client } = pg;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { hardwareId, customerName } = req.body;

  if (!hardwareId || !customerName) {
    return res.status(400).json({ error: 'Missing hardwareId or customerName' });
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
      UPDATE machines SET machine_name = $1 WHERE hardware_id = $2;
    `, [customerName, hardwareId]);

    res.status(200).json({ success: true, message: 'Device updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  } finally {
    await client.end();
  }
}
