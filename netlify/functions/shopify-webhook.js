import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const API = '2025-07'
const ORDER_TOPICS = new Set(['orders/create', 'orders/updated', 'orders/paid'])
const ALL_TOPICS   = new Set([...ORDER_TOPICS, 'fulfillments/create'])

// Extract customer name using every available field in order of reliability
function resolveCustomerName(order) {
  // 1. Customer account (requires read_customers scope)
  const custFirst = order.customer?.first_name || ''
  const custLast  = order.customer?.last_name  || ''
  let name = [custFirst, custLast].filter(Boolean).join(' ')

  // 2. Billing address first/last name — always returned, no scope needed
  if (!name) {
    const billFirst = order.billing_address?.first_name || ''
    const billLast  = order.billing_address?.last_name  || ''
    name = [billFirst, billLast].filter(Boolean).join(' ')
  }

  // 3. Billing address.name (pre-formatted full name)
  if (!name) name = order.billing_address?.name || ''

  // 4. Shipping address
  if (!name) name = order.shipping_address?.name || ''

  return name.trim() || null
}

function mapOrder(order, userId, hasPhoneCol = false) {
  const row = {
    shopify_id:         String(order.id),
    order_number:       `#${order.order_number}`,
    customer_name:      resolveCustomerName(order),
    customer_email:     order.customer?.email || order.contact_email || order.email || null,
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
    row.customer_phone = order.customer?.phone
      || order.billing_address?.phone
      || order.shipping_address?.phone
      || null
  }
  return row
}

// Fetch the full order from Shopify to get complete customer data.
// Webhook payloads intentionally omit customer details.
async function fetchFullOrder(shopDomain, accessToken, orderId) {
  try {
    const res = await fetch(
      `https://${shopDomain}/admin/api/${API}/orders/${orderId}.json` +
      `?fields=id,order_number,email,contact_email,customer,billing_address,shipping_address,` +
      `total_price,currency,financial_status,fulfillment_status,line_items,source_name,created_at`,
      { headers: { 'X-Shopify-Access-Token': accessToken } }
    )
    if (!res.ok) {
      console.warn('[webhook] enrichment call failed:', res.status)
      return null
    }
    const { order } = await res.json()
    return order || null
  } catch (err) {
    console.warn('[webhook] enrichment call error:', err.message)
    return null
  }
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

  // Fetch user_id AND access_token so we can enrich with a second API call
  const { data: conn } = await supabase
    .from('shopify_connections')
    .select('user_id, access_token')
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

  // ── orders/* — fetch full order first, then upsert ────────────────────────
  // Webhook payloads omit customer.first_name, billing_address etc.
  // A single GET to orders/{id}.json fills in all customer data.
  const orderId   = String(payload.id)
  const fullOrder = conn.access_token
    ? await fetchFullOrder(shopDomain, conn.access_token, orderId)
    : null

  // Use enriched order if available, fall back to webhook payload
  const orderData = fullOrder ?? payload

  const mapped = mapOrder(orderData, conn.user_id, hasPhoneCol)
  const { error: upsertErr } = await supabase
    .from('shopify_orders')
    .upsert(mapped, { onConflict: 'user_id,shopify_id', ignoreDuplicates: false })

  if (upsertErr) {
    console.error('[webhook] upsert error:', upsertErr.message)
    return { statusCode: 500, body: 'Error saving order' }
  }

  console.log(
    `[webhook] ${topic} | order: ${orderId}` +
    ` | customer: ${mapped.customer_name ?? 'null'} <${mapped.customer_email ?? 'null'}>` +
    ` | enriched: ${!!fullOrder}` +
    ` | status: ${mapped.financial_status}/${mapped.fulfillment_status}` +
    ` | user: ${conn.user_id}`
  )
  return { statusCode: 200, body: JSON.stringify({ received: true }) }
}
