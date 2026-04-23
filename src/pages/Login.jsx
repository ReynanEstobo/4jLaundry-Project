import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Mail, Lock, AlertCircle, ArrowLeft } from 'lucide-react'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: err } = await signIn(email, password)
    if (err) setError(err.message)
    setLoading(false)
  }

  const handleBack = () => {
    navigate('/')
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <button
          onClick={handleBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'none',
            border: 'none',
            color: '#6b7280',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
            padding: '8px 0',
            marginBottom: 16,
            transition: 'color 0.2s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#374151'}
          onMouseLeave={(e) => e.currentTarget.style.color = '#6b7280'}
        >
          <ArrowLeft size={18} />
          Back to Home
        </button>

        <div className="brand">
          <div className="brand-logo">
            <img src="/assets/Rectangle.png" alt="4J Laundry" style={{ width: 44, height: 44, objectFit: 'contain' }} />
          </div>
          <h2>4J LAUNDRY</h2>
          <p>Sign in to your account</p>
        </div>

        {error && (
          <div className="login-error">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email Address</label>
            <div style={{ position: 'relative' }}>
              <Mail size={17} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
              <input
                className="form-control"
                type="email"
                placeholder="admin@4jlaundry.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ paddingLeft: 40 }}
              />
            </div>
          </div>
          <div className="form-group">
            <label>Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={17} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
              <input
                className="form-control"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ paddingLeft: 40 }}
              />
            </div>
          </div>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              justifyContent: 'center',
              marginTop: 12,
              padding: '11px 18px',
              fontSize: 15,
              fontWeight: 600,
              borderRadius: 10,
            }}
          >
            {loading ? (
              <>
                <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2, borderTopColor: 'white', borderColor: 'rgba(255,255,255,0.3)' }} />
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: '#9ca3af' }}>
          Powered by 4J Laundry &copy; {new Date().getFullYear()}
        </div>
      </div>
    </div>
  )
}
