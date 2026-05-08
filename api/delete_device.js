import pg from 'pg';
const { Client } = pg;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { hardwareId } = req.body;

  if (!hardwareId) {
    return res.status(400).json({ error: 'Missing hardwareId' });
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
      DELETE FROM machines WHERE hardware_id = $1;
    `, [hardwareId]);

    res.status(200).json({ success: true, message: 'Device deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  } finally {
    await client.end();
  }
}
