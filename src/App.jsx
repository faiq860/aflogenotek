import { useState, useEffect, useCallback } from 'react'
import './App.css'
import QuotaManager from './QuotaManager'

// ─── helpers ─────────────────────────────────────────────────────────────────
const hoursAgo = (ts) => {
  if (!ts) return Infinity
  return (Date.now() - new Date(ts).getTime()) / 3600000
}

const formatDuration = (ts) => {
  if (!ts) return '—'
  const h = Math.floor(hoursAgo(ts))
  if (h < 1)  return 'Just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ${h % 24}h ago`
}

const TEST_GROUPS = {
  'RFT (Renal)':  ['BUN', 'CREATININE', 'URIC_ACID'],
  'LFT (Liver)':  ['AST', 'ALT', 'BILIRUBIN_TOTAL', 'ALBUMIN', 'TOTAL_PROTEIN'],
  'LIPIDS':       ['CHOLESTEROL', 'TRIGLYCERIDES', 'HDL', 'LDL'],
  'TFT (Thyroid)':['TSH', 'FREE_T4'],
  'ELECTROLYTES': ['SODIUM', 'POTASSIUM', 'CHLORIDE'],
  'MINERALS':     ['CALCIUM', 'PHOSPHORUS'],
}

const ALL_TESTS = [
  'GLUCOSE','ALBUMIN','TOTAL_PROTEIN','AST','ALT','BILIRUBIN_TOTAL',
  'CREATININE','BUN','CALCIUM','PHOSPHORUS','SODIUM','POTASSIUM','CHLORIDE',
  'TRIGLYCERIDES','CHOLESTEROL','HDL','LDL','TSH','FREE_T4','URIC_ACID','GLUCOSE_FASTING'
]

