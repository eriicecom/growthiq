import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Settings as SettingsIcon, Store, CreditCard, Bell, Key, Users, Palette,
  ChevronRight, ShoppingBag, Facebook, CheckCircle2, Loader2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useStoreSettings } from '@/contexts/StoreSettingsContext'
import { CURRENCIES } from '@/hooks/useCurrency'
import ShopifySettings from './settings/ShopifySettings'
import MetaSettings from './settings/MetaSettings'

const META_BLUE = '#1877F2'

const TIMEZONES = [
  { value: 'Europe/Madrid',                  label: 'Madrid (CET/CEST)'      },
  { value: 'Europe/London',                  label: 'Londres (GMT/BST)'      },
  { value: 'America/New_York',               label: 'Nueva York (ET)'        },
  { value: 'America/Chicago',                label: 'Chicago (CT)'           },
  { value: 'America/Denver',                 label: 'Denver (MT)'            },
  { value: 'America/Los_Angeles',            label: 'Los Ángeles (PT)'       },
  { value: 'America/Mexico_City',            label: 'Ciudad de México (CT)'  },
  { value: 'America/Bogota',                 label: 'Bogotá (COT)'           },
  { value: 'America/Lima',                   label: 'Lima (PET)'             },
  { value: 'America/Santiago',               label: 'Santiago (CLT)'         },
  { value: 'America/Sao_Paulo',              label: 'São Paulo (BRT)'        },
  { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires (ART)'     },
]

const integrations = [
  { id: 'shopify', icon: ShoppingBag, iconColor: null,     label: 'Shopify',   desc: 'Sincroniza pedidos y ventas en tiempo real', badge: null },
  { id: 'meta',    icon: Facebook,    iconColor: META_BLUE, label: 'Meta Ads',  desc: 'Facebook e Instagram Ads',                   badge: null },
  { id: null,      icon: SettingsIcon,iconColor: null,      label: 'TikTok Ads',desc: 'TikTok for Business',                        badge: 'Próximamente' },
  { id: null,      icon: SettingsIcon,iconColor: null,      label: 'Google Ads',desc: 'Google Ads y Analytics',                     badge: 'Próximamente' },
]

// id==='store' is enabled; rest are Próximamente
const mainSections = [
  { id: 'store',  icon: Store,      label: 'Tienda',            desc: 'Nombre, moneda, zona horaria',    enabled: true  },
  { id: null,     icon: CreditCard, label: 'Plan y Facturación', desc: 'Suscripción y método de pago',   enabled: false },
  { id: null,     icon: Bell,       label: 'Notificaciones',     desc: 'Alertas de KPIs y anomalías',    enabled: false },
  { id: null,     icon: Users,      label: 'Equipo',             desc: 'Invita miembros y gestiona roles',enabled: false },
  { id: null,     icon: Palette,    label: 'Apariencia',         desc: 'Tema, idioma y preferencias',    enabled: false },
]

function Breadcrumb({ crumbs, onNavigate }) {
  return (
    <nav className="flex items-center gap-1.5 text-xs text-white/40 mb-6">
      {crumbs.map((crumb, i) => (
        <span key={crumb.label} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight size={12} />}
          {i < crumbs.length - 1 ? (
            <button onClick={() => onNavigate(crumb.view)} className="hover:text-white/70 transition-colors">
              {crumb.label}
            </button>
          ) : (
            <span className="text-white/70 font-medium">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

function FieldLabel({ children }) {
  return <p className="text-xs font-medium text-white/50 mb-1.5">{children}</p>
}

function StoreSettingsView({ onNavigate }) {
  const { refreshSettings }         = useStoreSettings()
  const [storeName, setStoreName]   = useState('')
  const [currency,  setCurrency]    = useState('USD')
  const [timezone,  setTimezone]    = useState('Europe/Madrid')
  const [loading,   setLoading]     = useState(true)
  const [saving,    setSaving]      = useState(false)
  const [saved,     setSaved]       = useState(false)
  const [saveError, setSaveError]   = useState('')

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setLoading(false); return }
      const { data } = await supabase
        .from('store_settings')
        .select('store_name, currency, timezone')
        .eq('user_id', session.user.id)
        .maybeSingle()
      if (data) {
        setStoreName(data.store_name || '')
        setCurrency(data.currency   || 'USD')
        setTimezone(data.timezone   || 'Europe/Madrid')
      }
      setLoading(false)
    }
    load()
  }, [])

  async function handleSave() {
    setSaving(true)
    setSaveError('')
    try {
      const { data: { user }, error: authErr } = await supabase.auth.getUser()
      if (authErr || !user) throw new Error('No hay sesión activa')
      const { error } = await supabase.from('store_settings').upsert({
        user_id:    user.id,
        store_name: storeName.trim(),
        currency,
        timezone,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      if (error) throw new Error(error.message)
      await refreshSettings()
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const selectCls = 'w-full bg-surface-700 border border-white/8 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500/40 transition-colors appearance-none cursor-pointer'

  return (
    <div className="max-w-2xl mx-auto">
      <Breadcrumb
        crumbs={[
          { label: 'Ajustes', view: 'home' },
          { label: 'Tienda',  view: 'store' },
        ]}
        onNavigate={onNavigate}
      />

      <div className="mb-6">
        <h2 className="text-lg font-semibold text-white">Configuración de Tienda</h2>
        <p className="text-sm text-white/40 mt-1">Nombre, moneda por defecto y zona horaria</p>
      </div>

      {loading ? (
        <div className="card p-6 space-y-5 animate-pulse">
          {[1,2,3].map(i => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-28 bg-white/5 rounded" />
              <div className="h-10 w-full bg-white/5 rounded-lg" />
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-6 space-y-5">
          {/* Store name */}
          <div>
            <FieldLabel>Nombre de la tienda</FieldLabel>
            <input
              type="text"
              value={storeName}
              onChange={e => setStoreName(e.target.value)}
              placeholder="Mi Tienda"
              className="w-full bg-surface-700 border border-white/8 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-brand-500/40 focus:ring-1 focus:ring-brand-500/15 transition-colors"
            />
          </div>

          {/* Currency */}
          <div>
            <FieldLabel>Moneda por defecto</FieldLabel>
            <div className="relative">
              <select value={currency} onChange={e => setCurrency(e.target.value)} className={selectCls}>
                {CURRENCIES.map(c => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
              <ChevronRight size={13} className="absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-white/30 pointer-events-none" />
            </div>
          </div>

          {/* Timezone */}
          <div>
            <FieldLabel>Zona horaria</FieldLabel>
            <div className="relative">
              <select value={timezone} onChange={e => setTimezone(e.target.value)} className={selectCls}>
                {TIMEZONES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <ChevronRight size={13} className="absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-white/30 pointer-events-none" />
            </div>
          </div>

          {saveError && (
            <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {saveError}
            </p>
          )}

          <div className="pt-1 flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className={`flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                saved
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 cursor-default'
                  : 'btn-primary disabled:opacity-50 disabled:cursor-not-allowed'
              }`}
            >
              {saving ? (
                <><Loader2 size={13} className="animate-spin" /> Guardando...</>
              ) : saved ? (
                <><CheckCircle2 size={13} /> Guardado</>
              ) : (
                'Guardar cambios'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function deriveView(path) {
  if (path.includes('/integrations/shopify'))   return 'shopify'
  if (path.includes('/integrations/meta'))      return 'meta'
  if (path.includes('/integrations'))           return 'integrations'
  if (path.includes('/store'))                  return 'store'
  return 'home'
}

export default function Settings() {
  const { pathname }    = useLocation()
  const [view, setView] = useState(() => deriveView(pathname))
  const routerNavigate  = useNavigate()

  useEffect(() => { setView(deriveView(pathname)) }, [pathname])

  function navigate(v) { setView(v) }

  async function handleSignOut() {
    await supabase?.auth.signOut()
    routerNavigate('/login', { replace: true })
  }

  if (view === 'store')        return <StoreSettingsView onNavigate={navigate} />

  if (view === 'shopify') {
    return (
      <div className="max-w-2xl mx-auto">
        <Breadcrumb crumbs={[{ label: 'Ajustes', view: 'home' }, { label: 'Integraciones', view: 'integrations' }, { label: 'Shopify', view: 'shopify' }]} onNavigate={navigate} />
        <ShopifySettings />
      </div>
    )
  }

  if (view === 'meta') {
    return (
      <div className="max-w-2xl mx-auto">
        <Breadcrumb crumbs={[{ label: 'Ajustes', view: 'home' }, { label: 'Integraciones', view: 'integrations' }, { label: 'Meta Ads', view: 'meta' }]} onNavigate={navigate} />
        <MetaSettings />
      </div>
    )
  }

  if (view === 'integrations') {
    return (
      <div className="max-w-2xl mx-auto">
        <Breadcrumb crumbs={[{ label: 'Ajustes', view: 'home' }, { label: 'Integraciones', view: 'integrations' }]} onNavigate={navigate} />
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-white">Integraciones</h2>
          <p className="text-sm text-white/40 mt-1">Conecta tus canales de ventas y publicidad</p>
        </div>
        <div className="space-y-3">
          {integrations.map(({ id, icon: Icon, iconColor, label, desc, badge }) => (
            <button key={label} onClick={() => id && navigate(id)} disabled={!id}
              className="card w-full flex items-center gap-4 px-5 py-4 hover:border-white/10 hover:bg-surface-700 transition-all text-left group disabled:opacity-60 disabled:cursor-not-allowed">
              <div
                className={iconColor ? 'w-9 h-9 rounded-lg flex items-center justify-center shrink-0' : 'w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center text-white/40 group-hover:text-white/70 transition-colors shrink-0'}
                style={iconColor ? { background: `${iconColor}20`, color: iconColor } : undefined}
              >
                <Icon size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-white">{label}</p>
                  {badge && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-white/5 text-white/30">{badge}</span>}
                </div>
                <p className="text-xs text-white/40 mt-0.5">{desc}</p>
              </div>
              {id && <ChevronRight size={15} className="text-white/20 group-hover:text-white/40 transition-colors" />}
            </button>
          ))}
        </div>
      </div>
    )
  }

  // Home view
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-white">Ajustes de la cuenta</h2>
        <p className="text-sm text-white/40 mt-1">Configura tu cuenta, integraciones y preferencias</p>
      </div>

      <button onClick={() => navigate('integrations')}
        className="card w-full flex items-center gap-4 px-5 py-4 hover:border-white/10 hover:bg-surface-700 transition-all text-left group">
        <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center text-white/40 group-hover:text-white/70 transition-colors shrink-0">
          <Key size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">Integraciones</p>
          <p className="text-xs text-white/40 mt-0.5">Shopify, Meta, TikTok, Google</p>
        </div>
        <ChevronRight size={15} className="text-white/20 group-hover:text-white/40 transition-colors" />
      </button>

      {mainSections.map(({ id, icon: Icon, label, desc, enabled }) => (
        <button
          key={label}
          onClick={() => enabled && navigate(id)}
          disabled={!enabled}
          className={`card w-full flex items-center gap-4 px-5 py-4 transition-all text-left group
            ${enabled ? 'hover:border-white/10 hover:bg-surface-700 cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}
        >
          <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center text-white/40 group-hover:text-white/70 transition-colors shrink-0">
            <Icon size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white">{label}</p>
            <p className="text-xs text-white/40 mt-0.5">{desc}</p>
          </div>
          {enabled
            ? <ChevronRight size={15} className="text-white/20 group-hover:text-white/40 transition-colors" />
            : <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-white/5 text-white/20">Próximamente</span>
          }
        </button>
      ))}

      <div className="pt-4 border-t border-white/5">
        <button onClick={handleSignOut} className="text-sm text-red-400/70 hover:text-red-400 transition-colors font-medium">
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
