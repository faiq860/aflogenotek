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
    
    // Ensure machines table exists and has all required columns
    await client.query(`
      CREATE TABLE IF NOT EXISTS machines (
        hardware_id TEXT PRIMARY KEY,
        machine_name TEXT,
        status TEXT,
        last_seen TIMESTAMP,
        machine_hash TEXT,
        analyzer_serial TEXT,
        authorized_machine_hash TEXT,
        authorized_analyzer_serial TEXT
      );
    `);

    // Ensure columns exist for backward compatibility
    const alterColumns = [
      'machine_hash',
      'analyzer_serial',
      'authorized_machine_hash',
      'authorized_analyzer_serial',
      'blocked_tests',
      'blocked_pages'
    ];
    for (const col of alterColumns) {
      try {
        await client.query(`ALTER TABLE machines ADD COLUMN IF NOT EXISTS ${col} TEXT;`);
      } catch (e) {
        console.log(`Column ${col} might already exist:`, e.message);
      }
    }

    // استعلام لجلب الأجهزة من جدول machines مع الحقول الأمنية الجديدة
    const result = await client.query(`
      SELECT hardware_id, machine_name, status, last_seen, 
             machine_hash, analyzer_serial, 
             authorized_machine_hash, authorized_analyzer_serial,
             blocked_tests, blocked_pages
      FROM machines
      ORDER BY last_seen DESC NULLS LAST
    `);
    
    // تحويل البيانات للشكل المطلوب في الفرونت اند
    const now = new Date();
    const devices = result.rows.map(row => {
      let isOffline = true;
      let disconnectDurationText = "";
      
      if (row.last_seen) {
        const lastSeenDate = new Date(row.last_seen);
        const diffMs = now - lastSeenDate;
        const diffMins = Math.floor(diffMs / 60000);
        
        if (diffMins < 2) {
          isOffline = false; // Connected within last 2 minutes
        } else {
          // Calculate duration
          if (diffMins < 60) {
            disconnectDurationText = `منقطع منذ ${diffMins} دقيقة`;
          } else if (diffMins < 1440) {
            disconnectDurationText = `منقطع منذ ${Math.floor(diffMins / 60)} ساعة`;
          } else {
            disconnectDurationText = `منقطع منذ ${Math.floor(diffMins / 1440)} يوم`;
          }
        }
      }

      return {
        id: row.hardware_id || "DEV-UNKNOWN",
        customer: row.machine_name || "عميل مجهول",
        device: "جهاز " + (row.hardware_id ? row.hardware_id.substring(0, 8) : "مجهول"),
        status: row.status === 'blocked' ? 'blocked' : (isOffline ? 'offline' : 'online'), 
        lastSeen: row.last_seen ? new Date(row.last_seen).toLocaleString('ar-EG') : "لم يتصل بعد",
        disconnectDuration: disconnectDurationText,
        machineHash: row.machine_hash || "مجهول",
        analyzerSerial: row.analyzer_serial || "مجهول",
        authorizedMachineHash: row.authorized_machine_hash || "مفتوح/غير مقيد",
        authorizedAnalyzerSerial: row.authorized_analyzer_serial || "مفتوح/غير مقيد",
        blocked_tests: row.blocked_tests || "",
        blocked_pages: row.blocked_pages || ""
      };
    });

    res.status(200).json(devices);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  } finally {
    await client.end();
  }
}
