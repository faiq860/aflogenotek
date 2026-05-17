import pg from 'pg';
const { Client } = pg;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { HardwareId, CustomerName, DeviceName, Status, MachineHash, machine_hash, AnalyzerSerial, analyzer_serial } = req.body;

  if (!HardwareId) {
    return res.status(400).json({ error: 'Missing HardwareId' });
  }

  const incomingMachineHash = MachineHash || machine_hash || '';
  const incomingAnalyzerSerial = AnalyzerSerial || analyzer_serial || '';

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return res.status(500).json({ error: "DATABASE_URL is not set" });
  }
  
  const client = new Client({
    connectionString: connectionString,
  });

  try {
    await client.connect();
    
    // 1. Ensure machines table exists and has all required columns
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
      'authorized_analyzer_serial'
    ];
    for (const col of alterColumns) {
      try {
        await client.query(`ALTER TABLE machines ADD COLUMN IF NOT EXISTS ${col} TEXT;`);
      } catch (e) {
        console.log(`Column ${col} might already exist:`, e.message);
      }
    }

    // 2. Fetch current machine authorization details
    const selectRes = await client.query(`
      SELECT authorized_machine_hash, authorized_analyzer_serial FROM machines WHERE hardware_id = $1
    `, [HardwareId]);

    let authorizedMachineHash = null;
    let authorizedAnalyzerSerial = null;

    if (selectRes.rows.length > 0) {
      authorizedMachineHash = selectRes.rows[0].authorized_machine_hash;
      authorizedAnalyzerSerial = selectRes.rows[0].authorized_analyzer_serial;
    }

    // 3. Self-Registration / Binding on first heartbeat if null
    if (selectRes.rows.length === 0) {
      // Create new device and bind immediately
      await client.query(`
        INSERT INTO machines (
          hardware_id, machine_name, status, last_seen, 
          machine_hash, analyzer_serial, 
          authorized_machine_hash, authorized_analyzer_serial
        )
        VALUES ($1, $2, $3, NOW(), $4, $5, $4, $5)
      `, [HardwareId, CustomerName || DeviceName, Status || 'online', incomingMachineHash, incomingAnalyzerSerial]);
      
      return res.status(200).json({ success: true, message: 'Device registered and bound successfully' });
    }

    // If exists but authorized hashes are null, bind them now!
    if (!authorizedMachineHash && incomingMachineHash) {
      await client.query(`
        UPDATE machines SET authorized_machine_hash = $1 WHERE hardware_id = $2
      `, [incomingMachineHash, HardwareId]);
      authorizedMachineHash = incomingMachineHash;
    }

    if (!authorizedAnalyzerSerial && incomingAnalyzerSerial) {
      await client.query(`
        UPDATE machines SET authorized_analyzer_serial = $1 WHERE hardware_id = $2
      `, [incomingAnalyzerSerial, HardwareId]);
      authorizedAnalyzerSerial = incomingAnalyzerSerial;
    }

    // 4. Verification Check
    // PC Swap Check
    if (authorizedMachineHash && incomingMachineHash && authorizedMachineHash !== incomingMachineHash) {
      await client.query(`
        UPDATE machines SET status = 'blocked', last_seen = NOW() WHERE hardware_id = $1
      `, [HardwareId]);
      return res.status(401).json({ 
        success: false, 
        error: 'PC_SWAP_DETECTED', 
        message: 'Unauthorized PC swap detected! Heartbeat rejected.' 
      });
    }

    // Analyzer Swap Check
    if (
      authorizedAnalyzerSerial && 
      incomingAnalyzerSerial && 
      incomingAnalyzerSerial !== 'UNKNOWN_SERIAL' && 
      authorizedAnalyzerSerial !== 'UNKNOWN_SERIAL' && 
      authorizedAnalyzerSerial !== incomingAnalyzerSerial
    ) {
      await client.query(`
        UPDATE machines SET status = 'blocked', last_seen = NOW() WHERE hardware_id = $1
      `, [HardwareId]);
      return res.status(401).json({ 
        success: false, 
        error: 'ANALYZER_SWAP_DETECTED', 
        message: 'Unauthorized chemistry analyzer swap detected! Heartbeat rejected.' 
      });
    }

    // 5. Update last_seen, active status and current telemetry hashes
    await client.query(`
      UPDATE machines 
      SET status = $1, last_seen = NOW(), machine_name = COALESCE($2, machine_name),
          machine_hash = $3, analyzer_serial = $4
      WHERE hardware_id = $5
    `, [Status || 'online', CustomerName || DeviceName, incomingMachineHash, incomingAnalyzerSerial, HardwareId]);

    res.status(200).json({ success: true, message: 'Heartbeat received and verified successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  } finally {
    await client.end();
  }
}
