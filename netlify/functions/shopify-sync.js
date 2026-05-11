import { createClient } from '@supabase/supabase-js'

function mapOrder(order) {
  const firstName = order.customer?.first_name || ''
  const lastName = order.customer?.last_name || ''
  const customerName = [firstName, lastName].filter(Boolean).join(' ') || 'Cliente desconocido'

  return {
    shopify_id: String(order.id),
    order_number: `#${order.order_number}`,
    customer_name: customerName,
    customer_email: order.customer?.email || '',
    amount: parseFloat(order.total_price) || 0,
    currency: order.currency || 'EUR',
    financial_status: order.financial_status || 'pending',
    fulfillment_status: order.fulfillment_status || 'unfulfilled',
    line_items: (order.line_items || []).map((item) => ({
      name: item.name,
      quantity: item.quantity,
      price: item.price,
    })),
    source_name: order.source_name || 'web',
    shopify_created_at: order.created_at,
    updated_at: new Date().toISOString(),
  }
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  let shopDomain
  try {
    ;({ shopDomain } = JSON.parse(event.body))
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Cuerpo de solicitud inválido' }) }
  }

  const raw = shopDomain
  shopDomain = (shopDomain || '').replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase()
  console.log('[sync] shopDomain recibido:', raw)
  console.log('[sync] shopDomain normalizado:', shopDomain)

  // Support both SUPABASE_URL and VITE_SUPABASE_URL env var names
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY

  console.log('[sync] SUPABASE_URL presente:', !!process.env.SUPABASE_URL)
  console.log('[sync] VITE_SUPABASE_URL presente:', !!process.env.VITE_SUPABASE_URL)
  console.log('[sync] SERVICE_ROLE_KEY presente:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)
  console.log('[sync] supabaseUrl resuelto:', supabaseUrl ? supabaseUrl.slice(0, 30) + '...' : 'MISSING')
  console.log('[sync] supabaseKey resuelto:', supabaseKey ? supabaseKey.slice(0, 8) + '...' : 'MISSING')

  if (!supabaseUrl || !supabaseKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Variables de entorno de Supabase no configuradas (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)' }),
    }
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    const { data: conn, error: connErr } = await supabase
      .from('shopify_connections')
      .select('access_token')
      .eq('shop_domain', shopDomain)
      .single()

    console.log('[sync] consulta Supabase — connErr:', connErr?.message || null, '| conn found:', !!conn)

    if (connErr || !conn) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Tienda no encontrada. Conecta primero.' }) }
    }

    const { access_token: accessToken } = conn

    const countUrl = `https://${shopDomain}/admin/api/2025-07/orders/count.json?status=any`
    console.log('[sync] GET', countUrl)
    const countRes = await fetch(countUrl, { headers: { 'X-Shopify-Access-Token': accessToken } })
    console.log('[sync] count status:', countRes.status)

    if (!countRes.ok) {
      const body = await countRes.text()
      console.log('[sync] count error body:', body)
    }

    const { count: totalOrders = 0 } = countRes.ok ? await countRes.json() : {}
    console.log('[sync] totalOrders:', totalOrders)

    await supabase
      .from('shopify_connections')
      .update({ sync_total: totalOrders })
      .eq('shop_domain', shopDomain)

    let allOrders = []
    let nextUrl = `https://${shopDomain}/admin/api/2025-07/orders.json?status=any&limit=250`
    let page = 0

    while (nextUrl) {
      page++
      console.log(`[sync] GET página ${page}:`, nextUrl)
      const res = await fetch(nextUrl, {
        headers: { 'X-Shopify-Access-Token': accessToken },
      })

      console.log(`[sync] página ${page} status:`, res.status)

      if (!res.ok) {
        const errBody = await res.text()
        console.log(`[sync] página ${page} error body:`, errBody)
        return { statusCode: 502, body: JSON.stringify({ error: `Error al obtener pedidos de Shopify (${res.status})` }) }
      }

      const { orders } = await res.json()
      console.log(`[sync] página ${page} pedidos recibidos:`, orders?.length ?? 0)

      if (orders?.length) {
        allOrders = allOrders.concat(orders)

        const mapped = orders.map(mapOrder)
        const { error: upsertErr } = await supabase
          .from('shopify_orders')
          .upsert(mapped, { onConflict: 'shopify_id' })

        if (upsertErr) {
          console.error('[sync] upsert error:', upsertErr.message)
          return { statusCode: 500, body: JSON.stringify({ error: `Error al guardar pedidos: ${upsertErr.message}` }) }
        }
      }

      const link = res.headers.get('link') || ''
      const match = link.match(/<([^>]+)>; rel="next"/)
      nextUrl = match ? match[1] : null
    }

    // Register webhooks for real-time order updates
    const siteUrl = process.env.URL || process.env.DEPLOY_URL
    if (siteUrl) {
      const webhookBase = `${siteUrl}/.netlify/functions/shopify-webhook`
      for (const topic of ['orders/create', 'orders/updated']) {
        const whRes = await fetch(`https://${shopDomain}/admin/api/2025-07/webhooks.json`, {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            webhook: { topic, address: webhookBase, format: 'json' },
          }),
        })
        console.log(`[sync] webhook ${topic} status:`, whRes.status)
      }
    }

    await supabase
      .from('shopify_connections')
      .update({ is_active: true, last_synced_at: new Date().toISOString() })
      .eq('shop_domain', shopDomain)

    console.log('[sync] completado — pedidos sincronizados:', allOrders.length)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ synced: allOrders.length }),
    }
  } catch (err) {
    console.error('[sync] excepción no capturada:', err.message, err.stack)
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `Error interno durante la sincronización: ${err.message}` }),
    }
  }
}
