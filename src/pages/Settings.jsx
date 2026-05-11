import { Settings as SettingsIcon, Store, CreditCard, Bell, Key, Users, Palette } from 'lucide-react'

const sections = [
  { icon: Store,      label: 'Tienda',           desc: 'Nombre, moneda, zona horaria' },
  { icon: Key,        label: 'Integraciones',     desc: 'Shopify, Meta, TikTok, Google' },
  { icon: CreditCard, label: 'Plan y Facturación', desc: 'Suscripción y método de pago' },
  { icon: Bell,       label: 'Notificaciones',    desc: 'Alertas de KPIs y anomalías' },
  { icon: Users,      label: 'Equipo',            desc: 'Invita miembros y gestiona roles' },
  { icon: Palette,    label: 'Apariencia',        desc: 'Tema, idioma y preferencias' },
]

export default function Settings() {
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-white">Ajustes de la cuenta</h2>
        <p className="text-sm text-white/40 mt-1">Configura tu cuenta, integraciones y preferencias</p>
      </div>

      {sections.map(({ icon: Icon, label, desc }) => (
        <button
          key={label}
          className="card w-full flex items-center gap-4 px-5 py-4 hover:border-white/10 hover:bg-surface-700 transition-all text-left group"
        >
          <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center text-white/40 group-hover:text-white/70 transition-colors shrink-0">
            <Icon size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white">{label}</p>
            <p className="text-xs text-white/40 mt-0.5">{desc}</p>
          </div>
          <div className="text-white/20 group-hover:text-white/40 transition-colors">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6 12l4-4-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </button>
      ))}

      <div className="pt-4 border-t border-white/5">
        <button className="text-sm text-red-400/70 hover:text-red-400 transition-colors font-medium">
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
