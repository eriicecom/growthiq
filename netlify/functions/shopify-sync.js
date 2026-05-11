import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

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

  // Read credentials from Supabase (never exposed to the client after initial save)
  const { data: conn, error: connErr } = await supabase
    .from('shopify_connections')
    .select('access_token')
    .eq('shop_domain', shopDomain)
    .single()

  if (connErr || !conn) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Tienda no encontrada. Conecta primero.' }) }
  }

  const { access_token: accessToken } = conn

  // Get total order count for progress tracking
  const countRes = await fetch(
    `https://${shopDomain}/admin/api/2024-01/orders/count.json?status=any`,
    { headers: { 'X-Shopify-Access-Token': accessToken } }
  )
  const { count: totalOrders = 0 } = countRes.ok ? await countRes.json() : {}

  // Save total to connections table so the frontend can track progress
  await supabase
    .from('shopify_connections')
    .update({ sync_total: totalOrders })
    .eq('shop_domain', shopDomain)

  // Paginate through all orders
  let allOrders = []
  let nextUrl = `https://${shopDomain}/admin/api/2024-01/orders.json?status=any&limit=250`

  while (nextUrl) {
    const res = await fetch(nextUrl, {
      headers: { 'X-Shopify-Access-Token': accessToken },
    })

    if (!res.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: `Error al obtener pedidos (${res.status})` }) }
    }

    const { orders } = await res.json()
    if (orders?.length) {
      allOrders = allOrders.concat(orders)

      // Upsert each page immediately so the client sees progress in real time
      const mapped = orders.map(mapOrder)
      await supabase.from('shopify_orders').upsert(mapped, { onConflict: 'shopify_id' })
    }

    // Follow pagination link
    const link = res.headers.get('link') || ''
    const match = link.match(/<([^>]+)>; rel="next"/)
    nextUrl = match ? match[1] : null
  }

  // Register webhooks for real-time order updates
  const siteUrl = process.env.URL || process.env.DEPLOY_URL
  if (siteUrl) {
    const webhookBase = `${siteUrl}/.netlify/functions/shopify-webhook`
    for (const topic of ['orders/create', 'orders/updated']) {
      await fetch(`https://${shopDomain}/admin/api/2024-01/webhooks.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          webhook: { topic, address: webhookBase, format: 'json' },
        }),
      })
    }
  }

  // Mark connection as active
  await supabase
    .from('shopify_connections')
    .update({ is_active: true, last_synced_at: new Date().toISOString() })
    .eq('shop_domain', shopDomain)

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ synced: allOrders.length }),
  }
}
