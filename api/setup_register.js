const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  // CORS setup
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { machine_hash, analyzer_serial, client_name, ip_address, timestamp } = req.body;

    if (!machine_hash || !analyzer_serial || !client_name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Try to find if this device already exists
    const { data: existingDevice } = await supabase
      .from('devices')
      .select('id')
      .eq('machine_hash', machine_hash)
      .single();

    if (existingDevice) {
      // Update existing device with new details
      const { error: updateError } = await supabase
        .from('devices')
        .update({
          client_name: client_name,
          analyzer_serial: analyzer_serial,
          local_ip: ip_address,
          last_seen: new Date().toISOString()
        })
        .eq('machine_hash', machine_hash);

      if (updateError) throw updateError;
    } else {
      // Create new device record
      const { error: insertError } = await supabase
        .from('devices')
        .insert([{
          machine_hash: machine_hash,
          analyzer_serial: analyzer_serial,
          client_name: client_name,
          local_ip: ip_address,
          status: 'online',
          last_seen: new Date().toISOString()
        }]);

      if (insertError) throw insertError;
    }

    return res.status(200).json({ success: true, message: 'Setup registered successfully' });
  } catch (error) {
    console.error('Setup register error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
