import { useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  TrendingUp,
  Package,
  Facebook,
  Music2,
  Users,
  ShoppingCart,
  ShoppingBag,
  Globe,
  Settings,
  Zap,
  LogOut,
} from 'lucide-react'
import clsx from 'clsx'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/contexts/AuthContext'

const navGroups = [
  {
    label: 'Principal',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/products',  icon: Package,         label: 'Productos' },
      { to: '/sales',     icon: TrendingUp,      label: 'Ventas' },
      { to: '/orders',    icon: ShoppingCart,    label: 'Pedidos' },
      { to: '/customers', icon: Users,           label: 'Clientes' },
    ],
  },
  {
    label: 'Publicidad',
    items: [
      { to: '/meta-ads',   icon: Facebook, label: 'Meta Ads' },
      { to: '/tiktok-ads', icon: Music2,   label: 'TikTok Ads' },
    ],
  },
  {
    label: 'Integraciones',
    items: [
      { to: '/settings/integrations/shopify', icon: ShoppingBag, label: 'Shopify'   },
      { to: '/settings/integrations', icon: Globe,       label: 'WordPress', badge: 'Próximamente' },
    ],
  },
  {
    label: 'Configuración',
    items: [
      { to: '/settings', icon: Settings, label: 'Ajustes' },
    ],
  },
]

export default function Sidebar({ collapsed, mobileOpen, onMobileClose }) {
  const navigate  = useNavigate()
  const { pathname } = useLocation()
  const session   = useSession()
  const email     = session?.user?.email ?? ''
  const initial   = email.charAt(0).toUpperCase() || '?'

  // Close mobile drawer on route change
  useEffect(() => {
    onMobileClose?.()
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSignOut() {
    await supabase?.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <aside
      className={clsx(
        // Mobile: fixed drawer that slides in/out
        'fixed inset-y-0 left-0 z-40 flex flex-col h-full bg-surface-800 border-r border-white/5 transition-all duration-300',
        // Mobile open/close via translate
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
        // Desktop: static, always visible, no translate
        'lg:static lg:translate-x-0 lg:z-auto',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className={clsx(
        'flex items-center gap-2.5 px-4 h-16 border-b border-white/5 shrink-0',
        collapsed && 'justify-center px-0'
      )}>
        <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center shrink-0">
          <Zap size={16} className="text-white" />
        </div>
        {!collapsed && (
          <span className="font-semibold text-white tracking-tight text-lg">GrowthIQ</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-6">
        {navGroups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/25">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map(({ to, icon: Icon, label, badge }) => (
                <li key={label}>
                  <NavLink
                    to={to}
                    end
                    className={({ isActive }) =>
                      clsx(
                        'nav-item',
                        isActive ? 'nav-item-active' : 'nav-item-inactive',
                        collapsed && 'justify-center px-0'
                      )
                    }
                    title={collapsed ? label : undefined}
                  >
                    <Icon size={18} className="shrink-0" />
                    {!collapsed && (
                      <>
                        <span className="flex-1">{label}</span>
                        {badge && (
                          <span className="text-[9px] font-semibold uppercase tracking-wide bg-white/10 text-white/40 px-1.5 py-0.5 rounded-full">
                            {badge}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer: user info + sign out */}
      <div className={clsx('border-t border-white/5', collapsed ? 'px-2 py-3' : 'px-3 py-4 space-y-1')}>
        {collapsed ? (
          <button
            onClick={handleSignOut}
            title="Cerrar sesión"
            className="nav-item nav-item-inactive w-full justify-center px-0 text-white/40 hover:text-red-400 hover:bg-red-500/5"
          >
            <LogOut size={18} />
          </button>
        ) : (
          <>
            <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg">
              <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center text-xs font-semibold text-white shrink-0">
                {initial}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white truncate">{email}</p>
                <p className="text-[10px] text-white/40">Admin</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="nav-item nav-item-inactive w-full text-left text-white/40 hover:text-red-400 hover:bg-red-500/5"
            >
              <LogOut size={16} className="shrink-0" />
              <span>Cerrar sesión</span>
            </button>
          </>
        )}
      </div>
    </aside>
  )
}
