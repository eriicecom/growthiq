import { useState, useEffect } from 'react'
import { CheckCircle2, XCircle, Loader2, RefreshCw, Unplug, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

const META_BLUE = '#1877F2'

const STEPS = [
  {
    n: 1,
    title: 'Abre Meta Business Suite',
    body: 'Ve a business.facebook.com e inicia sesión con tu cuenta de negocio.',
  },
  {
    n: 2,
    title: 'Crea un usuario del sistema',
    body: 'Ajustes del negocio → Usuarios → Usuarios del sistema → Añadir. Dale rol de Administrador.',
  },
  {
    n: 3,
    title: 'Asigna el activo publicitario',
    body: 'Dentro del usuario del sistema, pulsa "Añadir activos", selecciona tu cuenta publicitaria y da permisos de Administrador.',
  },
  {
    n: 4,
    title: 'Genera el token de acceso',
    body: 'Pulsa "Generar nuevo token", selecciona tu app (o usa la app de Meta Business) y marca los permisos: ads_read y ads_management.',
  },
  {
    n: 5,
    title: 'Copia el token y el Ad Account ID',
    body: 'Copia el token generado. El Ad Account ID (formato act_XXXXXXXXX) está en Administrador de anuncios → columna superior izquierda.',
  },
]

function MetaLogo() {
  return (
    <div
      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
      style={{ background: `${META_BLUE}20` }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill={META_BLUE}>
        <path d="M12 2.04c-5.5 0-10 4.49-10 10.02 0 5 3.66 9.15 8.44 9.9v-7H7.9v-2.9h2.54V9.85c0-2.51 1.49-3.89 3.78-3.89 1.09 0 2.23.19 2.23.19v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.9h-2.33v7a10 10 0 0 0 8.44-9.9c0-5.53-4.5-10.02-10-10.02z" />
      </svg>
    </div>
  )
}

function StatusBadge({ active }) {
  return active ? (
    <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full">
      <CheckCircle2 size={13} /> Conectada
    </span>
  ) : (
    <span className="flex items-center gap-1.5 text-xs font-medium text-red-400 bg-red-500/10 px-2.5 py-1 rounded-full">
      <XCircle size={13} /> Desconectada
    </span>
  )
}

export default function MetaSettings() {
  const [connection, setConnection]     = useState(null)
  const [loadingConn, setLoadingConn]   = useState(true)
  const [accessToken, setAccessToken]   = useState('')
  const [adAccountId, setAdAccountId]   = useState('')
  const [showToken, setShowToken]       = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const [step, setStep]   = useState('idle') // idle | connecting | syncing | done | error
  const [error, setError] = useState('')
  const [syncCount, setSyncCount] = useState(0)

  useEffect(() => { loadConnection() }, [])

  async function loadConnection() {
    if (!isSupabaseConfigured) { setLoadingConn(false); return }
    const { data } = await supabase
      .from('meta_connections')
      .select('ad_account_id, account_name, currency, is_active, last_synced_at')
      .eq('is_active', true)
      .maybeSingle()
    setConnection(data || null)
    setLoadingConn(false)
  }

  async function handleConnect(e) {
    e.preventDefault()
    setError('')
    setStep('connecting')

    const { data: { session } } = await supabase.auth.getSession()
    const authHeader = session ? { Authorization: `Bearer ${session.access_token}` } : {}

    // Step 1: validate + save
    const connectRes = await fetch('/.netlify/functions/meta-connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({ access_token: accessToken, ad_account_id: adAccountId }),
    })
    const connectData = await connectRes.json().catch(() => ({}))

    if (!connectRes.ok) {
      setError(connectData.error || 'Error al conectar con Meta Ads')
      setStep('error')
      return
    }

    // Step 2: auto-sync last 30 days
    setStep('syncing')
    const syncRes = await fetch('/.netlify/functions/meta-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
    })
    const syncData = await syncRes.json().catch(() => ({}))

    if (!syncRes.ok) {
      // Connection saved but sync failed — show partial success
      setSyncCount(0)
    } else {
      setSyncCount(syncData.synced || 0)
    }

    setStep('done')
    await loadConnection()
  }

  async function handleSync() {
    setError('')
    setStep('syncing')

    const { data: { session } } = await supabase.auth.getSession()
    const authHeader = session ? { Authorization: `Bearer ${session.access_token}` } : {}

    const res = await fetch('/.netlify/functions/meta-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
    })
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      setError(data.error || 'Error durante la sincronización')
      setStep('error')
      return
    }

    setSyncCount(data.synced || 0)
    setStep('done')
    await loadConnection()
  }

  async function handleDisconnect() {
    await supabase
      .from('meta_connections')
      .update({ is_active: false })
      .eq('is_active', true)
    setConnection(null)
    setStep('idle')
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="card p-6 text-center space-y-3">
        <XCircle size={32} className="mx-auto text-amber-400" />
        <p className="text-sm font-medium text-white">Supabase no configurado</p>
      </div>
    )
  }

  if (loadingConn) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={22} className="animate-spin text-brand-400" />
      </div>
    )
  }

  const connected = !!connection
  const isSyncing = step === 'syncing'
  const isConnecting = step === 'connecting'

  return (
    <div className="space-y-5 max-w-xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MetaLogo />
          <div>
            <h3 className="text-sm font-semibold text-white">Meta Ads</h3>
            <p className="text-xs text-white/40 mt-0.5">Facebook e Instagram Ads</p>
          </div>
        </div>
        {connection && <StatusBadge active={connected} />}
      </div>

      {/* Connected state */}
      {connected && step === 'idle' && (
        <div className="card p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-white/40 mb-0.5">Cuenta conectada</p>
              <p className="text-sm font-medium text-white">{connection.account_name || connection.ad_account_id}</p>
              <p className="text-xs text-white/30 mt-0.5 font-mono">{connection.ad_account_id}</p>
            </div>
            <CheckCircle2 size={20} className="text-emerald-400 shrink-0 mt-0.5" />
          </div>

          {connection.last_synced_at && (
            <p className="text-xs text-white/30">
              Última sincronización:{' '}
              {new Date(connection.last_synced_at).toLocaleString('es-ES', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSync}
              className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5"
            >
              <RefreshCw size={13} /> Sincronizar ahora
            </button>
            <button
              onClick={handleDisconnect}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-red-400 hover:border-red-500/30 transition-colors"
            >
              <Unplug size={13} /> Desconectar
            </button>
          </div>
        </div>
      )}

      {/* Syncing */}
      {isSyncing && (
        <div className="card p-5 flex items-center gap-3">
          <Loader2 size={16} className="animate-spin text-brand-400 shrink-0" />
          <p className="text-sm font-medium text-white">Sincronizando datos de Meta Ads...</p>
        </div>
      )}

      {/* Done */}
      {step === 'done' && (
        <div className="card p-4 border-emerald-500/20 bg-emerald-500/5 flex items-center gap-3">
          <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
          <p className="text-sm text-emerald-300">
            {syncCount > 0
              ? `${syncCount} días de gasto sincronizados. El dashboard ya incluye el gasto de Meta.`
              : 'Cuenta conectada. No se encontraron datos de gasto en los últimos 30 días.'}
          </p>
        </div>
      )}

      {/* Error */}
      {step === 'error' && error && (
        <div className="card p-4 border-red-500/20 bg-red-500/5 flex items-center gap-3">
          <XCircle size={18} className="text-red-400 shrink-0" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* Connect form */}
      {!connected && !isSyncing && (
        <form onSubmit={handleConnect} className="card p-5 space-y-4">
          <p className="text-xs text-white/50">
            Introduce tu token de acceso del sistema y el ID de tu cuenta publicitaria de Meta.
          </p>

          <div className="space-y-3">
            {/* Access Token */}
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1.5">
                Access Token
              </label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="EAAxxxxxxxxxxxxx..."
                  required
                  className="w-full bg-surface-700 border border-white/10 rounded-lg px-3 py-2 pr-9 text-sm text-white placeholder-white/20 font-mono focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                >
                  {showToken ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Ad Account ID */}
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1.5">
                Ad Account ID
              </label>
              <input
                type="text"
                value={adAccountId}
                onChange={(e) => setAdAccountId(e.target.value)}
                placeholder="act_123456789"
                required
                className="w-full bg-surface-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 font-mono focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20 transition-colors"
              />
              <p className="text-[11px] text-white/30 mt-1.5">
                Formato: act_XXXXXXXXX · Encuéntralo en Administrador de anuncios, esquina superior izquierda.
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={isConnecting || isSyncing}
            className="btn-primary w-full flex items-center justify-center gap-2 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isConnecting ? (
              <><Loader2 size={15} className="animate-spin" /> Validando credenciales...</>
            ) : (
              'Conectar Meta Ads'
            )}
          </button>
        </form>
      )}

      {/* Instructions */}
      <div className="card overflow-hidden">
        <button
          onClick={() => setShowInstructions((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/2 transition-colors"
        >
          <span className="text-sm font-medium text-white">¿Cómo obtener mi Access Token?</span>
          {showInstructions ? <ChevronUp size={15} className="text-white/30" /> : <ChevronDown size={15} className="text-white/30" />}
        </button>

        {showInstructions && (
          <div className="px-5 pb-5 space-y-4 border-t border-white/5">
            {STEPS.map(({ n, title, body }) => (
              <div key={n} className="flex gap-3">
                <div className="w-6 h-6 rounded-full text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: `${META_BLUE}20`, color: META_BLUE }}>
                  {n}
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{title}</p>
                  <p className="text-xs text-white/40 mt-0.5 leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
            <div className="pt-2 border-t border-white/5">
              <p className="text-xs text-white/40">
                El token de sistema tiene larga duración (60 días o indefinido) y es más estable que un token de usuario.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
