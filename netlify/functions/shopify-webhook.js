import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const API = '2025-07'
const ORDER_TOPICS = new Set(['orders/create', 'orders/updated', 'orders/paid'])
const ALL_TOPICS   = new Set([...ORDER_TOPICS, 'fulfillments/create'])

// The webhook payload includes full PII (first_name, last_name, email, phone,
// billing_address) even on basic Shopify plans. The REST API does NOT.
// Always map from the raw webhook payload — never make a second API call.
function resolveCustomerName(order) {
  const fn = (order.customer?.first_name || '').trim()
  const ln = (order.customer?.last_name  || '').trim()
  const fullName = [fn, ln].filter(Boolean).join(' ')
  return fullName || order.billing_address?.name || null
}

function mapOrder(order, userId, hasPhoneCol = false) {
  const row = {
    shopify_id:         String(order.id),
    order_number:       `#${order.order_number}`,
    customer_name:      resolveCustomerName(order),
    customer_email:     order.customer?.email || order.email || order.contact_email || null,
    amount:             parseFloat(order.total_price) || 0,
    currency:           order.currency || 'EUR',
    financial_status:   order.financial_status  || 'pending',
    fulfillment_status: order.fulfillment_status || 'unfulfilled',
    line_items:         (order.line_items || []).map((i) => ({
      name: i.name, quantity: i.quantity, price: i.price,
      product_id: i.product_id ? String(i.product_id) : null,
      variant_id: i.variant_id ? String(i.variant_id) : null,
    })),
    source_name:        order.source_name || 'web',
    shopify_created_at: order.created_at,
    updated_at:         new Date().toISOString(),
    user_id:            userId,
  }
  if (hasPhoneCol) {
    row.customer_phone = order.customer?.phone || order.billing_address?.phone || null
  }
  return row
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const topic      = event.headers['x-shopify-topic'] || ''
  const shopDomain = (event.headers['x-shopify-shop-domain'] || '').toLowerCase().replace(/\/$/, '')

  if (!ALL_TOPICS.has(topic)) {
    return { statusCode: 200, body: JSON.stringify({ ignored: true }) }
  }

  let payload
  try { payload = JSON.parse(event.body) }
  catch { return { statusCode: 400, body: 'Invalid JSON' } }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error('[webhook] Supabase env vars missing')
    return { statusCode: 500, body: 'Server configuration error' }
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { realtime: { transport: ws } })

  const { error: phoneColErr } = await supabase.from('shopify_orders').select('customer_phone').limit(0)
  const hasPhoneCol = !phoneColErr

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

  // ── fulfillments/create ───────────────────────────────────────────────────
  if (topic === 'fulfillments/create') {
    const orderId = String(payload.order_id)
    const { error: updateErr } = await supabase
      .from('shopify_orders')
      .update({ fulfillment_status: 'fulfilled', updated_at: new Date().toISOString() })
      .eq('user_id', conn.user_id)
      .eq('shopify_id', orderId)

    if (updateErr) {
      console.error('[webhook] fulfillment update error:', updateErr.message)
      return { statusCode: 500, body: 'Error updating fulfillment status' }
    }

    console.log(`[webhook] fulfillments/create | order: ${orderId} | → fulfilled | user: ${conn.user_id}`)
    return { statusCode: 200, body: JSON.stringify({ received: true }) }
  }

  // ── orders/* — map directly from webhook payload ──────────────────────────
  // The webhook payload contains full PII. Log it before mapping.
  if (ORDER_TOPICS.has(topic)) {
    console.log('[webhook] customer payload:', JSON.stringify({
      customer_first: payload.customer?.first_name,
      customer_last:  payload.customer?.last_name,
      customer_email: payload.customer?.email,
      customer_phone: payload.customer?.phone,
      order_email:    payload.email,
      billing_name:   payload.billing_address?.name,
      billing_phone:  payload.billing_address?.phone,
    }))
  }

  const mapped = mapOrder(payload, conn.user_id, hasPhoneCol)
  const { error: upsertErr } = await supabase
    .from('shopify_orders')
    .upsert(mapped, { onConflict: 'user_id,shopify_id', ignoreDuplicates: false })

  if (upsertErr) {
    console.error('[webhook] upsert error:', upsertErr.message)
    return { statusCode: 500, body: 'Error saving order' }
  }

  console.log(
    `[webhook] ${topic} | order: ${payload.id}` +
    ` | customer: "${mapped.customer_name ?? 'null'}" <${mapped.customer_email ?? 'null'}>` +
    ` | status: ${mapped.financial_status}/${mapped.fulfillment_status}` +
    ` | user: ${conn.user_id}`
  )
  return { statusCode: 200, body: JSON.stringify({ received: true }) }
}
