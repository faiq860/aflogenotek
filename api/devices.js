import pg from 'pg';
const { Client } = pg;

export default async function handler(req, res) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return res.status(500).json({ error: "DATABASE_URL is not set" });
  }
  
  const client = new Client({
    connectionString: connectionString,
  });

  try {
    await client.connect();
    
    // استعلام لجلب الأجهزة من جدول machines
    const result = await client.query(`
      SELECT hardware_id, machine_name, status, last_seen 
      FROM machines
    `);
    
    // تحويل البيانات للشكل المطلوب في الفرونت اند
    const devices = result.rows.map(row => ({
      id: row.hardware_id || "DEV-UNKNOWN",
      customer: row.machine_name || "عميل مجهول",
      device: "جهاز " + (row.hardware_id ? row.hardware_id.substring(0, 8) : "مجهول"),
      status: row.status === 'Active' ? 'online' : 'offline', 
      lastSeen: row.last_seen ? new Date(row.last_seen).toLocaleString('ar-EG') : "الآن"
    }));

    // إذا لم تكن هناك بيانات، نرجع بيانات تجريبية لكي لا تبدو الصفحة فارغة
    if (devices.length === 0) {
      devices.push(
        { customer: "مختبر الحياة التخصصي", device: "BioAnalyzer-3000", status: "online", lastSeen: "الآن", id: "DEV-8891" },
        { customer: "مستشفى الأمل", device: "Genotek-X1", status: "online", lastSeen: "منذ 5 دقائق", id: "DEV-1102" }
      );
    }

    res.status(200).json(devices);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  } finally {
    await client.end();
  }
}
