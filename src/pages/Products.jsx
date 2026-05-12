import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Plus, X, CheckCircle2, Loader2, Package, AlertCircle, Settings } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

// ── Skeleton ──────────────────────────────────────────────────────────────────
function ProductSkeleton() {
  return (
    <div className="card p-5 space-y-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-lg bg-white/5 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-48 bg-white/5 rounded" />
          <div className="h-3 w-24 bg-white/5 rounded" />
        </div>
        <div className="h-3 w-20 bg-white/5 rounded" />
      </div>
      <div className="h-px bg-white/5" />
      <div className="space-y-2.5">
        <div className="h-3 w-32 bg-white/5 rounded" />
        <div className="h-8 bg-white/5 rounded-lg" />
        <div className="h-8 bg-white/5 rounded-lg" />
      </div>
    </div>
  )
}

// ── Cost row ──────────────────────────────────────────────────────────────────
function CostRow({ qty, cost, removable, onCostChange, onRemove }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-white/40 w-24 shrink-0">
        {qty} {qty === 1 ? 'unidad' : 'unidades'}
      </span>
      <div className="relative flex-1 max-w-[180px]">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-white/30 pointer-events-none">$</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={cost}
          onChange={(e) => onCostChange(e.target.value)}
          placeholder="0.00"
          className="w-full bg-surface-700 border border-white/8 rounded-lg pl-7 pr-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-brand-500/40 focus:ring-1 focus:ring-brand-500/15 transition-colors"
        />
      </div>
      {removable ? (
        <button
          type="button"
          onClick={onRemove}
          className="p-2.5 text-white/20 hover:text-red-400 transition-colors rounded"
          title="Eliminar tramo"
        >
          <X size={14} />
        </button>
      ) : (
        <div className="w-9" />
      )}
    </div>
  )
}

