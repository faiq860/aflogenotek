import { useState, useEffect } from 'react'

const TEST_TYPES = [
  { code: 'GLU',   name: 'GLU - سكر الدم' },
  { code: 'CBC',   name: 'CBC - تعداد الدم الكامل' },
  { code: 'CRE',   name: 'CRE - الكرياتينين' },
  { code: 'CHOL',  name: 'CHOL - الكوليسترول' },
  { code: 'URIC',  name: 'URIC - حمض اليوريك' },
  { code: 'HBA1C', name: 'HbA1c - السكر التراكمي' },
  { code: 'TSH',   name: 'TSH - الغدة الدرقية' },
  { code: 'UA',    name: 'UA - تحليل البول' },
  { code: 'LFT',   name: 'LFT - وظائف الكبد' },
  { code: 'KFT',   name: 'KFT - وظائف الكلى' },
]

function QuotaBar({ used, total }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0
  const remaining = total - used
  const color = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#10b981'
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
        <span style={{ color: '#8b9bb4' }}>مستخدم: {used.toLocaleString()}</span>
        <span style={{ color: remaining <= 0 ? '#ef4444' : '#10b981', fontWeight: '700' }}>
          متبقي: {remaining.toLocaleString()}
        </span>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '6px', height: '8px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, background: color, height: '100%', borderRadius: '6px', transition: 'width 0.5s ease' }} />
      </div>
      <div style={{ textAlign: 'left', fontSize: '11px', color: '#8b9bb4', marginTop: '2px' }}>{pct}% مستخدم من {total.toLocaleString()}</div>
    </div>
  )
}

