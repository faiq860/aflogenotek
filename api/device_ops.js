import pg from 'pg';
const { Client } = pg;

// Merged: delete_device + update_device
// POST body must include { action: 'delete' | 'update' | 'reset_lock', hardwareId, ...fields }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, hardwareId, customerName, resetHardwareLock } = req.body;

  if (!hardwareId) {
    return res.status(400).json({ error: 'Missing hardwareId' });
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return res.status(500).json({ error: 'DATABASE_URL is not set' });
  }

  const client = new Client({ connectionString });

  try {
    await client.connect();

    // ── DELETE ────────────────────────────────────────────────────────────────
    if (action === 'delete') {
      await client.query(`DELETE FROM machines WHERE hardware_id = $1`, [hardwareId]);
      return res.status(200).json({ success: true, message: 'Device deleted successfully' });
    }

    // ── RESET HARDWARE LOCK ───────────────────────────────────────────────────
    if (action === 'reset_lock' || resetHardwareLock) {
      await client.query(`
        UPDATE machines
        SET authorized_machine_hash = NULL,
            authorized_analyzer_serial = NULL,
            status = 'online'
        WHERE hardware_id = $1
      `, [hardwareId]);
      return res.status(200).json({ success: true, message: 'Hardware lock reset successfully! Ready to bind new PC/Analyzer.' });
    }

    // ── UPDATE BLOCKING RULES ────────────────────────────────────────────────
    if (action === 'update_blocking') {
      const { blocked_tests, blocked_pages } = req.body;
      await client.query(
        `UPDATE machines SET blocked_tests = $1, blocked_pages = COALESCE(NULLIF($2, ''), blocked_pages) WHERE hardware_id = $3`,
        [blocked_tests ?? '', blocked_pages ?? '', hardwareId]
      );
      return res.status(200).json({ success: true, message: 'Blocking rules updated' });
    }

    // ── UPDATE (rename customer) ──────────────────────────────────────────────
    if (!customerName) {
      return res.status(400).json({ error: 'Missing customerName' });
    }
    await client.query(`UPDATE machines SET machine_name = $1 WHERE hardware_id = $2`, [customerName, hardwareId]);
    return res.status(200).json({ success: true, message: 'Device updated successfully' });

  } catch (error) {
    console.error('device_ops error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    await client.end();
  }
}
