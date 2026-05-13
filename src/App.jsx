import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { AuthProvider, useSession } from '@/contexts/AuthContext'
import { PeriodProvider } from '@/contexts/PeriodContext'
import Layout from '@/components/layout/Layout'
import Login from '@/pages/Login'
import Signup from '@/pages/Signup'
import Dashboard from '@/pages/Dashboard'
import Sales from '@/pages/Sales'
import Products from '@/pages/Products'
import MetaAds from '@/pages/MetaAds'
import TikTokAds from '@/pages/TikTokAds'
import Customers from '@/pages/Customers'
import Orders from '@/pages/Orders'
import Settings from '@/pages/Settings'

function FullPageLoader() {
  return (
    <div className="flex items-center justify-center h-screen bg-surface-900">
      <Loader2 size={24} className="animate-spin text-brand-400" />
    </div>
  )
}

function ProtectedRoute() {
  const session = useSession()
  if (session === undefined) return <FullPageLoader />
  if (!session) return <Navigate to="/login" replace />
  return <Outlet />
}

function AuthRoute() {
  const session = useSession()
  if (session === undefined) return <FullPageLoader />
  if (session) return <Navigate to="/dashboard" replace />
  return <Outlet />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PeriodProvider>
          <Routes>
            <Route element={<AuthRoute />}>
              <Route path="/login"  element={<Login />} />
              <Route path="/signup" element={<Signup />} />
            </Route>

            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Layout />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard"  element={<Dashboard />} />
                <Route path="sales"      element={<Sales />} />
                <Route path="products"   element={<Products />} />
                <Route path="meta-ads"   element={<MetaAds />} />
                <Route path="tiktok-ads" element={<TikTokAds />} />
                <Route path="customers"  element={<Customers />} />
                <Route path="orders"     element={<Orders />} />
                <Route path="settings"                      element={<Settings />} />
                <Route path="settings/integrations"         element={<Settings />} />
                <Route path="settings/integrations/shopify" element={<Settings />} />
                <Route path="settings/integrations/meta"    element={<Settings />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </PeriodProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
