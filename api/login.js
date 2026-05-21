export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username, password } = req.body;
  
  const validUsername = "afloadmin";
  const validPassword = "aflo_genotek0987";
  
  if (username === validUsername && password === validPassword) {
    res.status(200).json({ success: true });
  } else {
    res.status(401).json({ success: false, error: "بيانات الدخول غير صحيحة!" });
  }
}
