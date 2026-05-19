import pg from 'pg';
import crypto from 'crypto';
const { Client } = pg;

/**
 * توليد توكن مُوقَّع لـ QR Code الحصة
 * الصيغة: BASE64( JSON({deviceId, testCode, quantity, expiresAt, nonce}) ) + "." + HMAC_SHA256
 */
function generateQuotaToken(deviceId, testCode, quantity, expiresAt) {
  const SECRET = process.env.QR_SECRET || 'GENOTEK_QUOTA_SECRET_2025';
  const nonce = crypto.randomBytes(8).toString('hex');
  
  const payload = {
    type: 'QUOTA',
    deviceId,
    testCode,
    quantity,
    expiresAt: expiresAt.toISOString(),
    nonce
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SECRET)
    .update(payloadB64)
    .digest('hex')
    .substring(0, 16); // أخذ أول 16 حرف فقط لتقصير الـ QR

  return `${payloadB64}.${signature}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { deviceId, testCode, testName, quantity, validHours } = req.body;

  if (!deviceId || !testCode || !quantity || quantity <= 0) {
    return res.status(400).json({ error: 'بيانات غير مكتملة' });
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return res.status(500).json({ error: "DATABASE_URL is not set" });
  }

  const client = new Client({ connectionString });

  try {
    await client.connect();

    // إنشاء جدول الـ tokens إن لم يكن موجوداً
    await client.query(`
      CREATE TABLE IF NOT EXISTS quota_qr_tokens (
        id SERIAL PRIMARY KEY,
        token TEXT UNIQUE NOT NULL,
        device_id TEXT NOT NULL,
        test_code TEXT NOT NULL,
        test_name TEXT,
        quantity INT NOT NULL,
        is_used BOOLEAN DEFAULT false,
        used_at TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        manual_code TEXT
      );
    `);

    // التأكد من وجود عمود manual_code لقاعدة البيانات الحالية
    try {
      await client.query(`ALTER TABLE quota_qr_tokens ADD COLUMN IF NOT EXISTS manual_code TEXT;`);
    } catch (e) {
      console.log('Column manual_code might already exist:', e.message);
    }

    const hours = validHours || 72; // صلاحية 72 ساعة افتراضياً
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + hours);

    const token = generateQuotaToken(deviceId, testCode, quantity, expiresAt);
    
    // استخراج كود يدوي قصير ومقروء من التوقيع (أول 8 أحرف بأحرف كبيرة)
    const manualCode = token.split('.')[1].substring(0, 8).toUpperCase();

    // حفظ الـ token والرمز اليدوي في قاعدة البيانات
    await client.query(`
      INSERT INTO quota_qr_tokens (token, device_id, test_code, test_name, quantity, expires_at, manual_code)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [token, deviceId, testCode, testName, quantity, expiresAt, manualCode]);

    // بناء بيانات QR Code (JSON مضغوط)
    const qrData = JSON.stringify({
      t: 'Q', // type: QUOTA
      d: deviceId,
      c: testCode,
      q: quantity,
      k: token.split('.')[1] // الـ signature فقط للتحقق
    });

    // توليد رابط QR
    const encodedData = encodeURIComponent(token);
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodedData}&bgcolor=ffffff&color=0b0f19&margin=10`;

    res.status(200).json({
      success: true,
      token,
      qrImageUrl,
      expiresAt: expiresAt.toISOString(),
      manualCode,
      details: {
        deviceId,
        testCode,
        testName: testName || testCode,
        quantity,
        validHours: hours
      }
    });

  } catch (error) {
    console.error('generate_quota_qr error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    await client.end();
  }
}
