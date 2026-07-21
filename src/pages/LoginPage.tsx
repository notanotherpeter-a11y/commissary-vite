import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const email = username.includes('@') ? username : `${username}@kamayan.app`
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      setError('Invalid username or password')
      setLoading(false)
    } else {
      navigate('/dashboard')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/kamayan-logo.png" alt="Kamayan Logo" className="w-36 h-36 object-contain mx-auto" />
          <p className="text-slate-400 text-sm mt-1">Commissary Management</p>
        </div>
        <div className="bg-white rounded-xl shadow-xl p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-5">Sign in to your account</h2>
          {error && <p className="text-sm text-red-600 mb-3 bg-red-50 px-3 py-2 rounded">{error}</p>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="e.g. admin, cainta"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-900 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-slate-700 transition-colors disabled:opacity-60"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
        <p className="text-center text-xs text-slate-600 mt-6">© 2026 Kamayan sa Qyusi. All rights reserved.</p>
      </div>
    </div>
  )
}
