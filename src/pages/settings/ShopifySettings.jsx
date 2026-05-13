import { useState, useEffect, useRef } from 'react'
import { CheckCircle2, XCircle, Loader2, ChevronDown, ChevronUp, RefreshCw, Unplug, ExternalLink } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

const STEPS = [
  { n: 1, title: 'Accede a tu panel de Shopify', body: 'Ve a tu Admin de Shopify → Configuración (icono de engranaje en la barra lateral).' },
  { n: 2, title: 'Abre Aplicaciones y canales de ventas', body: 'En el menú izquierdo del Admin haz clic en "Aplicaciones" y luego en "Desarrollar aplicaciones".' },
  { n: 3, title: 'Crea una aplicación personalizada', body: 'Pulsa "Crear una aplicación", dale un nombre (p. ej. "GrowthIQ") y haz clic en "Crear aplicación".' },
  { n: 4, title: 'Configura los permisos de la API de administración', body: 'En la pestaña "Configuración de la API", activa estos scopes: read_orders, read_products, read_customers. Guarda los cambios.' },
  { n: 5, title: 'Instala la aplicación y copia el token', body: 'Ve a la pestaña "Credenciales de la API", pulsa "Instalar aplicación" y luego copia el "Token de acceso de la API de Admin". Este token solo se muestra una vez.' },
]

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

function ProgressBar({ value, label }) {
  return (
    <div className="space-y-1.5">
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full bg-brand-500 rounded-full transition-all duration-300"
          style={{ width: `${value}%` }}
        />
      </div>
      <p className="text-xs text-white/40">{label}</p>
    </div>
  )
}