// ─── mock data ────────────────────────────────────────────────────────────────
const MOCK = [
  { customer:'مختبر الحياة التخصصي', device:'BioAnalyzer-3000', status:'online',  id:'DEV-8891', lastSeen: new Date().toISOString(), blocked_tests:'', authorizedMachineHash:'PC-A1B2C3' },
  { customer:'مستشفى الأمل',          device:'Genotek-X1',       status:'online',  id:'DEV-1102', lastSeen: new Date(Date.now()-3*3600000).toISOString(), blocked_tests:'GLUCOSE,AST', authorizedMachineHash:'PC-D4E5F6' },
  { customer:'مختبر بابل المركزي',    device:'BioAnalyzer-2000', status:'offline', id:'DEV-0045', lastSeen: new Date(Date.now()-96*3600000).toISOString(), blocked_tests:'', authorizedMachineHash:'PC-G7H8I9' },
  { customer:'عيادة الشفاء',          device:'Genotek-X1',       status:'online',  id:'DEV-7762', lastSeen: new Date(Date.now()-60*60000).toISOString(), blocked_tests:'CREATININE', authorizedMachineHash:'PC-J1K2L3' },
]

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [isLoggedIn,        setIsLoggedIn]        = useState(false)
  const [username,          setUsername]           = useState('')
  const [password,          setPassword]           = useState('')
  const [error,             setError]              = useState('')
  const [devices,           setDevices]            = useState([])
  const [notifications,     setNotifications]      = useState([])
  const [showNotifPanel,    setShowNotifPanel]      = useState(false)
  const [modalOpen,         setModalOpen]           = useState(false)
  const [editModalOpen,     setEditModalOpen]       = useState(false)
  const [currentDevice,     setCurrentDevice]       = useState(null)
  const [newCustomerName,   setNewCustomerName]     = useState('')
  const [modalTitle,        setModalTitle]          = useState('')
  const [modalDesc,         setModalDesc]           = useState('')
  const [manualCode,        setManualCode]          = useState('------')
  const [qrSrc,             setQrSrc]              = useState('')
  const [hardwareIdParam,   setHardwareIdParam]     = useState('')
  const [registerModalOpen, setRegisterModalOpen]   = useState(false)
  const [quotaDevice,       setQuotaDevice]         = useState(null)
  const [firstInstallModal, setFirstInstallModal]   = useState(false)
  const [fiDevice,          setFiDevice]            = useState(null)
  const [fiTests,           setFiTests]             = useState({})
  const [fiGroup,           setFiGroup]             = useState('')
  const [fiGroupQty,        setFiGroupQty]          = useState(100)
  const [activeTab,         setActiveTab]           = useState('devices')
  const [activityDevice,    setActivityDevice]      = useState(null)

  // ── fetch helpers ────────────────────────────────────────────────────────────
  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch('/api/devices')
      const data = res.ok ? await res.json() : MOCK
      setDevices(data)
      buildNotifications(data)
    } catch { setDevices(MOCK); buildNotifications(MOCK) }
  }, [])

  const buildNotifications = (devList) => {
    const notifs = []
    devList.forEach(d => {
      const h = hoursAgo(d.lastSeen || d.last_seen)
      if (h > 48) {
        notifs.push({
          id: d.id,
          type: 'offline',
          message: `${d.customer} — منقطع منذ ${Math.floor(h)}h`,
          device: d
        })
        // Persist to server (fire-and-forget; server deduplicates within 24h)
        fetch('/api/monitoring?scope=notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create',
            hardware_id: d.id,
            machine_name: d.customer,
            type: 'offline_48h',
            message: `${d.customer} — منقطع منذ ${Math.floor(h)} ساعة`
          })
        }).catch(() => {})
      }
    })
    setNotifications(notifs)
  }

  useEffect(() => {
    const logged = localStorage.getItem('isLoggedIn') === 'true'
    setIsLoggedIn(logged)
    if (logged) fetchDevices()

    const params = new URLSearchParams(window.location.search)
    const hwId = params.get('hardware_id')
    if (hwId) { setHardwareIdParam(hwId); setRegisterModalOpen(true) }
  }, [fetchDevices])

  // Auto-refresh every 2 minutes
  useEffect(() => {
    if (!isLoggedIn) return
    const t = setInterval(fetchDevices, 120000)
    return () => clearInterval(t)
  }, [isLoggedIn, fetchDevices])

  // ── login / logout ────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    try {
      const res = await fetch('/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      const data = await res.json()
      if (data.success) {
        localStorage.setItem('isLoggedIn', 'true')
        setIsLoggedIn(true); setError(''); fetchDevices()
      } else { setError(data.error || 'بيانات الدخول غير صحيحة!') }
    } catch { setError('حدث خطأ أثناء الاتصال بالسيرفر') }
  }

  const handleLogout = () => { localStorage.setItem('isLoggedIn', 'false'); setIsLoggedIn(false) }

  // ── QR generation ─────────────────────────────────────────────────────────────
  const generateQR = async (type, deviceId, customerName) => {
    const randomCode = Math.floor(1000000000 + Math.random() * 9000000000)
    setManualCode(randomCode.toString())
    const title = type === 'unlock'
      ? `🔑 فك حجب جهاز: ${deviceId}`
      : `🧪 إضافة فحص لجهاز: ${deviceId}`
    const desc = type === 'unlock'
      ? `هذا الرمز مخصص لفتح حجب النظام في ${customerName} لمدة 30 دقيقة.`
      : `شحن رصيد فحوصات في ${customerName}.`
    const dataToEncode = JSON.stringify({
      testId: type === 'unlock' ? 'UNLOCK' : 'TEST-789',
      quantity: type === 'unlock' ? 1 : 100, deviceId,
      expiry: type === 'unlock'
        ? new Date(Date.now() + 30 * 60000).toISOString()
        : '2027-12-31'
    })
    setModalTitle(title); setModalDesc(desc)
    setQrSrc(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(dataToEncode)}&bgcolor=ffffff`)
    setModalOpen(true)
    try {
      await fetch('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrHash: randomCode.toString(), testId: type === 'unlock' ? 'UNLOCK' : 'TEST-789', quantity: type === 'unlock' ? 0 : 100, deviceId })
      })
    } catch {}
  }

  const handlePrint = () => {
    const w = window.open('', '_blank')
    w.document.write(`<html><head><title>QR</title><style>body{display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}img{width:300px;height:300px}</style></head><body><img src="${qrSrc}" onload="window.print();window.close();"/></body></html>`)
    w.document.close()
  }

  // ── device CRUD ───────────────────────────────────────────────────────────────
  const handleRegisterDevice = async () => {
    if (!newCustomerName) { alert('يرجى إدخال اسم العميل!'); return }
    try {
      const res = await fetch('/api/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hardwareId: hardwareIdParam, machineName: newCustomerName })
      })
      if (res.ok) { alert('تم تسجيل الجهاز بنجاح!'); setRegisterModalOpen(false); fetchDevices() }
      else { const d = await res.json(); alert('فشل: ' + d.error) }
    } catch { alert('حدث خطأ') }
  }

  const handleEdit = (device) => { setCurrentDevice(device); setNewCustomerName(device.customer); setEditModalOpen(true) }

  const handleSaveEdit = async () => {
    try {
      const res = await fetch('/api/device_ops', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', hardwareId: currentDevice.id, customerName: newCustomerName })
      })
      const data = await res.json()
      if (data.success) { setEditModalOpen(false); fetchDevices(); alert('تم التعديل بنجاح!') }
    } catch { alert('حدث خطأ أثناء التعديل') }
  }

  const handleDelete = async (hardwareId) => {
    if (!window.confirm('هل أنت متأكد من الحذف النهائي؟')) return
    try {
      const res = await fetch('/api/device_ops', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', hardwareId })
      })
      const data = await res.json()
      if (data.success) { fetchDevices(); alert('تم الحذف!') }
    } catch { alert('حدث خطأ أثناء الحذف') }
  }

  const handleResetHardwareLock = async (hardwareId, customerName) => {
    if (!window.confirm(`فك قفل العتاد لـ ${customerName}؟`)) return
    try {
      const res = await fetch('/api/device_ops', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset_lock', hardwareId })
      })
      const data = await res.json()
      if (data.success) { alert('تم فك قفل العتاد!'); fetchDevices() }
      else alert('فشل: ' + data.error)
    } catch { alert('خطأ') }
  }

  // ── First Install: No-Barcode Activation ──────────────────────────────────────
  const openFirstInstall = async (device) => {
    setFiDevice(device)
    // Always show ALL_TESTS so group presets always work
    const init = {}
    ALL_TESTS.forEach(t => { init[t] = 0 })
    setFiTests(init)
    setFiGroup('')
    setFiGroupQty(100)
    setFirstInstallModal(true)
    // Pre-fill with existing quota balances from DB (remaining = total - used)
    try {
      const res = await fetch(`/api/test_quotas?device_id=${encodeURIComponent(device.id)}`)
      if (res.ok) {
        const data = await res.json()
        if (data.quotas && data.quotas.length > 0) {
          setFiTests(prev => {
            const updated = { ...prev }
            data.quotas.forEach(q => {
              const remaining = Math.max(0, Number(q.total_quota) - Number(q.used_count))
              updated[q.test_code] = remaining
            })
            return updated
          })
        }
      }
    } catch {}
  }

  const applyGroupPreset = () => {
    if (!fiGroup || !TEST_GROUPS[fiGroup]) return
    // Use functional setState to avoid stale closure; apply to ALL group tests
    setFiTests(prev => {
      const updated = { ...prev }
      TEST_GROUPS[fiGroup].forEach(t => { updated[t] = fiGroupQty })
      return updated
    })
  }

  const handleFirstInstallSave = async () => {
    const entries = Object.entries(fiTests).filter(([, qty]) => qty > 0)
    if (entries.length === 0) { alert('أدخل كمية لفحص واحد على الأقل.'); return }
    try {
      for (const [testCode, qty] of entries) {
        await fetch('/api/test_quotas', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'upsert', deviceId: fiDevice.id, testCode, testName: testCode, totalQuota: qty, alertThreshold: 20 })
        })
      }
      alert(`✔ تم تفعيل ${entries.length} فحص لـ ${fiDevice.customer} بدون باركود!`)
      setFirstInstallModal(false); fetchDevices()
    } catch { alert('حدث خطأ أثناء الحفظ') }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // LOGIN SCREEN
  // ─────────────────────────────────────────────────────────────────────────────
  if (!isLoggedIn) {
    return (
      <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'100vh', background:'linear-gradient(135deg, #0b0f19 0%, #131929 100%)' }}>
        <div style={{ width:'100%', maxWidth:'400px', padding:'40px', background:'rgba(255,255,255,0.04)', borderRadius:'16px', border:'1px solid rgba(255,255,255,0.08)', backdropFilter:'blur(12px)', textAlign:'center' }}>
          <div style={{ fontSize:'26px', fontWeight:'900', color:'#4facfe', marginBottom:'6px', letterSpacing:'2px' }}>GENOTEK GUARD</div>
          <div style={{ color:'rgba(255,255,255,0.4)', fontSize:'13px', marginBottom:'32px' }}>نظام إدارة صلاحيات الأجهزة السحابي</div>

          {['username','password'].map(field => (
            <div key={field} style={{ marginBottom:'16px', textAlign:'right' }}>
              <label style={{ display:'block', marginBottom:'6px', fontSize:'13px', color:'rgba(255,255,255,0.5)' }}>
                {field === 'username' ? 'اسم المستخدم' : 'كلمة المرور'}
              </label>
              <input type={field === 'password' ? 'password' : 'text'}
                value={field === 'username' ? username : password}
                onChange={e => field === 'username' ? setUsername(e.target.value) : setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                style={{ width:'100%', padding:'12px 14px', background:'rgba(0,0,0,0.3)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'8px', color:'white', fontSize:'15px', boxSizing:'border-box', textAlign:'right' }}
              />
            </div>
          ))}

          <button onClick={handleLogin} style={{ width:'100%', padding:'14px', background:'linear-gradient(135deg,#00f2fe,#4facfe)', border:'none', borderRadius:'8px', color:'#0b0f19', fontSize:'16px', fontWeight:'700', cursor:'pointer', marginTop:'8px' }}>
            تسجيل الدخول
          </button>
          {error && <div style={{ color:'#f87171', fontSize:'13px', marginTop:'14px', background:'rgba(239,68,68,0.1)', padding:'10px', borderRadius:'6px', border:'1px solid rgba(239,68,68,0.2)' }}>{error}</div>}

          {/* Contact footer */}
          <div style={{ marginTop:'28px', paddingTop:'16px', borderTop:'1px solid rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.25)', fontSize:'11px' }}>
            Contact Service Department
          </div>
        </div>

        {registerModalOpen && <RegisterModal
          hardwareIdParam={hardwareIdParam} setHardwareIdParam={setHardwareIdParam}
          newCustomerName={newCustomerName} setNewCustomerName={setNewCustomerName}
          onRegister={handleRegisterDevice} onClose={() => setRegisterModalOpen(false)} />}
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DASHBOARD
  // ─────────────────────────────────────────────────────────────────────────────
  const onlineCount  = devices.filter(d => d.status === 'online' || d.status === 'Connected').length
  const offlineCount = devices.filter(d => d.status !== 'online' && d.status !== 'Connected').length
  const alertCount   = notifications.length

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#0b0f19 0%,#131929 100%)', padding:'24px', fontFamily:'Segoe UI, Arial, sans-serif', direction:'rtl' }}>

      {/* ── Header ── */}
      <header style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'24px', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'12px', padding:'16px 24px' }}>
        <div>
          <div style={{ fontSize:'20px', fontWeight:'900', color:'#4facfe', letterSpacing:'1px' }}>GENOTEK DASHBOARD</div>
          <div style={{ color:'rgba(255,255,255,0.4)', fontSize:'12px', marginTop:'2px' }}>مرحباً — نظام إدارة الأجهزة المركزي</div>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
          {/* Notification Bell */}
          <div style={{ position:'relative', cursor:'pointer' }} onClick={() => setShowNotifPanel(v => !v)}>
            <span style={{ fontSize:'22px' }}>🔔</span>
            {alertCount > 0 && (
              <span style={{ position:'absolute', top:'-6px', right:'-6px', background:'#ef4444', color:'white', borderRadius:'50%', width:'18px', height:'18px', fontSize:'10px', fontWeight:'700', display:'flex', alignItems:'center', justifyContent:'center' }}>
                {alertCount}
              </span>
            )}
          </div>

          <button onClick={() => { setRegisterModalOpen(true); if (!hardwareIdParam) setHardwareIdParam('GENO-' + Math.random().toString(36).substring(2,10).toUpperCase()) }}
            style={{ background:'#4facfe', border:'none', color:'#0b0f19', padding:'8px 16px', borderRadius:'6px', cursor:'pointer', fontWeight:'700', fontSize:'13px' }}>
            + تسجيل جهاز
          </button>
          <button onClick={handleLogout} style={{ background:'transparent', border:'1px solid rgba(255,255,255,0.15)', color:'rgba(255,255,255,0.5)', padding:'8px 14px', borderRadius:'6px', cursor:'pointer', fontSize:'13px' }}>
            خروج
          </button>
        </div>
      </header>

      {/* ── Notification Panel ── */}
      {showNotifPanel && (
        <div style={{ marginBottom:'20px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:'12px', padding:'16px 20px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
            <div style={{ fontWeight:'700', color:'#f87171', fontSize:'14px' }}>
              ⚠ إنذارات الانقطاع (أكثر من 48 ساعة) — {alertCount} جهاز
            </div>
            {alertCount > 0 && (
              <button onClick={() => {
                setNotifications([])
                setShowNotifPanel(false)
                fetch('/api/monitoring?scope=notify', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'mark_read' }) }).catch(()=>{})
              }} style={{ padding:'4px 10px', background:'rgba(100,200,100,0.1)', color:'#34d399', border:'1px solid rgba(52,211,153,0.2)', borderRadius:'4px', cursor:'pointer', fontSize:'12px' }}>
                ✔ تم الاطلاع على الجميع
              </button>
            )}
          </div>
          {alertCount === 0
            ? <div style={{ color:'#34d399', fontSize:'13px' }}>✔ جميع الأجهزة متصلة بشكل طبيعي</div>
            : notifications.map((n, i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:'rgba(239,68,68,0.1)', borderRadius:'8px', marginBottom:'6px', border:'1px solid rgba(239,68,68,0.2)' }}>
                  <span style={{ color:'#fca5a5', fontSize:'13px' }}>📴 {n.message}</span>
                  <div style={{ display:'flex', gap:'8px' }}>
                    <button onClick={() => generateQR('unlock', n.device.id, n.device.customer)} style={{ padding:'4px 10px', background:'rgba(0,242,254,0.1)', color:'#00f2fe', border:'1px solid rgba(0,242,254,0.2)', borderRadius:'4px', cursor:'pointer', fontSize:'12px' }}>فك الحجب</button>
                    <button onClick={() => { setQuotaDevice(n.device); setShowNotifPanel(false) }} style={{ padding:'4px 10px', background:'rgba(16,185,129,0.1)', color:'#34d399', border:'1px solid rgba(16,185,129,0.2)', borderRadius:'4px', cursor:'pointer', fontSize:'12px' }}>الفحوصات</button>
                  </div>
                </div>
              ))
          }
        </div>
      )}

      {/* ── Stats ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:'16px', marginBottom:'24px' }}>
        {[
          { label:'إجمالي العملاء',    value: devices.length, color:'#4facfe' },
          { label:'متصل الآن',          value: onlineCount,    color:'#34d399' },
          { label:'منقطع (>48h)',        value: offlineCount,   color:'#f87171' },
          { label:'إنذارات نشطة',       value: alertCount,     color:'#f59e0b',
            onClick: () => setShowNotifPanel(v => !v), extra: alertCount > 0 ? '⚠' : '✔' },
        ].map((s, i) => (
          <div key={i} onClick={s.onClick} style={{ padding:'18px', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'10px', textAlign:'center', cursor: s.onClick ? 'pointer' : 'default', transition:'border-color 0.2s' }}>
            <div style={{ fontSize:'28px', fontWeight:'900', color: s.color }}>{s.extra || s.value}</div>
            {s.extra && <div style={{ fontSize:'20px', fontWeight:'700', color: s.color }}>{s.value}</div>}
            <div style={{ color:'rgba(255,255,255,0.4)', fontSize:'12px', marginTop:'4px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Tab bar ── */}
      <div style={{ display:'flex', gap:'4px', marginBottom:'16px' }}>
        <button onClick={() => setActiveTab('devices')} style={{ padding:'8px 20px', background:'#4facfe', color:'#0b0f19', border:'1px solid #4facfe', borderRadius:'8px', cursor:'pointer', fontWeight:'700', fontSize:'13px' }}>
          الأجهزة والعملاء
        </button>
        <span style={{ fontSize:'12px', color:'rgba(255,255,255,0.3)', alignSelf:'center' }}>
          📋 انقر على اسم العميل لعرض نشاطه
        </span>
      </div>

      {/* ── Devices Table ── */}
      {activeTab === 'devices' && (
        <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'12px', overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', textAlign:'right' }}>
            <thead>
              <tr>
                {['اسم العميل','الجهاز','الحالة','آخر اتصال','العمليات'].map(h => (
                  <th key={h} style={{ padding:'14px 16px', color:'rgba(255,255,255,0.4)', fontSize:'12px', borderBottom:'1px solid rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.02)', fontWeight:'600' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {devices.map((item, idx) => {
                const h = hoursAgo(item.lastSeen || item.last_seen)
                const isOnline  = item.status === 'online' || item.status === 'Connected'
                const isBlocked = item.status === 'blocked'
                const isAlerted = h > 48

                return (
                  <tr key={idx} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)', background: isAlerted ? 'rgba(239,68,68,0.04)' : 'transparent' }}>
                    {/* Customer — click to open activity */}
                    <td style={{ padding:'14px 16px' }}>
                      <div
                        onClick={() => setActivityDevice(item)}
                        style={{ fontWeight:'700', color:'#4facfe', fontSize:'14px', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:'6px' }}
                        title="انقر لعرض سجل النشاط"
                      >
                        📋 {item.customer}
                      </div>
                      <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.3)', marginTop:'4px' }}>
                        💻 {item.authorizedMachineHash || '—'}
                        {item.authorizedAnalyzerSerial && <span style={{ marginRight:'10px' }}>🧪 {item.authorizedAnalyzerSerial}</span>}
                      </div>
                      {item.blocked_tests && <div style={{ fontSize:'10px', color:'#f87171', marginTop:'2px' }}>🚫 {item.blocked_tests}</div>}
                    </td>

                    {/* Device */}
                    <td style={{ padding:'14px 16px', color:'#4facfe', fontSize:'13px' }}>
                      <code>{item.device}</code>
                      <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.3)', marginTop:'2px' }}>{item.id}</div>
                    </td>

                    {/* Status */}
                    <td style={{ padding:'14px 16px' }}>
                      <span style={{
                        display:'inline-flex', alignItems:'center', gap:'6px',
                        padding:'3px 10px', borderRadius:'20px', fontSize:'12px', fontWeight:'600',
                        background: isBlocked ? 'rgba(239,68,68,0.15)' : isOnline ? 'rgba(16,185,129,0.15)' : isAlerted ? 'rgba(239,68,68,0.12)' : 'rgba(156,163,175,0.12)',
                        color: isBlocked ? '#f87171' : isOnline ? '#34d399' : isAlerted ? '#fca5a5' : '#9ca3af',
                        border: `1px solid ${isBlocked ? 'rgba(239,68,68,0.3)' : isOnline ? 'rgba(16,185,129,0.3)' : isAlerted ? 'rgba(239,68,68,0.25)' : 'rgba(156,163,175,0.25)'}`
                      }}>
                        <span style={{ width:'6px', height:'6px', borderRadius:'50%', background: isOnline ? '#10b981' : isAlerted ? '#ef4444' : '#6b7280', boxShadow: isOnline ? '0 0 6px #10b981' : isAlerted ? '0 0 6px #ef4444' : 'none' }}></span>
                        {isBlocked ? 'محظور' : isOnline ? 'متصل' : isAlerted ? 'منقطع ⚠' : 'غير متصل'}
                      </span>
                    </td>

                    {/* Last seen */}
                    <td style={{ padding:'14px 16px', color: isAlerted ? '#fca5a5' : 'rgba(255,255,255,0.4)', fontSize:'13px' }}>
                      {formatDuration(item.lastSeen || item.last_seen)}
                      {isAlerted && <div style={{ fontSize:'10px', color:'#f87171', marginTop:'2px', fontWeight:'700' }}>تجاوز 48h!</div>}
                    </td>

                    {/* Actions */}
                    <td style={{ padding:'10px 12px' }}>
                      <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                        <ActionBtn color="#00f2fe" onClick={() => generateQR('unlock', item.id, item.customer)}>🔓 فك</ActionBtn>
                        <ActionBtn color="#34d399" onClick={() => openFirstInstall(item)}>✨ أول تنصيب</ActionBtn>
                        <ActionBtn color="#10b981" onClick={() => setQuotaDevice(item)}>📊 حصص</ActionBtn>
                        <ActionBtn color="#f59e0b" onClick={() => handleResetHardwareLock(item.id, item.customer)}>🔄 عتاد</ActionBtn>
                        <ActionBtn color="#00c3ff" onClick={() => handleEdit(item)}>✏️</ActionBtn>
                        <ActionBtn color="#ef4444" onClick={() => handleDelete(item.id)}>🗑️</ActionBtn>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {devices.length === 0 && (
            <div style={{ textAlign:'center', padding:'40px', color:'rgba(255,255,255,0.25)', fontSize:'14px' }}>
              لا توجد أجهزة مسجلة بعد
            </div>
          )}
        </div>
      )}

      {/* ── Device Activity Modal ── */}
      {activityDevice && (
        <DeviceActivityModal device={activityDevice} onClose={() => setActivityDevice(null)} />
      )}

      {/* ── Modals ── */}
      {modalOpen      && <QrModal title={modalTitle} desc={modalDesc} qrSrc={qrSrc} code={manualCode} onPrint={handlePrint} onClose={() => setModalOpen(false)} />}
      {editModalOpen  && <EditModal customerName={newCustomerName} onChange={setNewCustomerName} onSave={handleSaveEdit} onClose={() => setEditModalOpen(false)} />}
      {registerModalOpen && <RegisterModal hardwareIdParam={hardwareIdParam} setHardwareIdParam={setHardwareIdParam} newCustomerName={newCustomerName} setNewCustomerName={setNewCustomerName} onRegister={handleRegisterDevice} onClose={() => setRegisterModalOpen(false)} />}
      {firstInstallModal && fiDevice && (
        <FirstInstallModal
          device={fiDevice} tests={fiTests} setTests={setFiTests}
          group={fiGroup} setGroup={setFiGroup} groupQty={fiGroupQty} setGroupQty={setFiGroupQty}
          onApplyGroup={applyGroupPreset} onSave={handleFirstInstallSave} onClose={() => setFirstInstallModal(false)} />
      )}
      {quotaDevice && <QuotaManager device={quotaDevice} onClose={() => setQuotaDevice(null)} />}
    </div>
  )
}

// ─── Small Helpers ────────────────────────────────────────────────────────────
function ActionBtn({ color, onClick, children }) {
  return (
    <button onClick={onClick} style={{ padding:'6px 10px', borderRadius:'6px', fontSize:'12px', fontWeight:'600', cursor:'pointer', background:`rgba(${hexToRgb(color)},0.1)`, color, border:`1px solid rgba(${hexToRgb(color)},0.25)`, whiteSpace:'nowrap' }}>
      {children}
    </button>
  )
}

function hexToRgb(hex) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return r ? `${parseInt(r[1],16)},${parseInt(r[2],16)},${parseInt(r[3],16)}` : '255,255,255'
}

// ─── Device Activity Modal ────────────────────────────────────────────────────
function DeviceActivityModal({ device, onClose }) {
  const [dbLogs,  setDbLogs]  = useState([])
  const [quotas,  setQuotas]  = useState([])
  const [loading, setLoading] = useState(true)
  const [section, setSection] = useState('quotas') // quotas | log

  // Instant events from already-loaded device data (no API needed)
  const ts = device.lastSeen || device.last_seen
  const instant = []
  if (ts) {
    const h = Math.floor((Date.now() - new Date(ts).getTime()) / 3600000)
    instant.push({
      event_type: device.status === 'blocked' ? 'BLOCKED' : device.status === 'online' ? 'HEARTBEAT' : 'DISCONNECTED',
      details: device.status === 'blocked' ? 'الجهاز محجوب — تم كشف تلاعب بالعتاد'
             : device.status === 'online'   ? 'نبضة قلب — الجهاز متصل بنجاح'
             : `انقطع الاتصال منذ ${h} ساعة`,
      logged_at: ts
    })
  }
  if (device.blocked_tests)
    instant.push({ event_type:'BLOCKED_TESTS', details:`فحوصات محجوبة: ${device.blocked_tests}`, logged_at:ts })
  if (device.authorizedMachineHash && !['—','مجهول'].includes(device.authorizedMachineHash))
    instant.push({ event_type:'HARDWARE_BIND', details:`بصمة الحاسب: ${device.authorizedMachineHash}`, logged_at:ts })
  if (device.authorizedAnalyzerSerial && !['مجهول','مفتوح/غير مقيد'].includes(device.authorizedAnalyzerSerial))
    instant.push({ event_type:'ANALYZER_BIND', details:`المحلل: ${device.authorizedAnalyzerSerial}`, logged_at:ts })

  useEffect(() => {
    Promise.all([
      fetch(`/api/monitoring?scope=activity&hardware_id=${encodeURIComponent(device.id)}`).then(r => r.ok ? r.json() : {}),
      fetch(`/api/test_quotas?device_id=${encodeURIComponent(device.id)}`).then(r => r.ok ? r.json() : {})
    ]).then(([actData, qData]) => {
      setDbLogs(actData.logs || [])
      setQuotas(qData.quotas || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [device.id])

  const allLogs = dbLogs.length > 0 ? dbLogs : instant
  const typeColor = {
    HEARTBEAT:'#34d399', DISCONNECTED:'#f59e0b', BLOCKED:'#ef4444',
    BLOCKED_TESTS:'#f87171', HARDWARE_BIND:'#4facfe', ANALYZER_BIND:'#a78bfa',
    PC_SWAP_DETECTED:'#ef4444', ANALYZER_SWAP_DETECTED:'#ef4444', TAMPER_DETECTED:'#ef4444'
  }

  // Quota stats
  const totalTests    = quotas.length
  const depleted      = quotas.filter(q => Number(q.total_quota) - Number(q.used_count) <= 0).length
  const lowWarning    = quotas.filter(q => {
    const rem = Number(q.total_quota) - Number(q.used_count)
    const pct = q.total_quota > 0 ? (rem / q.total_quota) * 100 : 0
    return rem > 0 && pct <= (q.alert_threshold || 20)
  }).length

  const tabBtn = (id, label) => (
    <button onClick={() => setSection(id)} style={{
      padding:'6px 16px', borderRadius:'6px', cursor:'pointer', fontSize:'12px', fontWeight:'700',
      background: section === id ? '#4facfe' : 'rgba(255,255,255,0.05)',
      color:       section === id ? '#0b0f19' : 'rgba(255,255,255,0.5)',
      border:     `1px solid ${section === id ? '#4facfe' : 'rgba(255,255,255,0.1)'}`
    }}>{label}</button>
  )

  return (
    <Overlay onClick={onClose}>
      <ModalBox style={{ maxWidth:'660px', maxHeight:'88vh', overflowY:'auto', textAlign:'right' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'14px' }}>
          <div>
            <div style={{ fontSize:'17px', fontWeight:'800', color:'#4facfe' }}>📋 نشاط العميل</div>
            <div style={{ fontSize:'13px', color:'rgba(255,255,255,0.5)', marginTop:'2px' }}>{device.customer}</div>
          </div>
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:'rgba(255,255,255,0.4)', cursor:'pointer', fontSize:'20px' }}>✕</button>
        </div>

        {/* Status cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'7px', marginBottom:'14px' }}>
          {[
            { label:'الحالة', value: device.status==='online' ? '● متصل' : device.status==='blocked' ? '⛔ محظور' : '○ منقطع',
              color: device.status==='online' ? '#34d399' : device.status==='blocked' ? '#ef4444' : '#f59e0b' },
            { label:'آخر اتصال', value: formatDuration(ts), color:'rgba(255,255,255,0.7)' },
            { label:'فحوصات نشطة', value: loading ? '...' : totalTests, color:'#4facfe' },
            { label:'منتهية / تحذير', value: loading ? '...' : `${depleted} / ${lowWarning}`,
              color: depleted > 0 ? '#ef4444' : lowWarning > 0 ? '#f59e0b' : '#34d399' },
          ].map((c, i) => (
            <div key={i} style={{ background:'rgba(255,255,255,0.04)', borderRadius:'8px', padding:'9px 10px', border:'1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.3)', marginBottom:'3px' }}>{c.label}</div>
              <div style={{ fontSize:'13px', fontWeight:'700', color:c.color }}>{c.value}</div>
            </div>
          ))}
        </div>

        {/* Section tabs */}
        <div style={{ display:'flex', gap:'8px', marginBottom:'12px' }}>
          {tabBtn('quotas', `📊 استهلاك الفحوصات${totalTests ? ` (${totalTests})` : ''}`)}
          {tabBtn('log',    `📜 سجل الأحداث${allLogs.length ? ` (${allLogs.length})` : ''}`)}
        </div>

        {/* ── QUOTA SECTION ── */}
        {section === 'quotas' && (
          <div>
            {loading ? (
              <div style={{ textAlign:'center', padding:'30px', color:'rgba(255,255,255,0.3)' }}>⏳ جاري تحميل بيانات الفحوصات...</div>
            ) : quotas.length === 0 ? (
              <div style={{ textAlign:'center', padding:'30px', color:'rgba(255,255,255,0.2)', fontSize:'13px' }}>
                لم يتم تفعيل فحوصات لهذا الجهاز بعد
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                {quotas.map((q, i) => {
                  const total     = Number(q.total_quota)
                  const used      = Number(q.used_count)
                  const remaining = Math.max(0, total - used)
                  const pct       = total > 0 ? Math.round((used / total) * 100) : 0
                  const remPct    = 100 - pct
                  const isDepleted = remaining <= 0
                  const isLow      = !isDepleted && remPct <= (q.alert_threshold || 20)
                  const barColor   = isDepleted ? '#ef4444' : isLow ? '#f59e0b' : '#34d399'

                  return (
                    <div key={i} style={{
                      padding:'10px 14px', borderRadius:'8px',
                      background: isDepleted ? 'rgba(239,68,68,0.07)' : isLow ? 'rgba(245,158,11,0.07)' : 'rgba(255,255,255,0.03)',
                      border:`1px solid ${isDepleted ? 'rgba(239,68,68,0.25)' : isLow ? 'rgba(245,158,11,0.25)' : 'rgba(255,255,255,0.07)'}`
                    }}>
                      {/* Test name + status */}
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'7px' }}>
                        <span style={{ fontWeight:'700', color: isDepleted ? '#f87171' : isLow ? '#fbbf24' : 'white', fontSize:'13px' }}>
                          {isDepleted ? '🔴' : isLow ? '🟡' : '🟢'} {q.test_code}
                          {q.test_name && q.test_name !== q.test_code && <span style={{ fontWeight:'400', color:'rgba(255,255,255,0.4)', fontSize:'11px', marginRight:'6px' }}> — {q.test_name}</span>}
                        </span>
                        <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.4)' }}>
                          {isDepleted ? <span style={{ color:'#ef4444', fontWeight:'700' }}>نفد الرصيد</span>
                           : isLow     ? <span style={{ color:'#f59e0b', fontWeight:'700' }}>رصيد منخفض</span>
                           : null}
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div style={{ background:'rgba(255,255,255,0.08)', borderRadius:'4px', height:'6px', marginBottom:'6px', overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${pct}%`, background:barColor, borderRadius:'4px', transition:'width 0.3s' }} />
                      </div>

                      {/* Numbers */}
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:'11px', color:'rgba(255,255,255,0.4)' }}>
                        <span>مُستخدم: <span style={{ color:'rgba(255,255,255,0.7)', fontWeight:'600' }}>{used}</span></span>
                        <span>متبقي: <span style={{ color:barColor, fontWeight:'700' }}>{remaining}</span></span>
                        <span>الإجمالي: <span style={{ color:'rgba(255,255,255,0.6)' }}>{total}</span></span>
                        <span style={{ color: pct >= 80 ? '#f87171' : 'rgba(255,255,255,0.4)' }}>{pct}% مُستهلَك</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── LOG SECTION ── */}
        {section === 'log' && (
          <div style={{ background:'rgba(0,0,0,0.3)', borderRadius:'8px', padding:'12px', border:'1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.3)', marginBottom:'8px' }}>
              {loading ? '⏳ جاري التحميل...' : dbLogs.length > 0 ? `${dbLogs.length} حدث من قاعدة البيانات` : '⚡ بيانات فورية من الذاكرة'}
            </div>
            <div style={{ fontFamily:'Consolas,monospace', fontSize:'11px', maxHeight:'320px', overflowY:'auto' }}>
              {allLogs.length === 0
                ? <div style={{ color:'rgba(255,255,255,0.2)', textAlign:'center', padding:'20px' }}>لا توجد سجلات</div>
                : allLogs.map((log, i) => {
                    const evType   = log.event_type || ''
                    const color    = typeColor[evType] || 'rgba(255,255,255,0.6)'
                    const logTime  = log.logged_at || log.time
                    return (
                      <div key={i} style={{ display:'flex', gap:'8px', padding:'5px 2px', borderBottom:'1px solid rgba(255,255,255,0.04)', alignItems:'flex-start' }}>
                        <span style={{ color:'rgba(255,255,255,0.2)', whiteSpace:'nowrap', minWidth:'128px' }}>
                          {logTime ? new Date(logTime).toLocaleString('ar-IQ') : '—'}
                        </span>
                        <span style={{ color, fontWeight:'700', whiteSpace:'nowrap', minWidth:'110px' }}>{evType}</span>
                        <span style={{ color:'rgba(255,255,255,0.65)' }}>{log.details || log.data || '—'}</span>
                      </div>
                    )
                  })
              }
            </div>
          </div>
        )}

      </ModalBox>
    </Overlay>
  )
}

