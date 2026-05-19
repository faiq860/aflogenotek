import pg from 'pg';
const { Client } = pg;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { qrHash, testId, quantity, deviceId } = req.body;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return res.status(500).json({ error: "DATABASE_URL is not set" });
  }
  
  const client = new Client({
    connectionString: connectionString,
  });

  try {
    await client.connect();
    
    // إنشاء الجدول إذا لم يكن موجوداً
    await client.query(`
      CREATE TABLE IF NOT EXISTS allowed_qr (
        qr_hash TEXT PRIMARY KEY,
        test_id TEXT,
        quantity INT,
        expires_at TIMESTAMP,
        created_by TEXT,
        max_usage INT,
        usage_count INT DEFAULT 0,
        device_id TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // التأكد من وجود الأعمدة الهامة في حال كان الجدول موجوداً مسبقاً
    try {
      await client.query(`ALTER TABLE allowed_qr ADD COLUMN IF NOT EXISTS created_by TEXT;`);
      await client.query(`ALTER TABLE allowed_qr ADD COLUMN IF NOT EXISTS device_id TEXT;`);
      await client.query(`ALTER TABLE allowed_qr ADD COLUMN IF NOT EXISTS max_usage INT DEFAULT 1;`);
      await client.query(`ALTER TABLE allowed_qr ADD COLUMN IF NOT EXISTS used BOOLEAN DEFAULT false;`);
    } catch (e) {
      console.log("Columns might already exist or error adding them:", e.message);
    }

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 30); // صلاحية 30 دقيقة

    await client.query(`
      INSERT INTO allowed_qr (qr_hash, test_id, quantity, expires_at, created_by, max_usage, device_id, used)
      VALUES ($1, $2, $3, $4, $5, $6, $7, false)
      ON CONFLICT (qr_hash) DO UPDATE 
      SET test_id = $2, quantity = $3, expires_at = $4, max_usage = $6, device_id = $7, used = false;
    `, [qrHash, testId, quantity, expiresAt, 'Dashboard (aflo)', 1, deviceId]);

    res.status(200).json({ success: true, message: 'QR Code registered successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  } finally {
    await client.end();
  }
}
