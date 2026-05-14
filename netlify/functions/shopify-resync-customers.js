/**
 * Two-phase customer fix:
 *   1. Clean rows where customer_name = 'Cliente desconocido' → set to NULL
 *   2. Fetch all orders from Shopify and UPDATE customer_name / customer_email /
 *      customer_phone with real data (NULL when genuinely unavailable).
 *
 * POST /.netlify/functions/shopify-resync-customers
 * Header: Authorization: Bearer <supabase-jwt>
 */
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const API = '2025-07'

function extractCustomer(order) {
  const fn = order.customer?.first_name
  const ln = order.customer?.last_name
  const name = (fn && ln)
    ? (fn + ' ' + ln).trim()
    : fn || ln || order.billing_address?.name || order.shipping_address?.name || null

  return {
    shopify_id:     String(order.id),
    customer_name:  name,
    customer_email: order.customer?.email || order.email || order.contact_email || null,
    customer_phone: order.customer?.phone
      || order.billing_address?.phone
      || order.shipping_address?.phone
      || null,
  }
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_ANON_KEY
    || process.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing Supabase env vars' }) }
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { realtime: { transport: ws } })

  const token = event.headers.authorization?.replace('Bearer ', '')
  if (!token) return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Unauthorized' }) }

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid session' }) }

  // ── Phase 1: clean bad fallback text stored in DB ─────────────────────────
  const [cleanName, cleanEmail] = await Promise.all([
    supabase.from('shopify_orders')
      .update({ customer_name: null })
      .eq('user_id', user.id)
      .eq('customer_name', 'Cliente desconocido'),
    supabase.from('shopify_orders')
      .update({ customer_email: null })
      .eq('user_id', user.id)
      .eq('customer_email', ''),
  ])

  console.log('[resync] phase 1 — cleanup:',
    'name error:', cleanName.error?.message || 'ok',
    '| email error:', cleanEmail.error?.message || 'ok')

  // ── Phase 2: repopulate from Shopify ─────────────────────────────────────
  const { data: conn } = await supabase
    .from('shopify_connections')
    .select('shop_domain, access_token')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (!conn) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cleaned: true, updated: 0, note: 'No active Shopify connection — cleanup done but no resync' }) }
  }

  const shopDomain  = conn.shop_domain
  const accessToken = conn.access_token.trim()
  const startTime   = Date.now()

  // Optional ?limit=N query param to resync only the last N orders (e.g. ?limit=20)
  const bodyRaw = event.body ? JSON.parse(event.body).limit : null
  const urlLimit = new URL('https://x.x' + (event.rawUrl || '/')).searchParams.get('limit')
  const maxOrders = parseInt(bodyRaw || urlLimit || '0', 10) || 0

  const { error: phoneColErr } = await supabase.from('shopify_orders').select('customer_phone').limit(0)
  const hasPhoneCol = !phoneColErr

  let totalUpdated = 0
  let page = 0
  const pageSize = maxOrders > 0 ? Math.min(maxOrders, 250) : 250
  let nextUrl = `https://${shopDomain}/admin/api/${API}/orders.json?status=any&limit=${pageSize}`

  while (nextUrl) {
    if (Date.now() - startTime > 8500) {
      console.log('[resync] time guard at', Date.now() - startTime, 'ms —', totalUpdated, 'updated so far')
      break
    }

    page++
    const res = await fetch(nextUrl, { headers: { 'X-Shopify-Access-Token': accessToken } })
    if (!res.ok) { console.error('[resync] Shopify', res.status); break }

    const { orders = [] } = await res.json()
    if (!orders.length) break

    // Log sample from first page
    if (page === 1) {
      const s = orders[0]
      console.log('[resync] page 1 sample order', s.id, '→',
        'customer:', s.customer ? `${s.customer.first_name} ${s.customer.last_name}`.trim() : 'null',
        '| email:', s.email || s.contact_email || 'null',
        '| billing_name:', s.billing_address?.name || 'null')
    }

    const updates = orders.map(extractCustomer)

    // Batch update in chunks of 25
    const CHUNK = 25
    for (let i = 0; i < updates.length; i += CHUNK) {
      const chunk = updates.slice(i, i + CHUNK)
      await Promise.all(chunk.map(({ shopify_id, customer_name, customer_email, customer_phone }) => {
        const patch = { customer_name, customer_email, updated_at: new Date().toISOString() }
        if (hasPhoneCol) patch.customer_phone = customer_phone
        return supabase
          .from('shopify_orders')
          .update(patch)
          .eq('user_id', user.id)
          .eq('shopify_id', shopify_id)
      }))
      totalUpdated += chunk.length
    }

    // Stop after first page when a maxOrders limit was requested
    if (maxOrders > 0) break

    const link  = res.headers.get('link') || ''
    const match = link.match(/<([^>]+)>; rel="next"/)
    nextUrl = match ? match[1] : null
  }

  console.log(`[resync] done — ${totalUpdated} orders updated in ${Date.now() - startTime}ms`)

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cleaned: true, updated: totalUpdated, elapsed_ms: Date.now() - startTime }),
  }
}
