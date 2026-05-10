import pg from 'pg';
const { Client } = pg;

// جدول أنواع الفحوصات المدعومة
const TEST_TYPES = [
  { code: 'GLU', name: 'Glucose - سكر الدم' },
  { code: 'CBC', name: 'CBC - تعداد الدم الكامل' },
  { code: 'CRE', name: 'Creatinine - الكرياتينين' },
  { code: 'CHOL', name: 'Cholesterol - الكوليسترول' },
  { code: 'URIC', name: 'Uric Acid - حمض اليوريك' },
  { code: 'HBA1C', name: 'HbA1c - السكر التراكمي' },
  { code: 'TSH', name: 'TSH - الغدة الدرقية' },
  { code: 'UA', name: 'Urinalysis - تحليل البول' },
  { code: 'LFT', name: 'Liver Function - وظائف الكبد' },
  { code: 'KFT', name: 'Kidney Function - وظائف الكلى' },
];

async function ensureTablesExist(client) {
  // جدول الفحوصات المدعومة
  await client.query(`
    CREATE TABLE IF NOT EXISTS test_definitions (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // جدول حصص الفحوصات لكل جهاز
  await client.query(`
    CREATE TABLE IF NOT EXISTS test_quotas (
      id SERIAL PRIMARY KEY,
      device_id TEXT NOT NULL REFERENCES machines(hardware_id) ON DELETE CASCADE,
      test_code TEXT NOT NULL,
      test_name TEXT NOT NULL,
      total_quota BIGINT DEFAULT 0,
      used_count BIGINT DEFAULT 0,
      alert_threshold INT DEFAULT 20,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(device_id, test_code)
    );
  `);

  // جدول سجل توليد QR Codes للفحوصات
  await client.query(`
    CREATE TABLE IF NOT EXISTS quota_qr_tokens (
      id SERIAL PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      device_id TEXT NOT NULL,
      test_code TEXT NOT NULL,
      quantity INT NOT NULL,
      is_used BOOLEAN DEFAULT false,
      used_at TIMESTAMP,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // إدراج الفحوصات الافتراضية إن لم تكن موجودة
  for (const t of TEST_TYPES) {
    await client.query(`
      INSERT INTO test_definitions (code, name) VALUES ($1, $2)
      ON CONFLICT (code) DO NOTHING;
    `, [t.code, t.name]);
  }
}

export default async function handler(req, res) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return res.status(500).json({ error: "DATABASE_URL is not set" });
  }

  const client = new Client({ connectionString });

  try {
    await client.connect();
    await ensureTablesExist(client);

    if (req.method === 'GET') {
      // جلب حصص جهاز معين
      const url = new URL(req.url, `http://${req.headers.host}`);
      const deviceId = url.searchParams.get('device_id');

      if (!deviceId) {
        // جلب كل الأنواع المتاحة للفحوصات
        const result = await client.query('SELECT * FROM test_definitions ORDER BY code');
        return res.status(200).json({ testTypes: result.rows });
      }

      const result = await client.query(`
        SELECT q.*, d.name as test_display_name
        FROM test_quotas q
        LEFT JOIN test_definitions d ON q.test_code = d.code
        WHERE q.device_id = $1
        ORDER BY q.test_code
      `, [deviceId]);

      return res.status(200).json({ quotas: result.rows });

    } else if (req.method === 'POST') {
      const { action, deviceId, testCode, testName, totalQuota, alertThreshold } = req.body;

      if (action === 'upsert') {
        // إضافة أو تحديث حصة فحص
        await client.query(`
          INSERT INTO test_quotas (device_id, test_code, test_name, total_quota, alert_threshold)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (device_id, test_code) DO UPDATE
          SET total_quota = test_quotas.total_quota + $4,
              test_name = $3,
              alert_threshold = $5,
              updated_at = NOW()
        `, [deviceId, testCode, testName, totalQuota, alertThreshold || 20]);

        return res.status(200).json({ success: true, message: 'تم تحديث حصة الفحص بنجاح' });

      } else if (action === 'reset_quota') {
        // إعادة تعيين الحصة (عند مسح QR جديد)
        const { quantity } = req.body;
        await client.query(`
          UPDATE test_quotas
          SET total_quota = total_quota + $1, updated_at = NOW()
          WHERE device_id = $2 AND test_code = $3
        `, [quantity, deviceId, testCode]);

        return res.status(200).json({ success: true, message: 'تم تجديد الرصيد بنجاح' });

      } else if (action === 'increment_usage') {
        // زيادة عداد الاستخدام (يُستدعى من Edge Node)
        await client.query(`
          UPDATE test_quotas
          SET used_count = used_count + 1, updated_at = NOW()
          WHERE device_id = $1 AND test_code = $2
        `, [deviceId, testCode]);

        const result = await client.query(`
          SELECT total_quota, used_count, alert_threshold FROM test_quotas
          WHERE device_id = $1 AND test_code = $2
        `, [deviceId, testCode]);

        if (result.rows.length > 0) {
          const quota = result.rows[0];
          const remaining = Number(quota.total_quota) - Number(quota.used_count);
          const percentLeft = quota.total_quota > 0 ? (remaining / quota.total_quota) * 100 : 0;
          const needsRenewal = remaining <= 0;
          const lowWarning = percentLeft <= (quota.alert_threshold || 20);

          return res.status(200).json({
            success: true,
            remaining,
            percentLeft: Math.round(percentLeft),
            needsRenewal,
            lowWarning
          });
        }

        return res.status(200).json({ success: true });

      } else if (action === 'delete') {
        await client.query(`
          DELETE FROM test_quotas WHERE device_id = $1 AND test_code = $2
        `, [deviceId, testCode]);

        return res.status(200).json({ success: true, message: 'تم حذف الفحص بنجاح' });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('test_quotas error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    await client.end();
  }
}
