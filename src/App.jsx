import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from '@/components/layout/Layout'
import Dashboard from '@/pages/Dashboard'
import Sales from '@/pages/Sales'
import Products from '@/pages/Products'
import MetaAds from '@/pages/MetaAds'
import TikTokAds from '@/pages/TikTokAds'
import Customers from '@/pages/Customers'
import Orders from '@/pages/Orders'
import Settings from '@/pages/Settings'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="sales" element={<Sales />} />
          <Route path="products" element={<Products />} />
          <Route path="meta-ads" element={<MetaAds />} />
          <Route path="tiktok-ads" element={<TikTokAds />} />
          <Route path="customers" element={<Customers />} />
          <Route path="orders" element={<Orders />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
