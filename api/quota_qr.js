import pg from 'pg';
import crypto from 'crypto';
const { Client } = pg;

// Merged: generate_quota_qr + claim_quota_qr
// POST body must include { action: 'generate' | 'claim', ...fields }

// ── Token helpers ─────────────────────────────────────────────────────────────

function generateQuotaToken(deviceId, testCode, quantity, expiresAt) {
  const SECRET = process.env.QR_SECRET || 'GENOTEK_QUOTA_SECRET_2025';
  const nonce = crypto.randomBytes(8).toString('hex');
  const payload = { type: 'QUOTA', deviceId, testCode, quantity, expiresAt: expiresAt.toISOString(), nonce };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SECRET).update(payloadB64).digest('hex').substring(0, 16);
  return `${payloadB64}.${signature}`;
}

function verifyTokenSignature(token) {
  const SECRET = process.env.QR_SECRET || 'GENOTEK_QUOTA_SECRET_2025';
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const expected = crypto.createHmac('sha256', SECRET).update(parts[0]).digest('hex').substring(0, 16);
  return expected === parts[1];
}

async function ensureQuotaTables(client) {
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
  try { await client.query(`ALTER TABLE quota_qr_tokens ADD COLUMN IF NOT EXISTS manual_code TEXT;`); } catch {}
}

// ── GENERATE handler ──────────────────────────────────────────────────────────

async function handleGenerate(req, res, client) {
  const { deviceId, testCode, testName, quantity, validHours } = req.body;

  if (!deviceId || !testCode || !quantity || quantity <= 0) {
    return res.status(400).json({ error: 'بيانات غير مكتملة' });
  }

  await ensureQuotaTables(client);

  const hours = validHours || 72;
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + hours);

  const token = generateQuotaToken(deviceId, testCode, quantity, expiresAt);
  const manualCode = token.split('.')[1].substring(0, 8).toUpperCase();

  await client.query(`
    INSERT INTO quota_qr_tokens (token, device_id, test_code, test_name, quantity, expires_at, manual_code)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [token, deviceId, testCode, testName, quantity, expiresAt, manualCode]);

  try {
    await client.query(`
      INSERT INTO allowed_qr (qr_hash, test_id, quantity, expires_at, device_id, used)
      VALUES ($1, $2, $3, $4, 'UNIFIED', false)
      ON CONFLICT (qr_hash) DO NOTHING
    `, [manualCode, testCode, quantity, expiresAt]);
  } catch {}

  const encodedData = encodeURIComponent(manualCode);
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodedData}&bgcolor=ffffff&color=0b0f19&margin=10`;

  return res.status(200).json({
    success: true, token, qrImageUrl,
    expiresAt: expiresAt.toISOString(), manualCode,
    details: { deviceId, testCode, testName: testName || testCode, quantity, validHours: hours }
  });
}

// ── CLAIM handler ─────────────────────────────────────────────────────────────

async function handleClaim(req, res, client) {
  const { token, deviceId, machineHash, analyzerSerial } = req.body;

  if (!token || !deviceId) {
    return res.status(400).json({ error: 'البيانات المرسلة غير مكتملة (مطلوب التوكن ومعرف الجهاز)' });
  }

  const machineCheck = await client.query(
    'SELECT status, authorized_machine_hash, authorized_analyzer_serial FROM machines WHERE hardware_id = $1',
    [deviceId]
  );

  if (machineCheck.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'DEVICE_NOT_FOUND', message: 'الجهاز غير مسجل في النظام السحابي' });
  }

  const machine = machineCheck.rows[0];

  if (machine.status === 'blocked') {
    return res.status(403).json({ success: false, error: 'DEVICE_BLOCKED', message: 'الجهاز محظور بسبب تلاعب بالعتاد' });
  }

  if (machineHash && machine.authorized_machine_hash && machine.authorized_machine_hash !== machineHash) {
    return res.status(401).json({ success: false, error: 'PC_SWAP_DETECTED', message: 'تم كشف محاولة استخدام حاسب غير مرخص' });
  }

  if (analyzerSerial && machine.authorized_analyzer_serial && machine.authorized_analyzer_serial !== analyzerSerial) {
    return res.status(401).json({ success: false, error: 'ANALYZER_SWAP_DETECTED', message: 'تم كشف جهاز كيمياء غير مطابق للرخصة' });
  }

  const tokenKey = token.includes('.') ? token.split('.')[1] : token;
  const tokenQuery = await client.query(
    `SELECT * FROM quota_qr_tokens WHERE token LIKE $1 OR token = $2 OR UPPER(manual_code) = UPPER($2)`,
    [`%.${tokenKey}`, token]
  );

  if (tokenQuery.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'INVALID_TOKEN', message: 'رمز الـ QR Code غير صحيح' });
  }

  const dbToken = tokenQuery.rows[0];

  if (dbToken.token.includes('.') && !verifyTokenSignature(dbToken.token)) {
    return res.status(400).json({ success: false, error: 'TAMPERED_TOKEN', message: 'تم كشف تلاعب بتوقيع الـ QR Code' });
  }

  if (dbToken.is_used) {
    return res.status(409).json({
      success: false, error: 'QR_ALREADY_USED',
      message: `هذا الـ QR Code قد تم استخدامه بتاريخ ${new Date(dbToken.used_at).toLocaleString('ar-EG')}`,
      usedAt: dbToken.used_at
    });
  }

  if (new Date(dbToken.expires_at) < new Date()) {
    return res.status(410).json({ success: false, error: 'QR_EXPIRED', message: 'انتهت صلاحية الـ QR Code', expiresAt: dbToken.expires_at });
  }

  if (dbToken.device_id && dbToken.device_id !== 'GLOBAL' && dbToken.device_id !== deviceId) {
    return res.status(403).json({ success: false, error: 'QR_DEVICE_RESTRICTED', message: 'هذا الـ QR Code مخصص لجهاز آخر' });
  }

  await client.query('BEGIN');
  await client.query(`UPDATE quota_qr_tokens SET is_used = true, used_at = NOW() WHERE id = $1`, [dbToken.id]);
  await client.query(`
    INSERT INTO test_quotas (device_id, test_code, test_name, total_quota, used_count, alert_threshold)
    VALUES ($1, $2, $3, $4, 0, 20)
    ON CONFLICT (device_id, test_code) DO UPDATE
    SET total_quota = test_quotas.total_quota + $4, updated_at = NOW()
  `, [deviceId, dbToken.test_code, dbToken.test_name || dbToken.test_code, dbToken.quantity]);
  await client.query('COMMIT');

  return res.status(200).json({
    success: true,
    message: 'تم تفعيل الـ QR Code وشحن الحصة بنجاح!',
    details: { testCode: dbToken.test_code, quantity: dbToken.quantity, activatedAt: new Date().toISOString() }
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return res.status(500).json({ error: 'DATABASE_URL is not set' });

  const { action } = req.body;
  if (!action || !['generate', 'claim'].includes(action)) {
    return res.status(400).json({ error: 'Missing or invalid action (generate | claim)' });
  }

  const client = new Client({ connectionString });
  try {
    await client.connect();
    if (action === 'generate') return await handleGenerate(req, res, client);
    if (action === 'claim')    return await handleClaim(req, res, client);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('quota_qr error:', error);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: error.message });
  } finally {
    await client.end();
  }
}
