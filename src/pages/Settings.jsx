import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Settings as SettingsIcon, Store, CreditCard, Bell, Key, Users, Palette, ChevronRight, ShoppingBag, Facebook } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import ShopifySettings from './settings/ShopifySettings'
import MetaSettings from './settings/MetaSettings'

const META_BLUE = '#1877F2'

const integrations = [
  {
    id: 'shopify',
    icon: ShoppingBag,
    iconColor: null,
    label: 'Shopify',
    desc: 'Sincroniza pedidos y ventas en tiempo real',
    badge: null,
  },
  {
    id: 'meta',
    icon: Facebook,
    iconColor: META_BLUE,
    label: 'Meta Ads',
    desc: 'Facebook e Instagram Ads',
    badge: null,
  },
  {
    id: null,
    icon: SettingsIcon,
    iconColor: null,
    label: 'TikTok Ads',
    desc: 'TikTok for Business',
    badge: 'Próximamente',
  },
  {
    id: null,
    icon: SettingsIcon,
    iconColor: null,
    label: 'Google Ads',
    desc: 'Google Ads y Analytics',
    badge: 'Próximamente',
  },
]

const mainSections = [
  { icon: Store,      label: 'Tienda',           desc: 'Nombre, moneda, zona horaria' },
  { icon: CreditCard, label: 'Plan y Facturación', desc: 'Suscripción y método de pago' },
  { icon: Bell,       label: 'Notificaciones',    desc: 'Alertas de KPIs y anomalías' },
  { icon: Users,      label: 'Equipo',            desc: 'Invita miembros y gestiona roles' },
  { icon: Palette,    label: 'Apariencia',        desc: 'Tema, idioma y preferencias' },
]

function Breadcrumb({ crumbs, onNavigate }) {
  return (
    <nav className="flex items-center gap-1.5 text-xs text-white/40 mb-6">
      {crumbs.map((crumb, i) => (
        <span key={crumb.label} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight size={12} />}
          {i < crumbs.length - 1 ? (
            <button
              onClick={() => onNavigate(crumb.view)}
              className="hover:text-white/70 transition-colors"
            >
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

function deriveView(path) {
  if (path.includes('/integrations/shopify'))   return 'shopify'
  if (path.includes('/integrations/meta'))      return 'meta'
  if (path.includes('/integrations'))           return 'integrations'
  return 'home'
}

export default function Settings() {
  const { pathname } = useLocation()
  const [view, setView] = useState(() => deriveView(pathname))
  const routerNavigate = useNavigate()

  useEffect(() => {
    setView(deriveView(pathname))
  }, [pathname])

  function navigate(v) { setView(v) }

  async function handleSignOut() {
    await supabase?.auth.signOut()
    routerNavigate('/login', { replace: true })
  }

  if (view === 'shopify') {
    return (
      <div className="max-w-2xl mx-auto">
        <Breadcrumb
          crumbs={[
            { label: 'Ajustes', view: 'home' },
            { label: 'Integraciones', view: 'integrations' },
            { label: 'Shopify', view: 'shopify' },
          ]}
          onNavigate={navigate}
        />
        <ShopifySettings />
      </div>
    )
  }

  if (view === 'meta') {
    return (
      <div className="max-w-2xl mx-auto">
        <Breadcrumb
          crumbs={[
            { label: 'Ajustes', view: 'home' },
            { label: 'Integraciones', view: 'integrations' },
            { label: 'Meta Ads', view: 'meta' },
          ]}
          onNavigate={navigate}
        />
        <MetaSettings />
      </div>
    )
  }

  if (view === 'integrations') {
    return (
      <div className="max-w-2xl mx-auto">
        <Breadcrumb
          crumbs={[
            { label: 'Ajustes', view: 'home' },
            { label: 'Integraciones', view: 'integrations' },
          ]}
          onNavigate={navigate}
        />

        <div className="mb-6">
          <h2 className="text-lg font-semibold text-white">Integraciones</h2>
          <p className="text-sm text-white/40 mt-1">Conecta tus canales de ventas y publicidad</p>
        </div>

        <div className="space-y-3">
          {integrations.map(({ id, icon: Icon, iconColor, label, desc, badge }) => (
            <button
              key={label}
              onClick={() => id && navigate(id)}
              disabled={!id}
              className="card w-full flex items-center gap-4 px-5 py-4 hover:border-white/10 hover:bg-surface-700 transition-all text-left group disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <div
                className={iconColor
                  ? 'w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors'
                  : 'w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center text-white/40 group-hover:text-white/70 transition-colors shrink-0'}
                style={iconColor ? { background: `${iconColor}20`, color: iconColor } : undefined}
              >
                <Icon size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-white">{label}</p>
                  {badge && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-white/5 text-white/30">
                      {badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/40 mt-0.5">{desc}</p>
              </div>
              {id && (
                <ChevronRight size={15} className="text-white/20 group-hover:text-white/40 transition-colors" />
              )}
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

      <button
        onClick={() => navigate('integrations')}
        className="card w-full flex items-center gap-4 px-5 py-4 hover:border-white/10 hover:bg-surface-700 transition-all text-left group"
      >
        <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center text-white/40 group-hover:text-white/70 transition-colors shrink-0">
          <Key size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">Integraciones</p>
          <p className="text-xs text-white/40 mt-0.5">Shopify, Meta, TikTok, Google</p>
        </div>
        <ChevronRight size={15} className="text-white/20 group-hover:text-white/40 transition-colors" />
      </button>

      {mainSections.map(({ icon: Icon, label, desc }) => (
        <button
          key={label}
          className="card w-full flex items-center gap-4 px-5 py-4 hover:border-white/10 hover:bg-surface-700 transition-all text-left group opacity-60 cursor-not-allowed"
          disabled
        >
          <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center text-white/40 shrink-0">
            <Icon size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white">{label}</p>
            <p className="text-xs text-white/40 mt-0.5">{desc}</p>
          </div>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-white/5 text-white/20">
            Próximamente
          </span>
        </button>
      ))}

      <div className="pt-4 border-t border-white/5">
        <button
          onClick={handleSignOut}
          className="text-sm text-red-400/70 hover:text-red-400 transition-colors font-medium"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
