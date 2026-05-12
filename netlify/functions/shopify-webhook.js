import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import ws from 'ws'

const TOPICS = new Set(['orders/create', 'orders/updated', 'orders/paid'])

function verifyHmac(rawBody, hmacHeader, secret) {
  const hash = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64')
  const a = Buffer.from(hash)
  const b = Buffer.from(hmacHeader)
  // timingSafeEqual requires identical lengths — if they differ the signature is wrong
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function mapOrder(order, userId) {
  const firstName = order.customer?.first_name || ''
  const lastName  = order.customer?.last_name  || ''
  const customerName = [firstName, lastName].filter(Boolean).join(' ') || 'Cliente desconocido'
  return {
    shopify_id:         String(order.id),
    order_number:       `#${order.order_number}`,
    customer_name:      customerName,
    customer_email:     order.customer?.email || '',
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

  // ── HMAC verification ────────────────────────────────────────────────────
  const secret    = process.env.SHOPIFY_WEBHOOK_SECRET
  const hmacHeader = event.headers['x-shopify-hmac-sha256']

  if (secret) {
    if (!hmacHeader) {
      console.warn('[webhook] missing x-shopify-hmac-sha256 header')
      return { statusCode: 401, body: 'Unauthorized' }
    }
    if (!verifyHmac(event.body, hmacHeader, secret)) {
      console.warn('[webhook] HMAC verification failed')
      return { statusCode: 401, body: 'Unauthorized' }
    }
  }

  // ── Topic filter ─────────────────────────────────────────────────────────
  const topic     = event.headers['x-shopify-topic'] || ''
  const shopDomain = (event.headers['x-shopify-shop-domain'] || '').toLowerCase().replace(/\/$/, '')

  if (!TOPICS.has(topic)) {
    // Acknowledge unsupported topics immediately so Shopify stops retrying
    return { statusCode: 200, body: JSON.stringify({ ignored: true }) }
  }

  // ── Parse order payload ──────────────────────────────────────────────────
  let order
  try {
    order = JSON.parse(event.body)
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' }
  }

  // ── Supabase setup ───────────────────────────────────────────────────────
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error('[webhook] Supabase env vars missing')
    return { statusCode: 500, body: 'Server configuration error' }
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { realtime: { transport: ws } })

  // ── Look up user_id by shop domain ───────────────────────────────────────
  // Must use service-role key (bypasses RLS) since there is no user JWT here
  if (!shopDomain) {
    console.error('[webhook] x-shopify-shop-domain header missing')
    return { statusCode: 400, body: 'Missing shop domain header' }
  }

  // maybeSingle() returns null (not an error) when no row matches
  const { data: conn } = await supabase
    .from('shopify_connections')
    .select('user_id')
    .eq('shop_domain', shopDomain)
    .limit(1)
    .maybeSingle()

  if (!conn?.user_id) {
    console.warn('[webhook] shop not found:', shopDomain)
    // Return 200 so Shopify stops retrying — the shop simply isn't registered
    return { statusCode: 200, body: JSON.stringify({ ignored: true, reason: 'shop not found' }) }
  }

  // ── Upsert order (INSERT on new, UPDATE on existing) ─────────────────────
  // onConflict: 'user_id,shopify_id' matches the UNIQUE constraint from migration 002.
  // All status fields (financial_status, fulfillment_status, amount) are overwritten,
  // so orders/updated events keep the DB in sync with Shopify in real time.
  const mapped = mapOrder(order, conn.user_id)
  const { error: upsertErr } = await supabase
    .from('shopify_orders')
    .upsert(mapped, { onConflict: 'user_id,shopify_id', ignoreDuplicates: false })

  if (upsertErr) {
    console.error('[webhook] upsert error:', upsertErr.message)
    return { statusCode: 500, body: 'Error saving order' }
  }

  console.log(`[webhook] ${topic} | order: ${order.id} | status: ${mapped.financial_status}/${mapped.fulfillment_status} | user: ${conn.user_id}`)
  return { statusCode: 200, body: JSON.stringify({ received: true }) }
}
