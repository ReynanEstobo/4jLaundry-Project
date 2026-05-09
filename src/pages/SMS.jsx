import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useRealtime } from '../lib/useRealtime'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import {
  Send, Search, MessageSquare, Phone, Mail,
  CheckCircle, XCircle, Clock, RefreshCw, Loader
} from 'lucide-react'

// SMS Templates
const TEMPLATES = [
  { id: 'ready', label: 'Ready for Pickup', message: 'Hi {name}! Your laundry (Order #{order}) is ready for pickup at 4J Laundry. Thank you!' },
  { id: 'received', label: 'Order Received', message: 'Hi {name}! We received your laundry (Order #{order}). Estimated completion: {time}. Thank you for choosing 4J Laundry!' },
  { id: 'reminder', label: 'Pickup Reminder', message: 'Hi {name}! Friendly reminder: Your laundry (Order #{order}) is still waiting for pickup at 4J Laundry. Please pick up at your earliest convenience.' },
  { id: 'promo', label: 'Promotion', message: 'Hi {name}! 4J Laundry has a special promo this week! Avail 20% off on all services. Visit us today!' },
]

export default function SMS() {
  const [logs, setLogs] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [tab, setTab] = useState('email')
  const [search, setSearch] = useState('')
  const [emailSending, setEmailSending] = useState({})

  const [form, setForm] = useState({
    order_id: '',
    phone: '',
    message: '',
    template: ''
  })

  const [emailForm, setEmailForm] = useState({
    to: '',
    subject: '',
    body: ''
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    const [logsRes, ordersRes] = await Promise.all([
      supabase.from('sms_log').select('*, orders(order_number), customers(name)')
        .order('sent_at', { ascending: false }).limit(100),
      supabase.from('orders').select('*, customers(name, phone, email)')
        .in('status', ['washing', 'drying', 'folding', 'ready'])
        .order('created_at', { ascending: false })
    ])
    setLogs(logsRes.data || [])
    setOrders(ordersRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Realtime: refresh when SMS logs or orders change
  useRealtime(['sms_log', 'orders'], loadData)

  function selectOrder(orderId) {
    const order = orders.find(o => o.id === orderId)
    if (order) {
      setForm(f => ({
        ...f,
        order_id: orderId,
        phone: order.customers?.phone || ''
      }))
    }
  }

  function applyTemplate(templateId) {
    const tpl = TEMPLATES.find(t => t.id === templateId)
    if (!tpl) return
    const order = orders.find(o => o.id === form.order_id)
    let msg = tpl.message
      .replace('{name}', order?.customers?.name || 'Customer')
      .replace('{order}', order?.order_number || '—')
      .replace('{time}', order?.estimated_completion
        ? format(new Date(order.estimated_completion), 'MMM d, h:mm a')
        : '—')
    setForm(f => ({ ...f, template: templateId, message: msg }))
  }

  async function handleSend(e) {
    e.preventDefault()
    if (!form.phone || !form.message) return toast.error('Phone and message are required')

    setSending(true)
    let smsStatus = 'failed'

    try {
      const res = await fetch('/api/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: form.phone, message: form.message })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        smsStatus = 'sent'
        toast.success('SMS sent successfully!')
      } else {
        toast.error(data.error || 'Failed to send SMS')
      }
    } catch {
      toast.error('Failed to send SMS — check network')
    }

    // Log to database
    await supabase.from('sms_log').insert({
      order_id: form.order_id || null,
      customer_id: orders.find(o => o.id === form.order_id)?.customer_id || null,
      phone: form.phone,
      message: form.message,
      status: smsStatus
    })

    if (smsStatus === 'sent') setForm({ order_id: '', phone: '', message: '', template: '' })
    loadData()
    setSending(false)
  }

  // Send email via Netlify function
  async function handleSendEmail(e) {
    e.preventDefault()
    if (!emailForm.to || !emailForm.subject || !emailForm.body) return toast.error('All email fields are required')

    setSending(true)
    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emailForm)
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('Email sent successfully!')
        setEmailForm({ to: '', subject: '', body: '' })
      } else {
        toast.error(data.error || 'Failed to send email')
      }
    } catch {
      toast.error('Failed to send email — check network')
    }
    setSending(false)
  }

  // Quick email for ready orders
  async function quickEmailReady(order) {
    if (!order.customers?.email) return toast.error('No email address for this customer')

    setEmailSending(prev => ({ ...prev, [order.id]: true }))
    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: order.customers.email,
          subject: `Your Laundry is Ready for Pickup! (Order #${order.order_number})`,
          body: `Hi ${order.customers.name || 'Customer'},\n\nGreat news! Your laundry (Order #${order.order_number}) is now ready for pickup at 4J Laundry.\n\nPlease pick it up at your earliest convenience during our business hours.\n\nThank you for choosing 4J Laundry!\n\n— 4J Laundry Team`
        })
      })
      if (res.ok) {
        toast.success(`Email sent to ${order.customers.email}`)
      } else {
        toast.error('Failed to send email')
      }
    } catch {
      toast.error('Failed to send email')
    }
    setEmailSending(prev => ({ ...prev, [order.id]: false }))
  }

  // Quick send SMS for a ready order
  async function quickSendReady(order) {
    if (!order.customers?.phone) return toast.error('No phone number for this customer')

    setEmailSending(prev => ({ ...prev, [`sms_${order.id}`]: true }))
    const msg = `Hi ${order.customers?.name || 'Customer'}! Your laundry (Order #${order.order_number}) is ready for pickup at 4J Laundry. Thank you!`
    let smsStatus = 'failed'

    try {
      const res = await fetch('/api/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: order.customers.phone, message: msg })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        smsStatus = 'sent'
        toast.success(`SMS sent to ${order.customers.name}`)
      } else {
        toast.error(data.error || 'Failed to send SMS')
      }
    } catch {
      toast.error('Failed to send SMS')
    }

    await supabase.from('sms_log').insert({
      order_id: order.id,
      customer_id: order.customer_id,
      phone: order.customers.phone,
      message: msg,
      status: smsStatus
    })

    setEmailSending(prev => ({ ...prev, [`sms_${order.id}`]: false }))
    loadData()
  }

  const filteredLogs = logs.filter(l => {
    if (!search) return true
    const q = search.toLowerCase()
    return l.phone.includes(q) || l.message.toLowerCase().includes(q) || l.customers?.name?.toLowerCase().includes(q)
  })

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>

  return (
    <>
      <div className="tabs" style={{ display: 'inline-flex', marginBottom: 20 }}>
        <button className={`tab ${tab === 'email' ? 'active' : ''}`} onClick={() => setTab('email')}>
          <Mail size={15} style={{ marginRight: 4 }} /> Email Notify
        </button>
        <button className={`tab ${tab === 'quick' ? 'active' : ''}`} onClick={() => setTab('quick')}>Quick Notify</button>
        <button className={`tab ${tab === 'send' ? 'active' : ''}`} onClick={() => setTab('send')}>Send SMS</button>
        <button className={`tab ${tab === 'logs' ? 'active' : ''}`} onClick={() => setTab('logs')}>SMS Log</button>
      </div>

      {tab === 'email' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 900 }}>
          <div className="card">
            <div className="card-header"><h3><Mail size={18} style={{ marginRight: 6 }} />Compose Email</h3></div>
            <form onSubmit={handleSendEmail}>
              <div className="form-group">
                <label>Recipient Email *</label>
                <input className="form-control" type="email" placeholder="customer@email.com" value={emailForm.to}
                  onChange={e => setEmailForm(f => ({ ...f, to: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label>Subject *</label>
                <input className="form-control" placeholder="e.g. Your laundry is ready!" value={emailForm.subject}
                  onChange={e => setEmailForm(f => ({ ...f, subject: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label>Message *</label>
                <textarea className="form-control" rows={6} placeholder="Type your message..."
                  value={emailForm.body} onChange={e => setEmailForm(f => ({ ...f, body: e.target.value }))} required
                  style={{ minHeight: 150 }} />
              </div>
              <button className="btn btn-primary" type="submit" disabled={sending} style={{ width: '100%', justifyContent: 'center' }}>
                <Mail size={16} /> {sending ? 'Sending...' : 'Send Email'}
              </button>
            </form>
          </div>

          <div className="card">
            <div className="card-header"><h3>Email Info</h3></div>
            <div style={{ padding: '20px 0' }}>
              <div style={{
                background: '#dcfce7',
                border: '1px solid #86efac',
                borderRadius: 'var(--radius-sm)',
                padding: 16, marginBottom: 20
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, color: '#166534', marginBottom: 4 }}>
                  <CheckCircle size={16} /> Gmail Connected
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Email notifications are active via Gmail. Customers with email addresses will be notified automatically when their garment reaches the "Ready" stage.
                </p>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                <p style={{ marginBottom: 8 }}><strong style={{ color: 'var(--text-secondary)' }}>Auto-notifications:</strong></p>
                <ul style={{ paddingLeft: 20, lineHeight: 1.8 }}>
                  <li>Email is sent automatically when garment status reaches <strong>Ready for Pickup</strong></li>
                  <li>Only customers with email addresses receive notifications</li>
                  <li>You can also manually send emails from this tab</li>
                  <li>Use Quick Notify to send pickup emails to ready orders</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'send' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 900 }}>
          <div className="card">
            <div className="card-header"><h3>Compose SMS</h3></div>
            <form onSubmit={handleSend}>
              <div className="form-group">
                <label>Linked Order (optional)</label>
                <select className="form-control" value={form.order_id} onChange={e => { setForm(f => ({ ...f, order_id: e.target.value })); selectOrder(e.target.value) }}>
                  <option value="">No linked order</option>
                  {orders.map(o => (
                    <option key={o.id} value={o.id}>{o.order_number} - {o.customers?.name || 'Walk-in'} ({o.status})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Phone Number *</label>
                <input className="form-control" placeholder="09171234567" value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label>Template</label>
                <select className="form-control" value={form.template} onChange={e => applyTemplate(e.target.value)}>
                  <option value="">Custom message</option>
                  {TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Message * <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({form.message.length}/160)</span></label>
                <textarea className="form-control" rows={4} placeholder="Type your message..."
                  value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} required
                  style={{ minHeight: 120 }} />
              </div>
              <button className="btn btn-primary" type="submit" disabled={sending} style={{ width: '100%', justifyContent: 'center' }}>
                <Send size={16} /> {sending ? 'Sending...' : 'Send SMS'}
              </button>
            </form>
          </div>

          <div className="card">
            <div className="card-header"><h3>SMS Status</h3></div>
            <div style={{ padding: '20px 0' }}>
              <div style={{
                background: '#dcfce7',
                border: '1px solid #86efac',
                borderRadius: 'var(--radius-sm)',
                padding: 16, marginBottom: 20
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, color: '#166534', marginBottom: 4 }}>
                  <CheckCircle size={16} /> Semaphore SMS Active
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  SMS sending is live via Semaphore. Messages are sent immediately using the verified sender name <strong>4JLaundry</strong>.
                </p>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                <p style={{ marginBottom: 8 }}><strong style={{ color: 'var(--text-secondary)' }}>How it works:</strong></p>
                <ul style={{ paddingLeft: 20, lineHeight: 1.8 }}>
                  <li>Compose your SMS message or use a template</li>
                  <li>Messages are sent instantly via Semaphore API</li>
                  <li>Delivery status is logged automatically</li>
                  <li>Track all sent messages in the SMS Log tab</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'logs' && (
        <>
          <div style={{ marginBottom: 20 }}>
            <div className="search-box">
              <Search />
              <input placeholder="Search SMS logs..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Recipient</th>
                    <th>Phone</th>
                    <th>Order</th>
                    <th>Message</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.length === 0 ? (
                    <tr><td colSpan={6} className="empty-state"><p>No SMS logs yet</p></td></tr>
                  ) : filteredLogs.map(log => (
                    <tr key={log.id}>
                      <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{format(new Date(log.sent_at), 'MMM d, h:mm a')}</td>
                      <td style={{ fontWeight: 500 }}>{log.customers?.name || '—'}</td>
                      <td><span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={14} /> {log.phone}</span></td>
                      <td>{log.orders?.order_number || '—'}</td>
                      <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.message}</td>
                      <td>
                        <span className={`badge badge-${log.status}`}>
                          {log.status === 'sent' && <CheckCircle size={12} style={{ marginRight: 4 }} />}
                          {log.status === 'failed' && <XCircle size={12} style={{ marginRight: 4 }} />}
                          {log.status === 'pending' && <Clock size={12} style={{ marginRight: 4 }} />}
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'quick' && (
        <>
          <div style={{ marginBottom: 16 }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              Quickly notify customers about their ready orders via Email or SMS.
            </p>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.filter(o => o.status === 'ready').length === 0 ? (
                    <tr><td colSpan={6} className="empty-state"><p>No orders ready for pickup notification</p></td></tr>
                  ) : orders.filter(o => o.status === 'ready').map(order => (
                    <tr key={order.id}>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{order.order_number}</td>
                      <td>{order.customers?.name || 'Walk-in'}</td>
                      <td>{order.customers?.phone || '—'}</td>
                      <td>{order.customers?.email || '—'}</td>
                      <td><span className="badge badge-ready">ready</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-sm btn-primary" onClick={() => quickEmailReady(order)}
                            disabled={!order.customers?.email || emailSending[order.id]}
                            title={order.customers?.email ? 'Send email' : 'No email address'}>
                            {emailSending[order.id] ? <Loader size={14} className="spin" /> : <Mail size={14} />} Email
                          </button>
                          <button className="btn btn-sm btn-secondary" onClick={() => quickSendReady(order)}
                            disabled={!order.customers?.phone || emailSending[`sms_${order.id}`]}
                            title={order.customers?.phone ? 'Send SMS' : 'No phone number'}>
                            {emailSending[`sms_${order.id}`] ? <Loader size={14} className="spin" /> : <Send size={14} />} SMS
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  )
}
