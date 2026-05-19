import pg from 'pg';
import crypto from 'crypto';
const { Client } = pg;

/**
 * دالة التحقق من صحة التوقيع للتوكن
 */
function verifyTokenSignature(token) {
  const SECRET = process.env.QR_SECRET || 'GENOTEK_QUOTA_SECRET_2025';
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  
  const payloadB64 = parts[0];
  const providedSignature = parts[1];
  
  const expectedSignature = crypto
    .createHmac('sha256', SECRET)
    .update(payloadB64)
    .digest('hex')
    .substring(0, 16);
    
  return expectedSignature === providedSignature;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token, deviceId, machineHash, analyzerSerial } = req.body;

  if (!token || !deviceId) {
    return res.status(400).json({ error: 'البيانات المرسلة غير مكتملة (مطلوب التوكن ومعرف الجهاز)' });
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return res.status(500).json({ error: "DATABASE_URL is not set" });
  }

  const client = new Client({ connectionString });

  try {
    await client.connect();

    // 1️⃣ التحقق من عتاد الجهاز وهويته (Hardware Lock Security Check)
    const machineCheck = await client.query(
      'SELECT status, machine_hash, analyzer_serial, authorized_machine_hash, authorized_analyzer_serial FROM machines WHERE hardware_id = $1',
      [deviceId]
    );

    if (machineCheck.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'DEVICE_NOT_FOUND', 
        message: 'الجهاز غير مسجل في النظام السحابي' 
      });
    }

    const machine = machineCheck.rows[0];

    // إذا كان الجهاز محظوراً
    if (machine.status === 'blocked') {
      return res.status(403).json({ 
        success: false, 
        error: 'DEVICE_BLOCKED', 
        message: 'لا يمكن تفعيل حصص الفحوصات لهذا الجهاز لأنه محظور بسبب تلاعب بالعتاد' 
      });
    }

    // التحقق من سلامة البصمات (WMI / ASTM) لمنع الطلبات الخارجية المزيفة
    if (machineHash && machine.authorized_machine_hash && machine.authorized_machine_hash !== machineHash) {
      return res.status(401).json({
        success: false,
        error: 'PC_SWAP_DETECTED',
        message: 'تم كشف محاولة استخدام حاسب غير مرخص لتفعيل الفحوصات'
      });
    }

    if (analyzerSerial && machine.authorized_analyzer_serial && machine.authorized_analyzer_serial !== analyzerSerial) {
      return res.status(401).json({
        success: false,
        error: 'ANALYZER_SWAP_DETECTED',
        message: 'تم كشف محاولة استخدام جهاز كيمياء غير مطابقة للرخصة'
      });
    }

    // 2️⃣ البحث عن التوكن والتحقق من صلاحيته
    // ندعم البحث إما بالتوكن الكامل، أو بالـ signature، أو بالرمز اليدوي القصير
    const tokenKey = token.includes('.') ? token.split('.')[1] : token;

    const tokenQuery = await client.query(
      `SELECT * FROM quota_qr_tokens WHERE token LIKE $1 OR token = $2 OR UPPER(manual_code) = UPPER($2)`,
      [`%.${tokenKey}`, token]
    );

    if (tokenQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'INVALID_TOKEN',
        message: 'رمز الـ QR Code غير صحيح أو غير صادق من شركة AfloGenotek'
      });
    }

    const dbToken = tokenQuery.rows[0];

    // التحقق من صحة توقيع HMAC المشفّر للتوكن لمنع التزوير محلياً
    if (dbToken.token.includes('.') && !verifyTokenSignature(dbToken.token)) {
      return res.status(400).json({
        success: false,
        error: 'TAMPERED_TOKEN',
        message: 'تم كشف تلاعب بتوقيع الـ QR Code البرمجي'
      });
    }

    // 3️⃣ منع التكرار / إعادة الاستخدام (Anti-Replay / Double-Spend Prevention)
    if (dbToken.is_used) {
      return res.status(409).json({
        success: false,
        error: 'QR_ALREADY_USED',
        message: `هذا الـ QR Code قد تم استخدامه وتفعيله مسبقاً بتاريخ ${new Date(dbToken.used_at).toLocaleString('ar-EG')}`,
        usedAt: dbToken.used_at
      });
    }

    // 4️⃣ التحقق من انتهاء الصلاحية الزمنية للـ QR Code
    if (new Date(dbToken.expires_at) < new Date()) {
      return res.status(410).json({
        success: false,
        error: 'QR_EXPIRED',
        message: 'انتهت صلاحية الـ QR Code الزمنية ولا يمكن تفعيله الآن',
        expiresAt: dbToken.expires_at
      });
    }

    // 5️⃣ التحقق من تقييد الجهاز (إذا كان الـ QR مخصصاً لجهاز معين فقط)
    if (dbToken.device_id && dbToken.device_id !== 'GLOBAL' && dbToken.device_id !== deviceId) {
      return res.status(403).json({
        success: false,
        error: 'QR_DEVICE_RESTRICTED',
        message: 'هذا الـ QR Code مخصص لجهاز فحص آخر ولا يمكن تفعيله على هذا الجهاز'
      });
    }

    // 6️⃣ تفعيل التوكن وشحن الحصص (Atomic Transaction)
    await client.query('BEGIN');

    // أ: وسم التوكن بأنه مستخدم
    await client.query(
      `UPDATE quota_qr_tokens SET is_used = true, used_at = NOW() WHERE id = $1`,
      [dbToken.id]
    );

    // ب: شحن رصيد الفحص للجهاز في جدول test_quotas
    await client.query(`
      INSERT INTO test_quotas (device_id, test_code, test_name, total_quota, used_count, alert_threshold)
      VALUES ($1, $2, $3, $4, 0, 20)
      ON CONFLICT (device_id, test_code) DO UPDATE
      SET total_quota = test_quotas.total_quota + $4,
          updated_at = NOW()
    `, [deviceId, dbToken.test_code, dbToken.test_name || dbToken.test_code, dbToken.quantity]);

    await client.query('COMMIT');

    res.status(200).json({
      success: true,
      message: 'تم تفعيل الـ QR Code وشحن الحصة بنجاح سحابياً!',
      details: {
        testCode: dbToken.test_code,
        quantity: dbToken.quantity,
        totalQuotaAdded: dbToken.quantity,
        activatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('claim_quota_qr error:', error);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: error.message });
  } finally {
    await client.end();
  }
}