// ─── Activity Log ─────────────────────────────────────────────────────────────
function ActivityLog({ devices }) {
  const [logs, setLogs] = useState([])
  useEffect(() => {
    fetch('/api/monitoring?scope=activity')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setLogs(d.logs || []))
      .catch(() => {
        // Simulate activity from device heartbeats
        setLogs(devices.map(d => ({
          time: d.lastSeen || d.last_seen,
          device: d.customer,
          event: 'Heartbeat',
          data: `Status: ${d.status}`
        })).filter(l => l.time).sort((a,b) => new Date(b.time) - new Date(a.time)).slice(0, 20))
      })
  }, [devices])

  return (
    <div style={{ fontFamily:'Consolas,monospace', fontSize:'12px', color:'#a3e635', maxHeight:'420px', overflowY:'auto' }}>
      {logs.length === 0
        ? <div style={{ color:'rgba(255,255,255,0.3)' }}>لا توجد سجلات بعد...</div>
        : logs.map((l, i) => (
            <div key={i} style={{ padding:'4px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ color:'rgba(255,255,255,0.3)' }}>[{new Date(l.time).toLocaleString('ar-IQ')}]</span>
              {' '}<span style={{ color:'#4facfe' }}>[{l.device}]</span>
              {' '}<span style={{ color:'#f59e0b' }}>{l.event}:</span>
              {' '}<span>{l.data}</span>
            </div>
          ))
      }
    </div>
  )
}

// ─── QR Modal ─────────────────────────────────────────────────────────────────
function QrModal({ title, desc, qrSrc, code, onPrint, onClose }) {
  return (
    <Overlay onClick={onClose}>
      <ModalBox onClick={e => e.stopPropagation()}>
        <div style={{ fontSize:'18px', fontWeight:'700', color:'#4facfe', marginBottom:'16px' }}>{title}</div>
        <div style={{ width:'200px', height:'200px', background:'white', margin:'0 auto 16px', borderRadius:'10px', padding:'8px' }}>
          {qrSrc && <img src={qrSrc} alt="QR" style={{ width:'100%', height:'100%' }} />}
        </div>
        <div style={{ color:'rgba(255,255,255,0.4)', fontSize:'12px', marginBottom:'4px' }}>الكود اليدوي:</div>
        <div style={{ fontSize:'22px', fontWeight:'900', letterSpacing:'4px', color:'#fbbf24', marginBottom:'8px' }}>{code}</div>
        <div style={{ color:'rgba(255,255,255,0.4)', fontSize:'12px', marginBottom:'16px' }}>{desc}</div>
        <div style={{ display:'flex', gap:'10px', justifyContent:'center' }}>
          <ModalBtn bg="#4facfe" color="#0b0f19" onClick={onPrint}>🖨️ طباعة</ModalBtn>
          <ModalBtn onClick={onClose}>إغلاق</ModalBtn>
        </div>
      </ModalBox>
    </Overlay>
  )
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
function EditModal({ customerName, onChange, onSave, onClose }) {
  return (
    <Overlay onClick={onClose}>
      <ModalBox onClick={e => e.stopPropagation()}>
        <div style={{ fontSize:'18px', fontWeight:'700', color:'#4facfe', marginBottom:'16px' }}>تعديل بيانات العميل</div>
        <label style={{ display:'block', marginBottom:'6px', color:'rgba(255,255,255,0.4)', fontSize:'13px' }}>اسم العميل الجديد:</label>
        <input value={customerName} onChange={e => onChange(e.target.value)} style={{ width:'100%', padding:'10px 12px', background:'rgba(0,0,0,0.3)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'8px', color:'white', fontSize:'14px', marginBottom:'16px', boxSizing:'border-box' }} />
        <div style={{ display:'flex', gap:'10px', justifyContent:'center' }}>
          <ModalBtn bg="#4facfe" color="#0b0f19" onClick={onSave}>حفظ</ModalBtn>
          <ModalBtn onClick={onClose}>إلغاء</ModalBtn>
        </div>
      </ModalBox>
    </Overlay>
  )
}

// ─── Register Modal ───────────────────────────────────────────────────────────
function RegisterModal({ hardwareIdParam, setHardwareIdParam, newCustomerName, setNewCustomerName, onRegister, onClose }) {
  const locked = !!new URLSearchParams(window.location.search).get('hardware_id')
  return (
    <Overlay onClick={onClose}>
      <ModalBox onClick={e => e.stopPropagation()}>
        <div style={{ fontSize:'18px', fontWeight:'700', color:'#4facfe', marginBottom:'20px' }}>تسجيل جهاز جديد</div>
        <label style={{ display:'block', marginBottom:'6px', color:'rgba(255,255,255,0.4)', fontSize:'13px' }}>معرف العتاد (Hardware ID)</label>
        <input type="text" value={hardwareIdParam} onChange={e => setHardwareIdParam(e.target.value)} disabled={locked}
          style={{ width:'100%', padding:'11px 14px', background:'rgba(0,0,0,0.3)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'8px', color:'white', fontSize:'14px', marginBottom:'14px', boxSizing:'border-box' }} />
        <label style={{ display:'block', marginBottom:'6px', color:'rgba(255,255,255,0.4)', fontSize:'13px' }}>اسم العميل / المختبر</label>
        <input type="text" value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)}
          style={{ width:'100%', padding:'11px 14px', background:'rgba(0,0,0,0.3)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'8px', color:'white', fontSize:'14px', marginBottom:'18px', boxSizing:'border-box' }} />
        <ModalBtn bg="linear-gradient(135deg,#00f2fe,#4facfe)" color="#0b0f19" onClick={onRegister} full>تسجيل الجهاز</ModalBtn>
        <div style={{ height:'8px' }} />
        <ModalBtn onClick={onClose} full>إلغاء</ModalBtn>
      </ModalBox>
    </Overlay>
  )
}

// ─── First Install Modal ───────────────────────────────────────────────────────
function FirstInstallModal({ device, tests, setTests, group, setGroup, groupQty, setGroupQty, onApplyGroup, onSave, onClose }) {
  const blockedSet = new Set(
    device.blocked_tests ? device.blocked_tests.split(',').map(t => t.trim()).filter(Boolean) : []
  )
  const activeCount  = Object.values(tests).filter(v => v > 0).length
  const activeTotal  = Object.values(tests).reduce((s, v) => s + v, 0)

  return (
    <Overlay onClick={onClose}>
      <ModalBox style={{ maxWidth:'580px', maxHeight:'85vh', overflowY:'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize:'17px', fontWeight:'700', color:'#34d399', marginBottom:'4px' }}>✨ التنصيب الأول — تفعيل بدون باركود</div>
        <div style={{ color:'rgba(255,255,255,0.4)', fontSize:'12px', marginBottom:'4px' }}>الجهاز: <span style={{ color:'#4facfe' }}>{device.customer}</span></div>
        {blockedSet.size > 0 && (
          <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.3)', marginBottom:'12px' }}>
            🔴 محجوب فعلاً: <span style={{ color:'#f87171' }}>{[...blockedSet].join(', ')}</span>
          </div>
        )}

        {/* Group preset row */}
        <div style={{ display:'flex', gap:'8px', marginBottom:'14px', alignItems:'center', flexWrap:'wrap', background:'rgba(255,255,255,0.03)', borderRadius:'8px', padding:'10px' }}>
          <select value={group} onChange={e => setGroup(e.target.value)}
            style={{ flex:1, minWidth:'160px', padding:'7px 10px', background:'rgba(0,0,0,0.5)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:'6px', color:'white', fontSize:'13px' }}>
            <option value="">اختر باقة فحوصات...</option>
            {Object.keys(TEST_GROUPS).map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <input type="number" value={groupQty} onChange={e => setGroupQty(+e.target.value)} min="1"
            style={{ width:'80px', padding:'7px 10px', background:'rgba(0,0,0,0.5)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:'6px', color:'white', fontSize:'13px', textAlign:'center' }} />
          <button onClick={onApplyGroup}
            style={{ padding:'7px 16px', background:'rgba(52,211,153,0.2)', color:'#34d399', border:'1px solid rgba(52,211,153,0.4)', borderRadius:'6px', cursor:'pointer', fontSize:'13px', fontWeight:'700', whiteSpace:'nowrap' }}>
            ✔ تطبيق الباقة
          </button>
        </div>

        {/* All tests grid */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'7px', marginBottom:'16px' }}>
          {ALL_TESTS.map(t => {
            const qty     = tests[t] || 0
            const blocked = blockedSet.has(t)
            const active  = qty > 0
            return (
              <div key={t} style={{
                display:'flex', alignItems:'center', justifyContent:'space-between',
                padding:'7px 10px', borderRadius:'6px',
                background: active ? 'rgba(52,211,153,0.08)' : blocked ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${active ? 'rgba(52,211,153,0.3)' : blocked ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.05)'}`
              }}>
                <span style={{ fontSize:'11px', fontWeight: active ? '700' : '400',
                  color: active ? '#34d399' : blocked ? '#f87171' : 'rgba(255,255,255,0.55)' }}>
                  {blocked ? '🔴 ' : ''}{t}
                </span>
                <input type="number" value={qty} min="0"
                  onChange={e => setTests(prev => ({ ...prev, [t]: Math.max(0, +e.target.value) }))}
                  style={{ width:'58px', padding:'3px 6px', background:'rgba(0,0,0,0.5)',
                    border:`1px solid ${active ? 'rgba(52,211,153,0.5)' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius:'4px', color:'white', fontSize:'12px', textAlign:'center' }} />
              </div>
            )
          })}
        </div>

        <div style={{ color:'rgba(255,255,255,0.35)', fontSize:'11px', marginBottom:'14px', textAlign:'center' }}>
          أنواع نشطة: <span style={{ color:'#34d399', fontWeight:'700' }}>{activeCount}</span> &nbsp;|&nbsp;
          إجمالي الكميات: <span style={{ color:'#fbbf24', fontWeight:'700' }}>{activeTotal}</span>
        </div>

        <div style={{ display:'flex', gap:'10px', justifyContent:'center' }}>
          <ModalBtn bg="#34d399" color="#0b0f19" onClick={onSave}>حفظ وتفعيل</ModalBtn>
          <ModalBtn onClick={onClose}>إلغاء</ModalBtn>
        </div>
      </ModalBox>
    </Overlay>
  )
}

// ─── Shared UI primitives ─────────────────────────────────────────────────────
function Overlay({ children, onClick }) {
  return (
    <div onClick={onClick} style={{ position:'fixed', top:0, left:0, width:'100%', height:'100%', background:'rgba(0,0,0,0.75)', backdropFilter:'blur(8px)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:1000 }}>
      {children}
    </div>
  )
}

function ModalBox({ children, style = {}, onClick }) {
  return (
    <div onClick={onClick} style={{ width:'90%', maxWidth:'420px', padding:'28px', background:'rgba(15,20,35,0.97)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'16px', backdropFilter:'blur(20px)', textAlign:'center', ...style }}>
      {children}
    </div>
  )
}

function ModalBtn({ bg = 'transparent', color = 'rgba(255,255,255,0.5)', children, onClick, full }) {
  return (
    <button onClick={onClick} style={{ padding:'10px 22px', background: bg, border:`1px solid ${bg === 'transparent' ? 'rgba(255,255,255,0.15)' : 'transparent'}`, borderRadius:'8px', color, fontSize:'14px', fontWeight:'700', cursor:'pointer', width: full ? '100%' : undefined }}>
      {children}
    </button>
  )
}
