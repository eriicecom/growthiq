import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Zap, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function Signup() {
  const navigate = useNavigate()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError('Las contraseñas no coinciden'); return }
    if (password.length < 6)  { setError('La contraseña debe tener al menos 6 caracteres'); return }
    setLoading(true)
    try {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) throw error
      navigate('/dashboard', { replace: true })
    } catch (err) {
      const msg = err.message.toLowerCase()
      setError(
        msg.includes('already registered') || msg.includes('already exists')
          ? 'Este email ya está registrado. Prueba a iniciar sesión.'
          : err.message
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        <div className="flex items-center gap-2.5 justify-center mb-8">
          <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center">
            <Zap size={18} className="text-white" />
          </div>
          <span className="font-semibold text-white text-xl tracking-tight">GrowthIQ</span>
        </div>

        <div className="card p-4 sm:p-8 space-y-6">
          <div>
            <h1 className="text-lg font-semibold text-white">Crear cuenta</h1>
            <p className="text-sm text-white/40 mt-1">Empieza a analizar tu negocio</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                autoFocus
                className="w-full bg-surface-700 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-white/60 mb-1.5">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                required
                className="w-full bg-surface-700 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-white/60 mb-1.5">Confirmar contraseña</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repite la contraseña"
                required
                className="w-full bg-surface-700 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20 transition-colors"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? <><Loader2 size={15} className="animate-spin" /> Creando cuenta...</>
                : 'Crear cuenta'}
            </button>
          </form>

          <p className="text-center text-xs text-white/40">
            ¿Ya tienes cuenta?{' '}
            <Link to="/login" className="text-brand-400 hover:text-brand-300 transition-colors font-medium">
              Iniciar sesión
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
