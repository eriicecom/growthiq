import { useState, useCallback } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const closeMobile = useCallback(() => setMobileOpen(false), [])

  return (
    <div className="flex h-screen overflow-hidden bg-surface-900">
      {/* Mobile backdrop — tap to close sidebar */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}

      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onMobileClose={closeMobile}
      />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
          onMobileMenuOpen={() => setMobileOpen(true)}
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
