import { useState, useEffect } from 'react'
import './App.css'
import QuotaManager from './QuotaManager'

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [devices, setDevices] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [currentDevice, setCurrentDevice] = useState(null)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [modalTitle, setModalTitle] = useState('')
  const [modalDesc, setModalDesc] = useState('')
  const [manualCode, setManualCode] = useState('------')
  const [qrSrc, setQrSrc] = useState('')
  const [hardwareIdParam, setHardwareIdParam] = useState('')
  const [registerModalOpen, setRegisterModalOpen] = useState(false)
  const [quotaDevice, setQuotaDevice] = useState(null)

  // البيانات التجريبية كاحتياط
  const mockData = [
    { customer: "مختبر الحياة التخصصي", device: "BioAnalyzer-3000", status: "online", lastSeen: "الآن", id: "DEV-8891" },
    { customer: "مستشفى الأمل", device: "Genotek-X1", status: "online", lastSeen: "منذ 5 دقائق", id: "DEV-1102" },
    { customer: "مختبر بابل المركزي", device: "BioAnalyzer-2000", status: "offline", lastSeen: "منذ 4 أيام", id: "DEV-0045" },
    { customer: "عيادة الشفاء", device: "Genotek-X1", status: "online", lastSeen: "منذ ساعة", id: "DEV-7762" }
  ]

  useEffect(() => {
    const logged = localStorage.getItem("isLoggedIn") === "true"
    setIsLoggedIn(logged)
    if (logged) {
      fetchDevices()
    }

    // التحقق من وجود hardware_id في الرابط
    const params = new URLSearchParams(window.location.search)
    const hwId = params.get('hardware_id')
    if (hwId) {
      setHardwareIdParam(hwId)
      setRegisterModalOpen(true)
    }

    // التحقق من المسار
    if (window.location.pathname === '/register') {
      setRegisterModalOpen(true)
    }
  }, [])

  const fetchDevices = async () => {
    try {
      const res = await fetch('/api/devices')
      if (res.ok) {
        const data = await res.json()
        setDevices(data)
      } else {
        setDevices(mockData) // Fallback to mock data
      }
    } catch (err) {
      setDevices(mockData) // Fallback to mock data
    }
  }

  const handleLogin = async () => {
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      const data = await res.json()
      if (data.success) {
        localStorage.setItem("isLoggedIn", "true")
        setIsLoggedIn(true)
        setError('')
        fetchDevices()
      } else {
        setError(data.error || 'بيانات الدخول غير صحيحة!')
      }
    } catch (err) {
      setError('حدث خطأ أثناء الاتصال بالسيرفر')
    }
  }

  const handleLogout = () => {
    localStorage.setItem("isLoggedIn", "false")
    setIsLoggedIn(false)
  }

  const handleRegisterDevice = async () => {
    if (!newCustomerName) {
      alert('يرجى إدخال اسم العميل!')
      return
    }

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hardwareId: hardwareIdParam,
          machineName: newCustomerName
        })
      })

      if (res.ok) {
        alert('تم تسجيل الجهاز بنجاح!')
        setRegisterModalOpen(false)
        fetchDevices() // تحديث القائمة
      } else {
        const data = await res.json()
        alert('فشل التسجيل: ' + data.error)
      }
    } catch (err) {
      alert('حدث خطأ أثناء الاتصال بالسيرفر')
    }
  }

  const renderRegisterModal = () => (
    <div className={`modal-overlay ${registerModalOpen ? 'active' : ''}`} style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0, 0, 0, 0.8)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, opacity: registerModalOpen ? 1 : 0, visibility: registerModalOpen ? 'visible' : 'hidden', transition: 'all 0.3s ease' }}>
      <div className="modal-content glass" style={{ width: '90%', maxWidth: '400px', padding: '30px', textAlign: 'center', transform: registerModalOpen ? 'scale(1)' : 'scale(0.8)', transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
        <div className="modal-title" style={{ fontSize: '20px', fontWeight: '700', marginBottom: '20px', color: 'var(--primary)' }}>تسجيل جهاز جديد</div>
        
        <div className="form-group" style={{ marginBottom: '20px', textAlign: 'right' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>معرف العتاد (Hardware ID)</label>
          <input type="text" value={hardwareIdParam} onChange={(e) => setHardwareIdParam(e.target.value)} style={{ width: '100%', padding: '12px 16px', background: 'rgba(0, 0, 0, 0.2)', border: '1px solid var(--card-border)', borderRadius: '8px', color: 'white', fontSize: '16px', textAlign: 'right' }} placeholder="مثلاً: GENO-TEST-1234" disabled={!!new URLSearchParams(window.location.search).get('hardware_id')} />
        </div>
        
        <div className="form-group" style={{ marginBottom: '20px', textAlign: 'right' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>اسم العميل / المختبر</label>
          <input type="text" value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} style={{ width: '100%', padding: '12px 16px', background: 'rgba(0, 0, 0, 0.2)', border: '1px solid var(--card-border)', borderRadius: '8px', color: 'white', fontSize: '16px', textAlign: 'right' }} placeholder="مثلاً: مختبر الأمل" />
        </div>
        
        <button className="btn-primary" onClick={handleRegisterDevice} style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)', border: 'none', borderRadius: '8px', color: '#0b0f19', fontSize: '16px', fontWeight: '700', cursor: 'pointer' }}>تسجيل الجهاز</button>
        
        <button className="close-modal" onClick={() => setRegisterModalOpen(false)} style={{ marginTop: '10px', background: 'transparent', border: '1px solid var(--card-border)', color: 'var(--text-muted)', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', width: '100%' }}>إلغاء</button>
      </div>
    </div>
  )

  const generateQR = async (type, deviceId, customerName) => {
    const randomCode = Math.floor(100000 + Math.random() * 900000)
    setManualCode(randomCode.toString())

    let dataToEncode = ""
    let title = ""
    let desc = ""

    if (type === 'unlock') {
      title = `🔑 فك حجب جهاز: ${deviceId}`
      desc = `هذا الرمز مخصص لفتح حجب النظام في ${customerName} لمدة 30 دقيقة.`
      dataToEncode = JSON.stringify({
        testId: "UNLOCK",
        testName: "Unlock System",
        quantity: 1,
        deviceId: deviceId,
        expiry: new Date(new Date().getTime() + 30 * 60000).toISOString()
      })
    } else {
      title = `🧪 إضافة فحص لجهاز: ${deviceId}`
      desc = `هذا الرمز مخصص لشحن رصيد فحوصات في ${customerName}.`
      dataToEncode = JSON.stringify({
        testId: "TEST-789",
        testName: "CBC-Full",
        quantity: 100,
        deviceId: deviceId,
        expiry: "2027-12-31"
      })
    }

    setModalTitle(title)
    setModalDesc(desc)

    const encodedData = encodeURIComponent(dataToEncode)
    setQrSrc(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodedData}&bgcolor=ffffff`)
    setModalOpen(true)

    // إرسال الكود للـ DB السحابية ليتم قبوله عند التحقق
    try {
      await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrHash: randomCode.toString(), // للتبسيط نستخدم الكود اليدوي كـ Hash أو الـ QR بالكامل
          testId: type === 'unlock' ? "UNLOCK" : "TEST-789",
          quantity: type === 'unlock' ? 0 : 100,
          deviceId: deviceId
        })
      })
    } catch (err) {
      console.error("Failed to register QR in cloud", err)
    }
  }

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Print QR Only</title>
          <style>
            body { display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
            img { width: 300px; height: 300px; }
          </style>
        </head>
        <body>
          <img src="${qrSrc}" alt="QR Code" onload="window.print();window.close();" />
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  const handleCopyLink = (hardwareId) => {
    const link = `${window.location.origin}/portal?id=${hardwareId}`;
    navigator.clipboard.writeText(link);
    alert('تم نسخ الرابط بنجاح!');
  }

  const handleEdit = (device) => {
    setCurrentDevice(device)
    setNewCustomerName(device.customer)
    setEditModalOpen(true)
  }

  const handleSaveEdit = async () => {
    try {
      const res = await fetch('/api/update_device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hardwareId: currentDevice.id, customerName: newCustomerName })
      })
      const data = await res.json()
      if (data.success) {
        setEditModalOpen(false)
        fetchDevices()
        alert('تم تعديل البيانات بنجاح!')
      }
    } catch (err) {
      alert('حدث خطأ أثناء التعديل')
    }
  }

  const handleDelete = async (hardwareId) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا العميل نهائياً؟')) return;
    try {
      const res = await fetch('/api/delete_device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hardwareId })
      })
      const data = await res.json()
      if (data.success) {
        fetchDevices()
        alert('تم حذف العميل بنجاح!')
      }
    } catch (err) {
      alert('حدث خطأ أثناء الحذف')
    }
  }

  const handleResetHardwareLock = async (hardwareId, customerName) => {
    if (!window.confirm(`هل أنت متأكد من إعادة تعيين قفل الععتاد لـ ${customerName}؟\nسيؤدي هذا إلى فك الارتباط وبصمة الـ PC الحالي تلقائياً والسماح بربط الحاسوب/الجهاز الجديد عند أول اتصال.`)) return;
    try {
      const res = await fetch('/api/update_device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hardwareId, resetHardwareLock: true })
      })
      const data = await res.json()
      if (data.success) {
        alert('تم فك قفل العتاد بنجاح! جاهز للاعتمد التلقائي الجديد.')
        fetchDevices()
      } else {
        alert('فشل إعادة تعيين القفل: ' + data.error)
      }
    } catch (err) {
      alert('حدث خطأ أثناء الاتصال بالسيرفر')
    }
  }

  if (!isLoggedIn) {
    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <div id="login-container" className="glass" style={{ width: '100%', maxWidth: '400px', padding: '40px', textAlign: 'center' }}>
            <div className="logo" style={{ fontSize: '28px', fontWeight: '900', color: 'var(--primary)', textShadow: '0 0 20px var(--primary-glow)', marginBottom: '10px' }}>GENOTEK GUARD</div>
            <div className="subtitle" style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '30px' }}>نظام إدارة صلاحيات الأجهزة السحابي</div>
            
            <div className="form-group" style={{ marginBottom: '20px', textAlign: 'right' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>اسم المستخدم</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} style={{ width: '100%', padding: '12px 16px', background: 'rgba(0, 0, 0, 0.2)', border: '1px solid var(--card-border)', borderRadius: '8px', color: 'white', fontSize: '16px', textAlign: 'right' }} />
            </div>
            
            <div className="form-group" style={{ marginBottom: '20px', textAlign: 'right' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>كلمة المرور</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%', padding: '12px 16px', background: 'rgba(0, 0, 0, 0.2)', border: '1px solid var(--card-border)', borderRadius: '8px', color: 'white', fontSize: '16px', textAlign: 'right' }} />
            </div>
            
            <button className="btn-primary" onClick={handleLogin} style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)', border: 'none', borderRadius: '8px', color: '#0b0f19', fontSize: '16px', fontWeight: '700', cursor: 'pointer' }}>تسجيل الدخول</button>
            
            {error && <div className="error-msg" style={{ color: 'var(--danger)', fontSize: '14px', marginTop: '15px', background: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>{error}</div>}
          </div>
        </div>
        {renderRegisterModal()}
      </>
    )
  }

  return (
    <div style={{ padding: '20px', width: '100%', maxWidth: '1200px', margin: '0 auto' }}>
      <div id="dashboard-container" className="glass" style={{ padding: '30px', display: 'flex', flexDirection: 'column', gap: '30px' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--card-border)', paddingBottom: '20px' }}>
          <div>
            <div className="logo" style={{ fontSize: '24px', fontWeight: '900', color: 'var(--primary)', textShadow: '0 0 20px var(--primary-glow)' }}>GENOTEK DASHBOARD</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>مرحباً بك في نظام الإدارة المركزي</div>
          </div>
          
          <div className="user-info" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div className="avatar" style={{ width: '40px', height: '40px', background: 'var(--primary)', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#0b0f19', fontWeight: 'bold' }}>A</div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: '600' }}>المهندس (AFLO)</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>مسؤول النظام</div>
            </div>
            <button onClick={() => { setRegisterModalOpen(true); if (!hardwareIdParam) setHardwareIdParam("GENO-" + Math.random().toString(36).substring(2, 10).toUpperCase()); }} style={{ background: 'var(--primary)', border: 'none', color: '#0b0f19', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>تسجيل جهاز</button>
            <button className="logout-btn" onClick={handleLogout} style={{ background: 'transparent', border: '1px solid var(--card-border)', color: 'var(--text-muted)', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}>تسجيل الخروج</button>
          </div>
        </header>

        {/* كروت الإحصائيات */}
        <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px' }}>
          <div className="stat-card glass" style={{ padding: '20px', textAlign: 'center' }}>
            <div className="stat-value" style={{ fontSize: '32px', fontWeight: '900', color: 'var(--primary)' }}>{devices.length}</div>
            <div className="stat-label" style={{ color: 'var(--text-muted)', fontSize: '14px' }}>إجمالي العملاء</div>
          </div>
          <div className="stat-card glass" style={{ padding: '20px', textAlign: 'center' }}>
            <div className="stat-value" style={{ fontSize: '32px', fontWeight: '900', color: 'var(--primary)' }}>{devices.length}</div>
            <div className="stat-label" style={{ color: 'var(--text-muted)', fontSize: '14px' }}>الأجهزة الإجمالية</div>
          </div>
          <div className="stat-card glass" style={{ padding: '20px', textAlign: 'center' }}>
            <div className="stat-value" style={{ fontSize: '32px', fontWeight: '900', color: 'var(--success)' }}>{devices.filter(d => d.status === 'online').length}</div>
            <div className="stat-label" style={{ color: 'var(--text-muted)', fontSize: '14px' }}>متصل الآن</div>
          </div>
          <div className="stat-card glass" style={{ padding: '20px', textAlign: 'center' }}>
            <div className="stat-value" style={{ fontSize: '32px', fontWeight: '900', color: 'var(--danger)' }}>{devices.filter(d => d.status === 'offline').length}</div>
            <div className="stat-label" style={{ color: 'var(--text-muted)', fontSize: '14px' }}>منقطع (أكثر من 72 ساعة)</div>
          </div>
          <div className="stat-card glass" style={{ padding: '20px', textAlign: 'center', cursor: 'pointer', border: '1px solid rgba(245,158,11,0.25)' }} onClick={() => alert('انقر على زر 📊 الفحوصات لأي جهاز لإدارة رصيده')}>
            <div style={{ fontSize: '28px', marginBottom: '4px' }}>🧪</div>
            <div className="stat-label" style={{ color: '#f59e0b', fontSize: '13px', fontWeight: '700' }}>إدارة حصص الفحوصات</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '4px' }}>اضغط 📊 على أي جهاز</div>
          </div>
        </div>

        {/* جدول الأجهزة */}
        <div className="table-container glass" style={{ width: '100%', overflowX: 'auto', padding: '20px', background: 'rgba(0,0,0,0.2)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
            <thead>
              <tr>
                <th style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '14px', borderBottom: '1px solid var(--card-border)' }}>اسم العميل</th>
                <th style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '14px', borderBottom: '1px solid var(--card-border)' }}>اسم الجهاز</th>
                <th style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '14px', borderBottom: '1px solid var(--card-border)' }}>الحالة</th>
                <th style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '14px', borderBottom: '1px solid var(--card-border)' }}>آخر اتصال</th>
                <th style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '14px', borderBottom: '1px solid var(--card-border)' }}>العمليات</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((item, index) => {
                const isBlocked = item.status === "blocked"
                const isOfflineRed = item.lastSeen.includes("أيام") || item.status === "offline" || isBlocked
                
                let statusText = "منقطع"
                if (isBlocked) {
                  statusText = "محظور (تلاعب)"
                } else if (item.status === "online" || item.status === "Connected") {
                  statusText = "متصل"
                }

                return (
                  <tr key={index} style={{ borderBottom: '1px solid var(--card-border)' }}>
                    <td style={{ padding: '16px', fontWeight: '600' }}>
                      <div>{item.customer}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'right' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>💻 بصمة الحاسب: <code style={{ color: '#00f2fe', background: 'rgba(0,242,254,0.08)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', direction: 'ltr' }}>{item.authorizedMachineHash}</code></span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>🧪 سيريال الكيمياء: <code style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.08)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', direction: 'ltr' }}>{item.authorizedAnalyzerSerial}</code></span>
                      </div>
                    </td>
                    <td style={{ padding: '16px' }}><code style={{ color: 'var(--primary)' }}>{item.device}</code> ({item.id})</td>
                    <td style={{ padding: '16px' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 12px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: '600',
                        background: isBlocked ? 'rgba(239, 68, 68, 0.15)' : (statusText === 'متصل' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(156, 163, 175, 0.15)'),
                        color: isBlocked ? '#f87171' : (statusText === 'متصل' ? '#34d399' : '#9ca3af'),
                        border: `1px solid ${isBlocked ? 'rgba(239, 68, 68, 0.3)' : (statusText === 'متصل' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(156, 163, 175, 0.3)')}`
                      }}>
                        <span style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          display: 'inline-block',
                          background: isBlocked ? '#ef4444' : (statusText === 'متصل' ? '#10b981' : '#9ca3af'),
                          boxShadow: isBlocked ? '0 0 8px #ef4444' : (statusText === 'متصل' ? '0 0 8px #10b981' : 'none')
                        }}></span>
                        {statusText}
                      </span>
                    </td>
                    <td style={{ padding: '16px', color: isBlocked ? 'var(--danger)' : (isOfflineRed ? 'var(--danger)' : 'var(--text-muted)') }}>{item.lastSeen}</td>
                    <td style={{ padding: '16px' }}>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button className="action-btn btn-unlock" onClick={() => generateQR('unlock', item.id, item.customer)} style={{ padding: '8px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', background: 'rgba(0, 255, 255, 0.1)', color: 'var(--primary)', border: '1px solid rgba(0, 255, 255, 0.2)' }}>🔓 فك الحجب</button>
                        <button className="action-btn btn-test" onClick={() => generateQR('test', item.id, item.customer)} style={{ padding: '8px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', background: 'rgba(255, 215, 0, 0.1)', color: 'var(--accent)', border: '1px solid rgba(255, 215, 0, 0.2)' }}>🧪 شحن QR</button>
                        <button className="action-btn btn-quota" onClick={() => setQuotaDevice(item)} style={{ padding: '8px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)' }}>📊 الفحوصات</button>
                        <button className="action-btn btn-reset-hw" onClick={() => handleResetHardwareLock(item.id, item.customer)} style={{ padding: '8px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.25)' }}>🔄 فك قفل العتاد</button>
                        <button className="action-btn btn-copy" onClick={() => handleCopyLink(item.id)} style={{ padding: '8px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', background: 'rgba(255, 255, 255, 0.1)', color: 'var(--text)', border: '1px solid rgba(255, 255, 255, 0.2)' }}>🔗 نسخ الرابط</button>
                        <button className="action-btn btn-edit" onClick={() => handleEdit(item)} style={{ padding: '8px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', background: 'rgba(0, 150, 255, 0.1)', color: '#00c3ff', border: '1px solid rgba(0, 150, 255, 0.2)' }}>✏️ تعديل</button>
                        <button className="action-btn btn-delete" onClick={() => handleDelete(item.id)} style={{ padding: '8px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', background: 'rgba(255, 0, 0, 0.1)', color: 'var(--danger)', border: '1px solid rgba(255, 0, 0, 0.2)' }}>🗑️ حذف</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* النافذة المنبثقة للـ QR */}
      <div className={`modal-overlay ${modalOpen ? 'active' : ''}`} style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0, 0, 0, 0.8)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, opacity: modalOpen ? 1 : 0, visibility: modalOpen ? 'visible' : 'hidden', transition: 'all 0.3s ease' }}>
        <div className="modal-content glass" style={{ width: '90%', maxWidth: '400px', padding: '30px', textAlign: 'center', transform: modalOpen ? 'scale(1)' : 'scale(0.8)', transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
          <div className="modal-title" style={{ fontSize: '20px', fontWeight: '700', marginBottom: '20px', color: 'var(--primary)' }}>{modalTitle}</div>
          
          <div className="qr-placeholder" style={{ width: '200px', height: '200px', background: 'white', margin: '0 auto 20px auto', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px' }}>
            {qrSrc && <img src={qrSrc} alt="QR Code" style={{ width: '100%', height: '100%' }} />}
          </div>
          
          <div style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '5px' }}>الكود اليدوي البديل:</div>
          <div className="manual-code" style={{ fontSize: '24px', fontWeight: '900', letterSpacing: '4px', color: 'var(--accent)', marginBottom: '10px', textShadow: '0 0 10px rgba(255, 215, 0, 0.2)' }}>{manualCode}</div>
          
          <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{modalDesc}</div>
          
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'center' }}>
            <button className="print-btn" onClick={handlePrint} style={{ background: 'var(--primary)', border: 'none', color: '#0b0f19', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>🖨️ طباعة</button>
            <button className="close-modal" onClick={() => setModalOpen(false)} style={{ background: 'transparent', border: '1px solid var(--card-border)', color: 'var(--text-muted)', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer' }}>إغلاق النافذة</button>
          </div>
        </div>
      </div>

      {/* النافذة المنبثقة للتعديل */}
      <div className={`modal-overlay \${editModalOpen ? 'active' : ''}`} style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0, 0, 0, 0.8)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, opacity: editModalOpen ? 1 : 0, visibility: editModalOpen ? 'visible' : 'hidden', transition: 'all 0.3s ease' }}>
        <div className="modal-content glass" style={{ width: '90%', maxWidth: '400px', padding: '30px', textAlign: 'center', transform: editModalOpen ? 'scale(1)' : 'scale(0.8)', transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
          <div className="modal-title" style={{ fontSize: '20px', fontWeight: '700', marginBottom: '20px', color: 'var(--primary)' }}>تعديل بيانات العميل</div>
          
          <div style={{ marginBottom: '20px', textAlign: 'right' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)', fontSize: '14px' }}>اسم العميل الجديد:</label>
            <input 
              type="text" 
              value={newCustomerName} 
              onChange={(e) => setNewCustomerName(e.target.value)} 
              style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--card-border)', color: 'white', fontSize: '14px' }}
            />
          </div>
          
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button onClick={handleSaveEdit} style={{ background: 'var(--primary)', border: 'none', color: '#0b0f19', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>حفظ التعديلات</button>
            <button onClick={() => setEditModalOpen(false)} style={{ background: 'transparent', border: '1px solid var(--card-border)', color: 'var(--text-muted)', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer' }}>إلغاء</button>
          </div>
        </div>
      </div>

      {renderRegisterModal()}
      {quotaDevice && <QuotaManager device={quotaDevice} onClose={() => setQuotaDevice(null)} />}
    </div>
  )
}

export default App