export default function QuotaManager({ device, onClose, onGenerateQR }) {
  const [quotas, setQuotas] = useState([])
  const [loading, setLoading] = useState(true)
  const [addMode, setAddMode] = useState(false)
  const [form, setForm] = useState({ testCode: 'GLU', quantity: 1000, alertThreshold: 20, validHours: 72 })
  const [saving, setSaving] = useState(false)
  const [qrModal, setQrModal] = useState(null)
  const [generatingQR, setGeneratingQR] = useState(false)

  const fetchQuotas = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/test_quotas?device_id=${device.id}`)
      if (res.ok) {
        const data = await res.json()
        setQuotas(data.quotas || [])
      }
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { fetchQuotas() }, [device.id])

  const handleAdd = async () => {
    if (!form.quantity || form.quantity <= 0) return alert('يرجى إدخال عدد صحيح')
    const selectedTest = TEST_TYPES.find(t => t.code === form.testCode)
    setSaving(true)
    try {
      const res = await fetch('/api/test_quotas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upsert',
          deviceId: device.id,
          testCode: form.testCode,
          testName: selectedTest?.name || form.testCode,
          totalQuota: Number(form.quantity),
          alertThreshold: Number(form.alertThreshold)
        })
      })
      if (res.ok) {
        setAddMode(false)
        setForm({ testCode: 'GLU', quantity: 1000, alertThreshold: 20, validHours: 72 })
        await fetchQuotas()
      } else {
        const d = await res.json()
        alert('خطأ: ' + d.error)
      }
    } catch (e) { alert('فشل الاتصال') }
    setSaving(false)
  }

  const handleDelete = async (testCode) => {
    if (!confirm(`هل أنت متأكد من حذف فحص ${testCode}؟`)) return
    await fetch('/api/test_quotas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', deviceId: device.id, testCode })
    })
    fetchQuotas()
  }

  const handleGenerateQR = async (quota) => {
    const defaultQty = Number(quota.total_quota) > 0 ? Number(quota.total_quota) : 1000;
    const inputQty = prompt(`أدخل كمية الفحوصات المراد شحنها لـ (${quota.test_code}):`, defaultQty);
    if (inputQty === null) return; // User cancelled
    
    const quantity = Number(inputQty);
    if (isNaN(quantity) || quantity <= 0) {
      alert('يرجى إدخال كمية صحيحة أكبر من الصفر');
      return;
    }

    setGeneratingQR(true)
    try {
      const res = await fetch('/api/generate_quota_qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: device.id,
          testCode: quota.test_code,
          testName: quota.test_name,
          quantity: quantity,
          validHours: Number(form.validHours || 72)
        })
      })
      if (res.ok) {
        const data = await res.json()
        setQrModal({ ...data, quota })
      } else {
        const d = await res.json()
        alert('فشل توليد QR: ' + d.error)
      }
    } catch (e) { alert('فشل الاتصال') }
    setGeneratingQR(false)
  }

  const handlePrintQR = () => {
    if (!qrModal) return
    const w = window.open('', '_blank')
    w.document.write(`
      <html><head><title>QR - ${qrModal.details?.testCode}</title>
      <style>body{font-family:Arial;text-align:center;padding:30px;background:#fff;color:#000}
      h2{color:#0b0f19}p{color:#555;font-size:14px}img{border:2px solid #eee;border-radius:12px;padding:8px}
      .info{background:#f5f5f5;padding:15px;border-radius:8px;margin-top:15px;font-size:13px}
      </style></head><body>
      <h2>🧪 ${qrModal.details?.testName}</h2>
      <p>جهاز: <strong>${device.customer}</strong> | ${device.id}</p>
      <img src="${qrModal.qrImageUrl}" width="250" height="250" onload="setTimeout(()=>{window.print();window.close()},300)" />
      <div class="info">
        <b>الكمية:</b> ${qrModal.details?.quantity?.toLocaleString()} فحص<br/>
        <b>تنتهي:</b> ${new Date(qrModal.expiresAt).toLocaleString('ar-EG')}
      </div></body></html>`)
    w.document.close()
  }

  const s = {
    overlay: { position:'fixed',top:0,left:0,width:'100%',height:'100%',background:'rgba(0,0,0,0.85)',backdropFilter:'blur(10px)',display:'flex',justifyContent:'center',alignItems:'center',zIndex:2000 },
    box: { width:'90%',maxWidth:'700px',maxHeight:'90vh',overflowY:'auto',background:'rgba(11,15,25,0.97)',border:'1px solid rgba(0,255,255,0.2)',borderRadius:'20px',padding:'30px' },
    title: { fontSize:'20px',fontWeight:'900',color:'#00ffff',marginBottom:'20px',display:'flex',justifyContent:'space-between',alignItems:'center' },
    btn: (bg, color='#0b0f19') => ({ padding:'8px 16px',borderRadius:'8px',border:'none',background:bg,color,fontWeight:'700',cursor:'pointer',fontSize:'13px' }),
    card: { background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'12px',padding:'16px',marginBottom:'12px' },
    input: { width:'100%',padding:'10px 12px',background:'rgba(0,0,0,0.3)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:'8px',color:'white',fontSize:'14px' },
    label: { display:'block',marginBottom:'6px',color:'#8b9bb4',fontSize:'13px' }
  }

  return (
    <div style={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={s.box}>
        <div style={s.title}>
          <span>🧪 إدارة حصص الفحوصات — {device.customer}</span>
          <button onClick={onClose} style={{ background:'transparent',border:'none',color:'#8b9bb4',fontSize:'22px',cursor:'pointer' }}>✕</button>
        </div>
        <div style={{ fontSize:'13px',color:'#8b9bb4',marginBottom:'20px' }}>معرف الجهاز: <code style={{color:'#00ffff'}}>{device.id}</code></div>

        {/* قائمة الحصص */}
        {loading ? (
          <div style={{ textAlign:'center',color:'#8b9bb4',padding:'30px' }}>⏳ جاري التحميل...</div>
        ) : quotas.length === 0 ? (
          <div style={{ textAlign:'center',color:'#8b9bb4',padding:'30px',background:'rgba(255,255,255,0.02)',borderRadius:'12px' }}>
            لا توجد فحوصات مضافة. اضغط "+ إضافة فحص" للبدء.
          </div>
        ) : (
          quotas.map(q => {
            const remaining = Number(q.total_quota) - Number(q.used_count)
            const pct = q.total_quota > 0 ? Math.round((q.used_count / q.total_quota) * 100) : 0
            const needsRenewal = remaining <= 0
            const lowWarn = pct >= (100 - (q.alert_threshold || 20))
            return (
              <div key={q.test_code} style={{ ...s.card, borderColor: needsRenewal ? 'rgba(239,68,68,0.4)' : lowWarn ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.08)' }}>
                <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'12px' }}>
                  <div>
                    <div style={{ fontWeight:'700',fontSize:'16px',color:'#fff' }}>{q.test_code}</div>
                    <div style={{ fontSize:'12px',color:'#8b9bb4' }}>{q.test_name}</div>
                    {needsRenewal && <span style={{ fontSize:'11px',background:'rgba(239,68,68,0.15)',color:'#ef4444',padding:'2px 8px',borderRadius:'20px',marginTop:'4px',display:'inline-block' }}>🚨 الرصيد منتهٍ — يحتاج تجديد</span>}
                    {!needsRenewal && lowWarn && <span style={{ fontSize:'11px',background:'rgba(245,158,11,0.15)',color:'#f59e0b',padding:'2px 8px',borderRadius:'20px',marginTop:'4px',display:'inline-block' }}>⚠️ رصيد منخفض</span>}
                  </div>
                  <div style={{ display:'flex',gap:'8px' }}>
                    <button onClick={() => handleGenerateQR(q)} disabled={generatingQR} style={s.btn('linear-gradient(135deg,#00f2fe,#4facfe)')}>
                      {generatingQR ? '...' : '📲 توليد QR'}
                    </button>
                    <button onClick={() => handleDelete(q.test_code)} style={s.btn('rgba(239,68,68,0.1)','#ef4444')}>🗑️</button>
                  </div>
                </div>
                <QuotaBar used={Number(q.used_count)} total={Number(q.total_quota)} />
              </div>
            )
          })
        )}

        {/* نموذج إضافة فحص */}
        {addMode ? (
          <div style={{ ...s.card, borderColor:'rgba(0,255,255,0.2)',marginTop:'16px' }}>
            <div style={{ fontWeight:'700',color:'#00ffff',marginBottom:'16px' }}>+ إضافة / تجديد فحص</div>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',marginBottom:'12px' }}>
              <div>
                <label style={s.label}>نوع الفحص</label>
                <select value={form.testCode} onChange={e => setForm(p=>({...p,testCode:e.target.value}))} style={s.input}>
                  {TEST_TYPES.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label style={s.label}>عدد الفحوصات</label>
                <input type="number" min="1" value={form.quantity} onChange={e => setForm(p=>({...p,quantity:e.target.value}))} style={s.input} placeholder="مثال: 1000" />
              </div>
              <div>
                <label style={s.label}>عتبة التنبيه (% متبقي)</label>
                <input type="number" min="5" max="50" value={form.alertThreshold} onChange={e => setForm(p=>({...p,alertThreshold:e.target.value}))} style={s.input} placeholder="20" />
              </div>
              <div>
                <label style={s.label}>صلاحية QR (ساعة)</label>
                <input type="number" min="1" max="720" value={form.validHours} onChange={e => setForm(p=>({...p,validHours:e.target.value}))} style={s.input} placeholder="72" />
              </div>
            </div>
            <div style={{ display:'flex',gap:'10px' }}>
              <button onClick={handleAdd} disabled={saving} style={s.btn('linear-gradient(135deg,#00f2fe,#4facfe)')}>
                {saving ? '⏳ جاري الحفظ...' : '✅ حفظ'}
              </button>
              <button onClick={() => setAddMode(false)} style={s.btn('rgba(255,255,255,0.08)','#8b9bb4')}>إلغاء</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAddMode(true)} style={{ ...s.btn('rgba(0,255,255,0.1)','#00ffff'), marginTop:'16px', width:'100%', padding:'12px', border:'1px dashed rgba(0,255,255,0.3)' }}>
            + إضافة فحص جديد / تجديد رصيد
          </button>
        )}
      </div>

      {/* نافذة QR Code */}
      {qrModal && (
        <div style={{ ...s.overlay, zIndex:3000 }} onClick={e => e.target === e.currentTarget && setQrModal(null)}>
          <div style={{ ...s.box, maxWidth:'380px', textAlign:'center' }}>
            <div style={{ fontSize:'18px',fontWeight:'900',color:'#00ffff',marginBottom:'6px' }}>
              📲 QR تجديد فحص {qrModal.details?.testCode}
            </div>
            <div style={{ fontSize:'13px',color:'#8b9bb4',marginBottom:'20px' }}>{device.customer}</div>
            <div style={{ background:'white',padding:'12px',borderRadius:'16px',display:'inline-block',marginBottom:'16px' }}>
              <img src={qrModal.qrImageUrl} alt="QR Code" style={{ width:'220px',height:'220px',display:'block' }} />
            </div>
            <div style={{ background:'rgba(0,255,255,0.05)',border:'1px solid rgba(0,255,255,0.15)',borderRadius:'10px',padding:'14px',marginBottom:'16px',fontSize:'13px',textAlign:'right' }}>
              <div>🧪 <b>الفحص:</b> {qrModal.details?.testName}</div>
              <div>📦 <b>الكمية:</b> <span style={{color:'#00ffff',fontWeight:'700'}}>{Number(qrModal.details?.quantity).toLocaleString()} فحص</span></div>
              <div>⏱️ <b>تنتهي الصلاحية:</b> {new Date(qrModal.expiresAt).toLocaleString('ar-EG')}</div>
            </div>
            <div style={{ display:'flex',gap:'10px',justifyContent:'center' }}>
              <button onClick={handlePrintQR} style={s.btn('linear-gradient(135deg,#00f2fe,#4facfe)')}>🖨️ طباعة</button>
              <button onClick={() => setQrModal(null)} style={s.btn('rgba(255,255,255,0.08)','#8b9bb4')}>إغلاق</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
