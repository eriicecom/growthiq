import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Plus, X, CheckCircle2, Loader2, Package, AlertCircle, ArrowLeft, Settings } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

function Sk({ className }) {
  return <div className={`bg-white/5 rounded animate-pulse ${className}`} />
}

function PageSkeleton() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Sk className="h-4 w-32" />
      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-4">
          <Sk className="w-16 h-16 rounded-xl shrink-0" />
          <div className="space-y-2">
            <Sk className="h-5 w-56" />
            <Sk className="h-3 w-32" />
          </div>
        </div>
        <Sk className="h-px w-full" />
        <div className="space-y-3">
          <Sk className="h-3 w-28" />
          <Sk className="h-9 w-64 rounded-lg" />
          <Sk className="h-9 w-64 rounded-lg" />
        </div>
      </div>
    </div>
  )
}

function CostRow({ qty, cost, removable, onCostChange, onRemove }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-white/40 w-24 shrink-0">
        {qty} {qty === 1 ? 'unidad' : 'unidades'}
      </span>
      <div className="relative flex-1 max-w-[200px]">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-white/30 pointer-events-none">$</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={cost}
          onChange={e => onCostChange(e.target.value)}
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

export default function ProductDetail() {
  const { id }     = useParams()
  const navigate   = useNavigate()

  const [product,   setProduct]   = useState(null)
  const [tiers,     setTiers]     = useState([{ qty: 1, cost: '' }])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [saveError, setSaveError] = useState('')

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
        .select('quantity, cost')
        .eq('shopify_product_id', id)
        .order('quantity'),
    ])

    if (!productsRes.ok) {
      const errData = await productsRes.json().catch(() => ({}))
      setError(errData.error || `Error ${productsRes.status}`)
      setLoading(false)
      return
    }

    const { products } = await productsRes.json()
    const found = products.find(p => p.id === id)

    if (!found) {
      setError('Producto no encontrado')
      setLoading(false)
      return
    }

    setProduct(found)

    const savedRows = (costsRes.data || []).map(r => ({ qty: r.quantity, cost: String(r.cost) }))
    const hasQty1   = savedRows.some(r => r.qty === 1)
    setTiers(hasQty1 ? savedRows : [{ qty: 1, cost: '' }, ...savedRows])

    setLoading(false)
  }, [id])

  useEffect(() => { loadData() }, [loadData])

  function updateCost(index, value) {
    setTiers(t => t.map((row, i) => i === index ? { ...row, cost: value } : row))
  }

  function addTier() {
    const maxQty = Math.max(...tiers.map(t => t.qty))
    setTiers(t => [...t, { qty: maxQty + 1, cost: '' }])
  }

  function removeTier(index) {
    setTiers(t => t.filter((_, i) => i !== index))
  }

  async function saveCosts() {
    setSaving(true)
    setSaveError('')

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError || !authData?.user) throw new Error(authError?.message || 'No hay sesión activa')

      const userId = authData.user.id
      const rows   = tiers.filter(r => r.cost !== '' && !isNaN(parseFloat(r.cost)) && parseFloat(r.cost) >= 0)

      const { error: deleteError } = await supabase
        .from('product_costs')
        .delete()
        .eq('user_id', userId)
        .eq('shopify_product_id', id)

      if (deleteError) throw new Error(deleteError.message)

      if (rows.length > 0) {
        const { error: insertError } = await supabase
          .from('product_costs')
          .insert(rows.map(r => ({
            user_id:            userId,
            shopify_product_id: id,
            product_title:      product?.title || '',
            quantity:           Number(r.qty),
            cost:               parseFloat(r.cost),
          })))

        if (insertError) throw new Error(insertError.message)
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
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

  if (loading) return <PageSkeleton />

  if (error) {
    const noShopify = error.toLowerCase().includes('shopify') || error.toLowerCase().includes('conectada')
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <button onClick={() => navigate('/products')} className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white transition-colors">
          <ArrowLeft size={15} /> Volver a Productos
        </button>
        <div className="card p-10 text-center space-y-4 max-w-md w-full mx-auto">
          <Package size={24} className="mx-auto text-white/30" />
          <div>
            <p className="text-sm font-semibold text-white">
              {noShopify ? 'Conecta tu tienda Shopify primero' : 'Error al cargar el producto'}
            </p>
            <p className="text-xs text-white/40 mt-1.5">{error}</p>
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

  const minPrice = product?.variants?.length
    ? Math.min(...product.variants.map(v => parseFloat(v.price) || 0))
    : 0
  const variantCount = product?.variants?.length ?? 0

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Back button */}
      <button
        onClick={() => navigate('/products')}
        className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white transition-colors"
      >
        <ArrowLeft size={15} />
        Volver a Productos
      </button>

      {/* Product header card */}
      <div className="card p-6 space-y-5">
        <div className="flex items-center gap-4">
          {product.image ? (
            <img
              src={product.image}
              alt={product.title}
              className="w-16 h-16 rounded-xl object-cover bg-white/5 shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
              <Package size={22} className="text-white/20" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-white leading-snug">{product.title}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-sm text-white/50">
                Precio: <span className="text-white/80 font-medium">${minPrice.toFixed(2)}</span>
              </span>
              {variantCount > 1 && (
                <span className="text-xs text-white/30">{variantCount} variantes</span>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-white/5" />

        {/* Cost tiers */}
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-white">Coste por cantidad</p>
            <p className="text-xs text-white/40 mt-0.5">
              Define el coste de compra por tramos de cantidad para calcular el COGS real.
            </p>
          </div>

          <div className="space-y-2.5">
            {tiers.map((tier, i) => (
              <CostRow
                key={i}
                qty={tier.qty}
                cost={tier.cost}
                removable={i > 0}
                onCostChange={v => updateCost(i, v)}
                onRemove={() => removeTier(i)}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={addTier}
            className="flex items-center gap-1.5 text-xs text-brand-400/60 hover:text-brand-400 transition-colors py-1"
          >
            <Plus size={13} />
            Añadir tramo de cantidad
          </button>
        </div>

        <div className="border-t border-white/5 pt-1 space-y-2">
          {saveError && (
            <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5">
              {saveError}
            </p>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={saveCosts}
              disabled={saving}
              className={`flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                saved
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 cursor-default'
                  : 'btn-primary disabled:opacity-50 disabled:cursor-not-allowed'
              }`}
            >
              {saving ? (
                <><Loader2 size={13} className="animate-spin" /> Guardando...</>
              ) : saved ? (
                <><CheckCircle2 size={13} /> Guardado</>
              ) : (
                'Guardar costes'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