export default function ShopifySettings() {
  const [connection, setConnection] = useState(null)
  const [loadingConn, setLoadingConn] = useState(true)

  const [shopDomain, setShopDomain] = useState('')
  const [accessToken, setAccessToken] = useState('')

  const [step, setStep] = useState('idle') // idle | validating | saving | syncing | done | error
  const [error, setError] = useState('')
  const [syncProgress, setSyncProgress] = useState(0)
  const [syncCount, setSyncCount] = useState(0)
  const [syncTotal, setSyncTotal] = useState(0)
  const [webhooksActive, setWebhooksActive] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)

  const pollRef = useRef(null)

  useEffect(() => {
    loadConnection()
    return () => clearInterval(pollRef.current)
  }, [])

  async function loadConnection() {
    if (!isSupabaseConfigured) { setLoadingConn(false); return }
    const { data } = await supabase
      .from('shopify_connections')
      .select('shop_domain, is_active, last_synced_at, sync_total')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    setConnection(data || null)
    setLoadingConn(false)
  }

  function startProgressPoll(total) {
    clearInterval(pollRef.current)
    if (!total) return
    pollRef.current = setInterval(async () => {
      const { count } = await supabase
        .from('shopify_orders')
        .select('*', { count: 'exact', head: true })
      if (count !== null) {
        setSyncCount(count)
        setSyncProgress(Math.min(99, Math.round((count / total) * 100)))
      }
    }, 1200)
  }

  async function handleConnect(e) {
    e.preventDefault()
    setError('')

    const domain = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase()

    // Get JWT once for all function calls in this flow
    const { data: { session } } = await supabase.auth.getSession()
    const authHeader = session ? { 'Authorization': `Bearer ${session.access_token}` } : {}

    // Step 1: Validate credentials
    setStep('validating')
    const validateRes = await fetch('/.netlify/functions/shopify-validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({ shopDomain: domain, accessToken }),
    })
    const validateData = await validateRes.json()

    if (!validateRes.ok) {
      setError(validateData.error || 'Error al validar las credenciales')
      setStep('error')
      return
    }

    // Step 2: Save credentials to Supabase (include user_id for multi-tenant RLS)
    setStep('saving')
    const { data: { user } } = await supabase.auth.getUser()
    const { data: upsertData, error: dbErr } = await supabase.from('shopify_connections').upsert(
      { shop_domain: domain, access_token: accessToken, is_active: false, user_id: user?.id, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
    console.log('[shopify-connect] upsert result:', { data: upsertData, error: dbErr, userId: user?.id, domain })
    if (dbErr) {
      console.error('[shopify-connect] upsert error details:', JSON.stringify(dbErr, null, 2))
      setError(`Error al guardar la configuración: ${dbErr.message || dbErr.code || 'error desconocido'}`)
      setStep('error')
      return
    }

    // Step 3: Sync all orders (function reads token from Supabase)
    setStep('syncing')
    setSyncProgress(0)
    setSyncTotal(0)
    setSyncCount(0)

    startProgressPoll(9999)

    const syncRes = await fetch('/.netlify/functions/shopify-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({ shopDomain: domain }),
    })

    clearInterval(pollRef.current)

    if (!syncRes.ok) {
      let syncErrMsg = 'Error durante la sincronización'
      try {
        const syncData = await syncRes.json()
        if (syncData?.error) syncErrMsg = syncData.error
      } catch { /* respuesta no-JSON — usar mensaje genérico */ }
      setError(syncErrMsg)
      setStep('error')
      return
    }

    const { synced } = await syncRes.json()
    setSyncProgress(100)
    setSyncCount(synced)

    // Step 4: Register webhooks for real-time order updates (best-effort)
    setWebhooksActive(false)
    try {
      const whRes = await fetch('/.netlify/functions/shopify-register-webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
      })
      const whData = await whRes.json().catch(() => ({}))
      setWebhooksActive(whRes.ok && whData.ok !== false)
    } catch { /* webhook registration is non-critical */ }

    setStep('done')
    await loadConnection()
  }

  async function handleDisconnect() {
    if (!connection) return
    await supabase.from('shopify_connections').update({ is_active: false }).eq('shop_domain', connection.shop_domain)
    await loadConnection()
  }

  async function handleResync() {
    if (!connection) return
    setError('')
    setStep('syncing')
    setSyncProgress(0)
    setSyncCount(0)
    startProgressPoll(connection.sync_total || 9999)

    const { data: { session } } = await supabase.auth.getSession()
    const authHeader = session ? { 'Authorization': `Bearer ${session.access_token}` } : {}

    const syncRes = await fetch('/.netlify/functions/shopify-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({ shopDomain: connection.shop_domain }),
    })

    clearInterval(pollRef.current)

    if (!syncRes.ok) {
      let syncErrMsg = 'Error durante la sincronización'
      try {
        const syncData = await syncRes.json()
        if (syncData?.error) syncErrMsg = syncData.error
      } catch { /* respuesta no-JSON (timeout de Netlify) */ }
      setError(syncErrMsg)
      setStep('error')
      return
    }

    const { synced = 0 } = await syncRes.json()
    setSyncProgress(100)
    setSyncCount(synced)
    setStep('done')
    await loadConnection()
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="card p-6 text-center space-y-3">
        <XCircle size={32} className="mx-auto text-amber-400" />
        <p className="text-sm font-medium text-white">Supabase no configurado</p>
        <p className="text-xs text-white/40 max-w-sm mx-auto">
          Añade <code className="bg-white/5 px-1 rounded">VITE_SUPABASE_URL</code> y{' '}
          <code className="bg-white/5 px-1 rounded">VITE_SUPABASE_ANON_KEY</code> a tu archivo{' '}
          <code className="bg-white/5 px-1 rounded">.env</code> para habilitar la integración con Shopify.
        </p>
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

  const isSyncing = step === 'syncing'
  const connected = connection?.is_active

  return (
    <div className="space-y-5 max-w-xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Shopify</h3>
          <p className="text-xs text-white/40 mt-0.5">Sincroniza pedidos y recibe actualizaciones en tiempo real</p>
        </div>
        {connection && <StatusBadge active={connected} />}
      </div>

      {/* Connected state */}
      {connected && step === 'idle' && (
        <div className="card p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-white/40 mb-0.5">Tienda conectada</p>
              <p className="text-sm font-medium text-white">{connection.shop_domain}</p>
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
              onClick={handleResync}
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

      {/* Sync progress */}
      {isSyncing && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Loader2 size={16} className="animate-spin text-brand-400 shrink-0" />
            <p className="text-sm font-medium text-white">Sincronizando pedidos...</p>
          </div>
          <ProgressBar
            value={syncProgress}
            label={
              syncTotal
                ? `${syncCount.toLocaleString('es-ES')} de ${syncTotal.toLocaleString('es-ES')} pedidos`
                : `${syncCount.toLocaleString('es-ES')} pedidos importados`
            }
          />
          <p className="text-xs text-white/30">Esto puede tardar unos segundos dependiendo del volumen de pedidos.</p>
        </div>
      )}

      {/* Done feedback */}
      {step === 'done' && (
        <div className="card p-4 space-y-2 border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
            <p className="text-sm text-emerald-300">
              {syncCount.toLocaleString('es-ES')} pedidos sincronizados. El dashboard ya muestra datos reales.
            </p>
          </div>
          {webhooksActive && (
            <div className="flex items-center gap-3">
              <CheckCircle2 size={18} className="text-brand-400 shrink-0" />
              <p className="text-sm text-brand-300">Sincronización automática activada.</p>
            </div>
          )}
        </div>
      )}

      {/* Error feedback */}
      {step === 'error' && error && (
        <div className="card p-4 flex items-center gap-3 border-red-500/20 bg-red-500/5">
          <XCircle size={18} className="text-red-400 shrink-0" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* Connection form — show when not connected or after error */}
      {!connected && !isSyncing && (
        <form onSubmit={handleConnect} className="card p-5 space-y-4">
          <p className="text-xs text-white/50">
            Introduce las credenciales de tu tienda Shopify para comenzar la sincronización.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1.5">
                Dominio de la tienda
              </label>
              <input
                type="text"
                value={shopDomain}
                onChange={(e) => setShopDomain(e.target.value)}
                placeholder="mitienda.myshopify.com"
                required
                className="w-full bg-surface-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-white/60 mb-1.5">
                API Access Token
              </label>
              <input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="shpat_xxxxxxxxxxxxxxxxxxxx"
                required
                className="w-full bg-surface-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20 transition-colors font-mono"
              />
              <p className="text-[11px] text-white/30 mt-1.5">El token se guarda de forma segura en Supabase y nunca se muestra de nuevo.</p>
            </div>
          </div>

          <button
            type="submit"
            disabled={step === 'validating' || step === 'saving'}
            className="btn-primary w-full flex items-center justify-center gap-2 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {(step === 'validating' || step === 'saving') ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                {step === 'validating' ? 'Validando credenciales...' : 'Guardando configuración...'}
              </>
            ) : (
              'Conectar tienda'
            )}
          </button>
        </form>
      )}

      {/* Step-by-step instructions */}
      <div className="card overflow-hidden">
        <button
          onClick={() => setShowInstructions((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/2 transition-colors"
        >
          <div className="flex items-center gap-2">
            <ExternalLink size={14} className="text-brand-400" />
            <span className="text-sm font-medium text-white">¿Cómo obtener el Access Token?</span>
          </div>
          {showInstructions ? (
            <ChevronUp size={15} className="text-white/30" />
          ) : (
            <ChevronDown size={15} className="text-white/30" />
          )}
        </button>

        {showInstructions && (
          <div className="px-5 pb-5 space-y-4 border-t border-white/5">
            {STEPS.map(({ n, title, body }) => (
              <div key={n} className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-brand-500/15 text-brand-400 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">
                  {n}
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{title}</p>
                  <p className="text-xs text-white/40 mt-0.5 leading-relaxed">{body}</p>
                </div>
              </div>
            ))}

            <div className="pt-2 border-t border-white/5">
              <a
                href="https://help.shopify.com/es/manual/apps/app-types/custom-apps"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors"
              >
                Documentación oficial de Shopify <ExternalLink size={11} />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