// ── Product card ──────────────────────────────────────────────────────────────
function ProductCard({ product, tiers, onTiersChange, onSave, saving, saved, saveError }) {
  const minPrice = product.variants.length
    ? Math.min(...product.variants.map((v) => v.price))
    : 0

  function updateCost(index, value) {
    onTiersChange(tiers.map((t, i) => (i === index ? { ...t, cost: value } : t)))
  }

  function addTier() {
    const maxQty = Math.max(...tiers.map((t) => t.qty))
    onTiersChange([...tiers, { qty: maxQty + 1, cost: '' }])
  }

  function removeTier(index) {
    onTiersChange(tiers.filter((_, i) => i !== index))
  }

  return (
    <div className="card p-5 space-y-4">
      {/* Product header */}
      <div className="flex items-center gap-3">
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
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{product.title}</p>
          {product.variants.length > 1 && (
            <p className="text-xs text-white/40 mt-0.5">{product.variants.length} variantes</p>
          )}
        </div>
        <p className="text-xs text-white/40 shrink-0">
          Precio:{' '}
          <span className="text-white/70 font-medium">
            ${minPrice.toFixed(2)}
          </span>
        </p>
      </div>

      <div className="border-t border-white/5" />

      {/* Cost tiers */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-white/50">Coste por cantidad</p>

        <div className="space-y-2">
          {tiers.map((tier, i) => (
            <CostRow
              key={i}
              qty={tier.qty}
              cost={tier.cost}
              removable={i > 0}
              onCostChange={(v) => updateCost(i, v)}
              onRemove={() => removeTier(i)}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={addTier}
          className="flex items-center gap-1.5 text-xs text-brand-400/60 hover:text-brand-400 transition-colors mt-1 py-2"
        >
          <Plus size={13} />
          Añadir tramo de cantidad
        </button>
      </div>

      {/* Save button + inline error */}
      <div className="border-t border-white/5 pt-3 space-y-2">
        {saveError && (
          <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5">
            {saveError}
          </p>
        )}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
              saved
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 cursor-default'
                : 'btn-primary disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            {saving ? (
              <><Loader2 size={12} className="animate-spin" /> Guardando...</>
            ) : saved ? (
              <><CheckCircle2 size={12} /> Guardado</>
            ) : (
              'Guardar costes'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Products() {
  const [products, setProducts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [tiers, setTiers]       = useState({}) // { productId: [{ qty, cost }] }
  const [saving, setSaving]     = useState({}) // { productId: bool }
  const [saved, setSaved]       = useState({}) // { productId: bool }
  const [saveError, setSaveError] = useState({}) // { productId: string }

  const loadData = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoading(false); return }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setLoading(false); return }

    const [productsRes, costsRes] = await Promise.all([
      fetch('/.netlify/functions/shopify-fetch-products', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }),
      supabase
        .from('product_costs')
        .select('shopify_product_id, quantity, cost')
        .order('shopify_product_id')
        .order('quantity'),
    ])

    if (!productsRes.ok) {
      const errData = await productsRes.json().catch(() => ({}))
      setError(errData.error || `Error ${productsRes.status}`)
      setLoading(false)
      return
    }

    const { products: shopifyProducts } = await productsRes.json()
    setProducts(shopifyProducts)

    const savedCosts = costsRes.data || []

    // Remove costs for products that no longer exist in Shopify
    const liveIds = new Set(shopifyProducts.map((p) => p.id))
    const staleIds = [...new Set(savedCosts.map((r) => r.shopify_product_id))].filter(
      (id) => !liveIds.has(id)
    )
    if (staleIds.length > 0) {
      await supabase
        .from('product_costs')
        .delete()
        .eq('user_id', session.user.id)
        .in('shopify_product_id', staleIds)
    }

    // Build tiers state from the remaining (non-stale) saved costs
    const tiersState = {}
    for (const prod of shopifyProducts) {
      const rows = savedCosts
        .filter((r) => r.shopify_product_id === prod.id)
        .map((r) => ({ qty: r.quantity, cost: String(r.cost) }))
      const hasQty1 = rows.some((r) => r.qty === 1)
      tiersState[prod.id] = hasQty1 ? rows : [{ qty: 1, cost: '' }, ...rows]
    }
    setTiers(tiersState)
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  async function saveCosts(productId, productTitle) {
    setSaving((p) => ({ ...p, [productId]: true }))
    setSaveError((p) => ({ ...p, [productId]: '' }))

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError || !authData?.user) {
        throw new Error(authError?.message || 'No hay sesión activa')
      }
      const userId = authData.user.id
      console.log('[saveCosts] user_id:', userId, '| product_id:', productId)

      const rows = (tiers[productId] || []).filter(
        (r) => r.cost !== '' && !isNaN(parseFloat(r.cost)) && parseFloat(r.cost) >= 0
      )
      console.log('[saveCosts] rows a guardar:', rows)

      // Delete existing rows for this product
      const { error: deleteError } = await supabase
        .from('product_costs')
        .delete()
        .eq('user_id', userId)
        .eq('shopify_product_id', productId)

      if (deleteError) {
        console.error('[saveCosts] DELETE error:', deleteError)
        throw new Error(deleteError.message)
      }

      // Insert new rows (only if there are any)
      if (rows.length > 0) {
        const insertPayload = rows.map((r) => ({
          user_id:            userId,
          shopify_product_id: productId,
          product_title:      productTitle,
          quantity:           Number(r.qty),
          cost:               parseFloat(r.cost),
        }))
        console.log('[saveCosts] INSERT payload:', insertPayload)

        const { error: insertError } = await supabase
          .from('product_costs')
          .insert(insertPayload)

        if (insertError) {
          console.error('[saveCosts] INSERT error:', insertError)
          throw new Error(insertError.message)
        }
      }

      console.log('[saveCosts] OK')
      setSaved((p) => ({ ...p, [productId]: true }))
      setTimeout(() => setSaved((p) => ({ ...p, [productId]: false })), 2000)
    } catch (err) {
      console.error('[saveCosts] excepción:', err.message)
      setSaveError((p) => ({ ...p, [productId]: err.message }))
    } finally {
      setSaving((p) => ({ ...p, [productId]: false }))
    }
  }

  // ── States ────────────────────────────────────────────────────────────────
  if (!isSupabaseConfigured) {
    return (
      <div className="max-w-2xl mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="card p-10 text-center space-y-3 max-w-sm w-full">
          <AlertCircle size={28} className="mx-auto text-amber-400" />
          <p className="text-sm font-semibold text-white">Supabase no configurado</p>
        </div>
      </div>
    )
  }

  if (!loading && error) {
    const noShopify = error.toLowerCase().includes('shopify') || error.toLowerCase().includes('conectada')
    return (
      <div className="max-w-2xl mx-auto flex items-center justify-center min-h-[60vh]">
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

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="space-y-1.5">
          <div className="h-5 w-48 bg-white/5 rounded animate-pulse" />
          <div className="h-3 w-72 bg-white/5 rounded animate-pulse" />
        </div>
        {[1, 2, 3].map((i) => <ProductSkeleton key={i} />)}
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div className="max-w-2xl mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="card p-10 text-center space-y-3 max-w-sm w-full">
          <Package size={28} className="mx-auto text-white/20" />
          <p className="text-sm font-semibold text-white">No hay productos</p>
          <p className="text-xs text-white/40">Tu tienda Shopify no tiene productos publicados.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h2 className="text-base font-semibold text-white">Gestión de Costes</h2>
        <p className="text-xs text-white/40 mt-0.5">
          Configura el coste real de cada producto para calcular COGS y margen neto precisos en el dashboard.
        </p>
      </div>

      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          tiers={tiers[product.id] || [{ qty: 1, cost: '' }]}
          onTiersChange={(newTiers) =>
            setTiers((p) => ({ ...p, [product.id]: newTiers }))
          }
          onSave={() => saveCosts(product.id, product.title)}
          saving={!!saving[product.id]}
          saved={!!saved[product.id]}
          saveError={saveError[product.id] || ''}
        />
      ))}
    </div>
  )
}
