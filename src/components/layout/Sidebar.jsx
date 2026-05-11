import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  TrendingUp,
  Package,
  Facebook,
  Music2,
  Users,
  ShoppingCart,
  Settings,
  Zap,
  ChevronRight,
} from 'lucide-react'
import clsx from 'clsx'

const navGroups = [
  {
    label: 'Principal',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/sales', icon: TrendingUp, label: 'Ventas' },
      { to: '/orders', icon: ShoppingCart, label: 'Pedidos' },
      { to: '/products', icon: Package, label: 'Productos' },
      { to: '/customers', icon: Users, label: 'Clientes' },
    ],
  },
  {
    label: 'Publicidad',
    items: [
      { to: '/meta-ads', icon: Facebook, label: 'Meta Ads' },
      { to: '/tiktok-ads', icon: Music2, label: 'TikTok Ads' },
    ],
  },
  {
    label: 'Configuración',
    items: [
      { to: '/settings', icon: Settings, label: 'Ajustes' },
    ],
  },
]

export default function Sidebar({ collapsed }) {
  return (
    <aside
      className={clsx(
        'flex flex-col h-full bg-surface-800 border-r border-white/5 transition-all duration-300',
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
              {group.items.map(({ to, icon: Icon, label }) => (
                <li key={to}>
                  <NavLink
                    to={to}
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
                    {!collapsed && <span>{label}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* User badge */}
      {!collapsed && (
        <div className="px-3 py-4 border-t border-white/5">
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors group">
            <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center text-xs font-semibold text-white shrink-0">
              E
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">Eric López</p>
              <p className="text-[10px] text-white/40 truncate">Admin</p>
            </div>
            <ChevronRight size={12} className="text-white/30 group-hover:text-white/50 transition-colors" />
          </div>
        </div>
      )}
    </aside>
  )
}
