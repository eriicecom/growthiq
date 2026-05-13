import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

// Topics that route to the order upsert path
const ORDER_TOPICS = new Set(['orders/create', 'orders/updated', 'orders/paid'])
// Topics handled by targeted column updates (not full upserts)
const ALL_TOPICS   = new Set([...ORDER_TOPICS, 'fulfillments/create'])

function mapOrder(order, userId) {
  const firstName = order.customer?.first_name || ''
  const lastName  = order.customer?.last_name  || ''
  let customerName = [firstName, lastName].filter(Boolean).join(' ')
  if (!customerName) {
    customerName = order.billing_address?.name || order.shipping_address?.name || ''
  }
  return {
    shopify_id:         String(order.id),
    order_number:       `#${order.order_number}`,
    customer_name:      customerName || 'Cliente desconocido',
    customer_email:     order.customer?.email || order.email || '',
    customer_phone:     order.customer?.phone || order.billing_address?.phone || order.shipping_address?.phone || '',
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
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  // ── Topic filter ─────────────────────────────────────────────────────────
  const topic      = event.headers['x-shopify-topic'] || ''
  const shopDomain = (event.headers['x-shopify-shop-domain'] || '').toLowerCase().replace(/\/$/, '')

  if (!ALL_TOPICS.has(topic)) {
    return { statusCode: 200, body: JSON.stringify({ ignored: true }) }
  }

  // ── Parse payload ────────────────────────────────────────────────────────
  let payload
  try {
    payload = JSON.parse(event.body)
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' }
  }

  // ── Supabase setup (service-role key — no user JWT available here) ────────
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error('[webhook] Supabase env vars missing')
    return { statusCode: 500, body: 'Server configuration error' }
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { realtime: { transport: ws } })

  // ── Look up user_id by shop domain ───────────────────────────────────────
  if (!shopDomain) {
    console.error('[webhook] x-shopify-shop-domain header missing')
    return { statusCode: 400, body: 'Missing shop domain header' }
  }

  const { data: conn } = await supabase
    .from('shopify_connections')
    .select('user_id')
    .eq('shop_domain', shopDomain)
    .limit(1)
    .maybeSingle()

  if (!conn?.user_id) {
    console.warn('[webhook] shop not found:', shopDomain)
    return { statusCode: 200, body: JSON.stringify({ ignored: true, reason: 'shop not found' }) }
  }

  // ── fulfillments/create — targeted UPDATE only ────────────────────────────
  // Payload: { id, order_id, status, line_items, ... }
  // We update fulfillment_status to 'fulfilled' on the parent order.
  if (topic === 'fulfillments/create') {
    const orderId = String(payload.order_id)

    const { error: updateErr } = await supabase
      .from('shopify_orders')
      .update({
        fulfillment_status: 'fulfilled',
        updated_at:         new Date().toISOString(),
      })
      .eq('user_id', conn.user_id)
      .eq('shopify_id', orderId)

    if (updateErr) {
      console.error('[webhook] fulfillment update error:', updateErr.message)
      return { statusCode: 500, body: 'Error updating fulfillment status' }
    }

    console.log(`[webhook] fulfillments/create | order: ${orderId} | fulfillment_status → fulfilled | user: ${conn.user_id}`)
    return { statusCode: 200, body: JSON.stringify({ received: true }) }
  }

  // ── orders/* — full upsert ────────────────────────────────────────────────
  const mapped = mapOrder(payload, conn.user_id)
  const { error: upsertErr } = await supabase
    .from('shopify_orders')
    .upsert(mapped, { onConflict: 'user_id,shopify_id', ignoreDuplicates: false })

  if (upsertErr) {
    console.error('[webhook] upsert error:', upsertErr.message)
    return { statusCode: 500, body: 'Error saving order' }
  }

  console.log(`[webhook] ${topic} | order: ${payload.id} | status: ${mapped.financial_status}/${mapped.fulfillment_status} | user: ${conn.user_id}`)
  return { statusCode: 200, body: JSON.stringify({ received: true }) }
}
