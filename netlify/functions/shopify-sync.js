import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const API = '2025-07'

function shopifyError(status) {
  if (status === 401) return 'Token inválido o expirado (Shopify 401).'
  if (status === 403) return 'Sin permiso para leer pedidos (Shopify 403). Añade el scope "read_orders" en tu app de Shopify y obtén un nuevo token.'
  if (status === 429) return 'Rate limit de Shopify (429). Espera unos segundos y vuelve a intentarlo.'
  return `Shopify devolvió ${status}.`
}

function mapOrder(order, userId, hasPhoneCol = false) {
  const firstName = order.customer?.first_name || ''
  const lastName  = order.customer?.last_name  || ''
  let customerName = [firstName, lastName].filter(Boolean).join(' ')
  if (!customerName) {
    customerName = order.billing_address?.name || order.shipping_address?.name || ''
  }

  const row = {
    shopify_id:         String(order.id),
    order_number:       `#${order.order_number}`,
    customer_name:      customerName || 'Cliente desconocido',
    customer_email:     order.customer?.email || order.email || '',
    amount:             parseFloat(order.total_price) || 0,
    currency:           order.currency || 'EUR',
    financial_status:   order.financial_status  || 'pending',
    fulfillment_status: order.fulfillment_status || 'unfulfilled',
    line_items:         (order.line_items || []).map((i) => ({ name: i.name, quantity: i.quantity, price: i.price, product_id: i.product_id ? String(i.product_id) : null, variant_id: i.variant_id ? String(i.variant_id) : null })),
    source_name:        order.source_name || 'web',
    shopify_created_at: order.created_at,
    updated_at:         new Date().toISOString(),
    user_id:            userId,
  }
  if (hasPhoneCol) {
    row.customer_phone = order.customer?.phone || order.billing_address?.phone || order.shipping_address?.phone || null
  }
  return row
}

export const handler = async (event) => {
  const startTime = Date.now()

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  // ── Supabase client ───────────────────────────────────────────────────────
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Variables de entorno de Supabase no configuradas' }) }
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { realtime: { transport: ws } })

  // ── Auth check ────────────────────────────────────────────────────────────
  const token = event.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: 'No autorizado' }) }
  }
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Sesión inválida. Vuelve a iniciar sesión.' }) }
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let shopDomain
  try {
    ;({ shopDomain } = JSON.parse(event.body))
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Cuerpo de solicitud inválido' }) }
  }

  const raw = shopDomain
  shopDomain = (shopDomain || '').replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase()
  console.log('[sync] user:', user.id, '| shopDomain raw:', raw, '→', shopDomain)

  try {
    // ── Read credentials (scoped to this user) ────────────────────────────
    const { data: conn, error: connErr } = await supabase
      .from('shopify_connections')
      .select('access_token')
      .eq('shop_domain', shopDomain)
      .eq('user_id', user.id)
      .single()

    console.log('[sync] connErr:', connErr?.message || null, '| found:', !!conn)

    if (connErr || !conn) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Tienda no encontrada. Vuelve a conectar desde Configuración.' }) }
    }

    const accessToken = conn.access_token.trim()

    // ── Detect optional columns ───────────────────────────────────────────
    const { error: phoneColErr } = await supabase.from('shopify_orders').select('customer_phone').limit(0)
    const hasPhoneCol = !phoneColErr

    // ── Order count (for progress bar) ───────────────────────────────────
    const countRes = await fetch(
      `https://${shopDomain}/admin/api/${API}/orders/count.json?status=any`,
      { headers: { 'X-Shopify-Access-Token': accessToken } }
    )
    console.log('[sync] count status:', countRes.status)

    if (!countRes.ok) {
      const errText = await countRes.text()
      console.log('[sync] count error body:', errText.slice(0, 300))
      if (countRes.status === 401 || countRes.status === 403) {
        return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: shopifyError(countRes.status) }) }
      }
    }

    const { count: totalOrders = 0 } = countRes.ok ? await countRes.json() : {}
    console.log('[sync] totalOrders:', totalOrders)

    await supabase.from('shopify_connections').update({ sync_total: totalOrders }).eq('shop_domain', shopDomain).eq('user_id', user.id)

    // ── Paginate orders ────────────────────────────────────────────────────
    let allOrders = []
    let nextUrl   = `https://${shopDomain}/admin/api/${API}/orders.json?status=any&limit=250`
    let page      = 0

    while (nextUrl) {
      const elapsed = Date.now() - startTime
      if (elapsed > 8500) {
        console.log(`[sync] time-guard a ${elapsed}ms — ${allOrders.length} pedidos`)
        break
      }

      page++
      const res = await fetch(nextUrl, { headers: { 'X-Shopify-Access-Token': accessToken } })
      console.log(`[sync] página ${page} status:`, res.status)

      if (!res.ok) {
        const errText = await res.text()
        console.log(`[sync] página ${page} error:`, errText.slice(0, 300))
        return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: shopifyError(res.status) }) }
      }

      const { orders } = await res.json()
      console.log(`[sync] página ${page} pedidos:`, orders?.length ?? 0)

      if (orders?.length) {
        allOrders = allOrders.concat(orders)
        const { error: upsertErr } = await supabase
          .from('shopify_orders')
          .upsert(orders.map(o => mapOrder(o, user.id, hasPhoneCol)), { onConflict: 'user_id,shopify_id' })

        if (upsertErr) {
          console.error('[sync] upsert error:', upsertErr.message)
          return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: `Error al guardar pedidos: ${upsertErr.message}` }) }
        }
      }

      const link  = res.headers.get('link') || ''
      const match = link.match(/<([^>]+)>; rel="next"/)
      nextUrl = match ? match[1] : null
    }

    // ── Register webhooks ──────────────────────────────────────────────────
    const siteUrl = process.env.URL || process.env.DEPLOY_URL
    if (siteUrl) {
      const webhookBase = `${siteUrl}/.netlify/functions/shopify-webhook`
      for (const topic of ['orders/create', 'orders/updated']) {
        const whRes = await fetch(`https://${shopDomain}/admin/api/${API}/webhooks.json`, {
          method: 'POST',
          headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({ webhook: { topic, address: webhookBase, format: 'json' } }),
        })
        console.log(`[sync] webhook ${topic}:`, whRes.status)
      }
    }

    await supabase
      .from('shopify_connections')
      .update({ is_active: true, last_synced_at: new Date().toISOString() })
      .eq('shop_domain', shopDomain)
      .eq('user_id', user.id)

    console.log('[sync] completado:', allOrders.length, 'pedidos en', Date.now() - startTime, 'ms')

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ synced: allOrders.length }),
    }
  } catch (err) {
    console.error('[sync] excepción:', err.message, err.stack)
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `Error interno: ${err.message}` }),
    }
  }
}
