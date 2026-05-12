import { useState, useRef, useEffect } from 'react'
import { Bell, Search, PanelLeftClose, PanelLeftOpen, X, ChevronDown, Menu } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { usePeriod, PERIODS } from '@/contexts/PeriodContext'

const pageTitles = {
  '/dashboard':  { title: 'Dashboard',     subtitle: 'Resumen general de tu negocio' },
  '/sales':      { title: 'Ventas',         subtitle: 'Análisis de ingresos y tendencias' },
  '/products':   { title: 'Productos',      subtitle: 'Rendimiento por producto' },
  '/meta-ads':   { title: 'Meta Ads',       subtitle: 'Facebook e Instagram Ads' },
  '/tiktok-ads': { title: 'TikTok Ads',     subtitle: 'Campañas de TikTok' },
  '/customers':  { title: 'Clientes',       subtitle: 'Base de clientes y segmentos' },
  '/orders':     { title: 'Pedidos',        subtitle: 'Gestión de pedidos' },
  '/settings':   { title: 'Ajustes',        subtitle: 'Configuración de la cuenta' },
}

function PeriodSelector() {
  const { days, setDays } = usePeriod()
  return (
    <div className="relative">
      <select
        value={days}
        onChange={(e) => setDays(Number(e.target.value))}
        className="appearance-none bg-surface-700 border border-white/5 rounded-lg pl-3 pr-7 py-1.5 text-xs text-white/60 cursor-pointer hover:border-white/10 focus:outline-none transition-colors"
      >
        {PERIODS.map((p) => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>
      <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
    </div>
  )
}

function NotificationsPanel({ onClose }) {
  return (
    <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-1rem)] z-50 card shadow-2xl border border-white/8 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <p className="text-sm font-semibold text-white">Notificaciones</p>
        <button
          onClick={onClose}
          className="text-white/30 hover:text-white/60 transition-colors p-0.5 rounded"
        >
          <X size={14} />
        </button>
      </div>
      <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-3">
          <Bell size={18} className="text-white/20" />
        </div>
        <p className="text-sm font-medium text-white/50">No hay notificaciones</p>
        <p className="text-xs text-white/25 mt-1.5 leading-relaxed max-w-[200px]">
          Las alertas de KPIs, nuevos pedidos y sincronizaciones aparecerán aquí.
        </p>
      </div>
    </div>
  )
}

export default function Header({ collapsed, onToggle, onMobileMenuOpen }) {
  const { pathname } = useLocation()
  const navigate     = useNavigate()
  const page = pageTitles[pathname] ?? { title: 'GrowthIQ', subtitle: '' }

  const [searchTerm,   setSearchTerm]   = useState('')
  const [searchOpen,   setSearchOpen]   = useState(false)
  const [notifOpen,    setNotifOpen]    = useState(false)
  const notifRef  = useRef(null)
  const searchRef = useRef(null)

  // Close notifications on click outside
  useEffect(() => {
    function handler(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false)
      }
    }
    if (notifOpen) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [notifOpen])

  // Close mobile search on click outside
  useEffect(() => {
    function handler(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchOpen(false)
      }
    }
    if (searchOpen) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [searchOpen])

  function handleSearch(e) {
    e.preventDefault()
    const q = searchTerm.trim()
    if (q) {
      navigate(`/orders?q=${encodeURIComponent(q)}`)
      setSearchTerm('')
      setSearchOpen(false)
    }
  }

  return (
    <header className="h-16 bg-surface-800 border-b border-white/5 flex items-center px-4 lg:px-6 gap-3 shrink-0">

      {/* Mobile hamburger — visible only on mobile */}
      <button
        onClick={onMobileMenuOpen}
        className="text-white/40 hover:text-white transition-colors -ml-1 lg:hidden"
        aria-label="Abrir menú"
      >
        <Menu size={20} />
      </button>

      {/* Desktop sidebar toggle — hidden on mobile */}
      <button
        onClick={onToggle}
        className="hidden lg:block text-white/40 hover:text-white transition-colors -ml-1"
        aria-label="Toggle sidebar"
      >
        {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
      </button>

      {/* Page title */}
      <div className="flex-1 min-w-0">
        <h1 className="text-[15px] font-semibold text-white leading-tight truncate">{page.title}</h1>
        {page.subtitle && (
          <p className="text-[11px] text-white/40 leading-tight truncate hidden sm:block">{page.subtitle}</p>
        )}
      </div>

      {/* Desktop search — hidden below md */}
      <form
        onSubmit={handleSearch}
        className="hidden md:flex items-center gap-2 bg-surface-700 border border-white/5 rounded-lg px-3 py-2 w-56 hover:border-white/10 focus-within:border-white/15 transition-colors"
      >
        <Search size={14} className="text-white/30 shrink-0" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar pedido, cliente..."
          className="flex-1 bg-transparent text-xs text-white placeholder-white/30 outline-none"
        />
        {searchTerm
          ? (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="text-white/30 hover:text-white/60 transition-colors"
            >
              <X size={12} />
            </button>
          )
          : <span className="text-[10px] text-white/20 bg-white/5 px-1.5 py-0.5 rounded shrink-0">⌘K</span>
        }
      </form>

      {/* Mobile search icon — visible below md */}
      <div ref={searchRef} className="relative md:hidden">
        <button
          onClick={() => setSearchOpen((v) => !v)}
          className="text-white/40 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/5"
          aria-label="Buscar"
        >
          <Search size={16} />
        </button>
        {searchOpen && (
          <form
            onSubmit={handleSearch}
            className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] max-w-xs z-50 flex items-center gap-2 bg-surface-700 border border-white/10 rounded-lg px-3 py-2 shadow-2xl"
          >
            <Search size={14} className="text-white/30 shrink-0" />
            <input
              autoFocus
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar pedido, cliente..."
              className="flex-1 bg-transparent text-xs text-white placeholder-white/30 outline-none"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="text-white/30 hover:text-white/60 transition-colors"
              >
                <X size={12} />
              </button>
            )}
          </form>
        )}
      </div>

      {/* Notifications */}
      <div ref={notifRef} className="relative">
        <button
          onClick={() => setNotifOpen((v) => !v)}
          className={`relative text-white/40 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/5 ${notifOpen ? 'text-white bg-white/5' : ''}`}
          aria-label="Notificaciones"
        >
          <Bell size={16} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-brand-500 rounded-full" />
        </button>
        {notifOpen && <NotificationsPanel onClose={() => setNotifOpen(false)} />}
      </div>

      {/* Period selector — always visible */}
      <PeriodSelector />
    </header>
  )
}
