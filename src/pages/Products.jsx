import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Package, AlertCircle, Settings, Search,
  ChevronRight, ChevronLeft, CheckCircle2,
} from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

const PAGE_SIZE = 50

function Sk({ className }) {
  return <div className={`bg-white/5 rounded animate-pulse ${className}`} />
}

function PageSkeleton() {
  return (
    <div className="max-w-screen-lg mx-auto space-y-5">
      <div className="space-y-1.5">
        <Sk className="h-5 w-40" />
        <Sk className="h-3 w-64" />
      </div>
      <Sk className="h-9 w-full rounded-lg" />
      <div className="card overflow-hidden divide-y divide-white/5">
        {[1,2,3,4,5,6,7,8].map(i => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <Sk className="w-12 h-12 rounded-lg shrink-0" />
            <div className="flex-1 space-y-2">
              <Sk className="h-4 w-48" />
              <Sk className="h-3 w-24" />
            </div>
            <Sk className="h-5 w-20 rounded-full" />
            <Sk className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Products() {
  const navigate = useNavigate()

  const [products,  setProducts]  = useState([])
  const [costs,     setCosts]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [search,    setSearch]    = useState('')
  const [page,      setPage]      = useState(0)

  const loadData = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoading(false); return }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setLoading(false); return }

    const [productsRes, costsRes] = await Promise.all([
      fetch('/.netlify/functions/shopify-fetch-products', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }),
      supabase.from('product_costs').select('shopify_product_id').order('shopify_product_id'),
    ])

    if (!productsRes.ok) {
      const errData = await productsRes.json().catch(() => ({}))
      setError(errData.error || `Error ${productsRes.status}`)
      setLoading(false)
      return
    }

    const { products: shopifyProducts } = await productsRes.json()
    setProducts(shopifyProducts)
    setCosts(costsRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Reset page when search changes
  useEffect(() => { setPage(0) }, [search])

  const configuredIds = useMemo(
    () => new Set((costs || []).map(c => c.shopify_product_id)),
    [costs]
  )

  const filtered = useMemo(() => {
    if (!search.trim()) return products
    const q = search.toLowerCase()
    return products.filter(p => p.title.toLowerCase().includes(q))
  }, [products, search])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageItems  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // ── States ────────────────────────────────────────────────────────────────
  if (!isSupabaseConfigured) {
    return (
      <div className="max-w-screen-lg mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="card p-10 text-center space-y-3 max-w-sm w-full">
          <AlertCircle size={28} className="mx-auto text-amber-400" />
          <p className="text-sm font-semibold text-white">Supabase no configurado</p>
        </div>
      </div>
    )
  }

  if (loading) return <PageSkeleton />

  if (error) {
    const noShopify = error.toLowerCase().includes('shopify') || error.toLowerCase().includes('conectada')
    return (
      <div className="max-w-screen-lg mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="card p-10 text-center space-y-4 max-w-md w-full">
          <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mx-auto">
            <Package size={24} className="text-white/30" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">
              {noShopify ? 'Conecta tu tienda Shopify primero' : 'Error al cargar productos'}
            </p>
            <p className="text-xs text-white/40 mt-1.5 leading-relaxed">{error}</p>
          </div>
          {noShopify && (
            <Link to="/settings" className="inline-flex items-center gap-2 btn-primary text-sm px-4 py-2">
              <Settings size={14} /> Ir a Configuración
            </Link>
          )}
        </div>
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div className="max-w-screen-lg mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="card p-10 text-center space-y-3 max-w-sm w-full">
          <Package size={28} className="mx-auto text-white/20" />
          <p className="text-sm font-semibold text-white">No hay productos</p>
          <p className="text-xs text-white/40">Tu tienda Shopify no tiene productos publicados.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-screen-lg mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-white">Catálogo de Productos</h2>
          <p className="text-xs text-white/40 mt-0.5">
            {products.length} productos · Haz click para configurar costes
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar producto por nombre…"
          className="w-full bg-surface-700 border border-white/5 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/15 transition-colors"
        />
      </div>

      {/* Product list */}
      {filtered.length === 0 ? (
        <div className="card flex items-center justify-center py-16 text-sm text-white/30">
          Sin resultados para "{search}"
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-white/5">
            {pageItems.map(product => {
              const minPrice = product.variants?.length
                ? Math.min(...product.variants.map(v => parseFloat(v.price) || 0))
                : 0
              const variantCount = product.variants?.length ?? 0
              const hasCosts     = configuredIds.has(product.id)

              return (
                <button
                  key={product.id}
                  onClick={() => navigate(`/products/${product.id}`)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-white/3 transition-colors text-left group"
                >
                  {/* Image */}
                  {product.image ? (
                    <img
                      src={product.image}
                      alt={product.title}
                      className="w-12 h-12 rounded-lg object-cover bg-white/5 shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                      <Package size={18} className="text-white/20" />
                    </div>
                  )}

                  {/* Name + variants */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate group-hover:text-brand-300 transition-colors">
                      {product.title}
                    </p>
                    {variantCount > 1 && (
                      <p className="text-xs text-white/35 mt-0.5">{variantCount} variantes</p>
                    )}
                  </div>

                  {/* Cost badge */}
                  {hasCosts ? (
                    <span className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap shrink-0">
                      <CheckCircle2 size={11} />
                      Costes configurados
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-white/5 text-white/30 border border-white/5 whitespace-nowrap shrink-0">
                      Sin coste
                    </span>
                  )}

                  {/* Price */}
                  <p className="text-sm font-semibold text-white/60 shrink-0 w-20 text-right">
                    ${minPrice.toFixed(2)}
                  </p>

                  {/* Arrow */}
                  <ChevronRight size={16} className="text-white/20 group-hover:text-white/40 transition-colors shrink-0" />
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-white/30">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={15} />
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const pg = Math.max(0, Math.min(page - 2, totalPages - 5)) + i
              return (
                <button key={pg} onClick={() => setPage(pg)}
                  className={`w-7 h-7 rounded-lg text-xs transition-colors ${pg === page ? 'bg-brand-500/20 text-brand-400 font-semibold' : 'text-white/40 hover:text-white hover:bg-white/5'}`}>
                  {pg + 1}
                </button>
              )
            })}
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
