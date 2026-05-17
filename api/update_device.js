import pg from 'pg';
const { Client } = pg;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { hardwareId, customerName, resetHardwareLock } = req.body;

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
    
    if (resetHardwareLock) {
      // إعادة تعيين القفل المزدوج للسماح بربط جهاز/كمبيوتر جديد تلقائياً
      await client.query(`
        UPDATE machines 
        SET authorized_machine_hash = NULL, 
            authorized_analyzer_serial = NULL, 
            status = 'online'
        WHERE hardware_id = $1;
      `, [hardwareId]);

      res.status(200).json({ success: true, message: 'Hardware lock reset successfully! Ready to bind new PC/Analyzer.' });
    } else {
      if (!customerName) {
        return res.status(400).json({ error: 'Missing customerName' });
      }

      await client.query(`
        UPDATE machines SET machine_name = $1 WHERE hardware_id = $2;
      `, [customerName, hardwareId]);

      res.status(200).json({ success: true, message: 'Device updated successfully' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  } finally {
    await client.end();
  }
}
