/**
 * Targeted resync: reads all orders from Shopify and updates ONLY the
 * customer_name, customer_email and customer_phone columns in shopify_orders.
 * Safe to call multiple times. Logs first-order customer data for debugging.
 */
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const API = '2025-07'

function extractCustomer(order) {
  const firstName = order.customer?.first_name || ''
  const lastName  = order.customer?.last_name  || ''
  let customerName = [firstName, lastName].filter(Boolean).join(' ')

  // Guest checkout: use billing or shipping address name
  if (!customerName) {
    customerName = order.billing_address?.name
      || order.shipping_address?.name
      || ''
  }

  // contact_email is Shopify's primary email field in newer API versions
  const email = order.customer?.email
    || order.contact_email
    || order.email
    || null

  return {
    shopify_id:     String(order.id),
    customer_name:  customerName || 'Cliente desconocido',
    customer_email: email,
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
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Missing Supabase env vars' }) }
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { realtime: { transport: ws } })

  // Auth
  const token = event.headers.authorization?.replace('Bearer ', '')
  if (!token) return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Unauthorized' }) }

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid session' }) }

  // Shopify connection
  const { data: conn } = await supabase
    .from('shopify_connections')
    .select('shop_domain, access_token')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (!conn) {
    return { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'No active Shopify connection' }) }
  }

  const shopDomain  = conn.shop_domain
  const accessToken = conn.access_token.trim()
  const startTime   = Date.now()

  // Detect whether customer_phone column exists
  const { error: phoneColErr } = await supabase.from('shopify_orders').select('customer_phone').limit(0)
  const hasPhoneCol = !phoneColErr
  console.log('[resync-customers] customer_phone column exists:', hasPhoneCol)

  let totalUpdated = 0
  let page = 0
  let nextUrl = `https://${shopDomain}/admin/api/${API}/orders.json?status=any&limit=250`

  while (nextUrl) {
    if (Date.now() - startTime > 8500) {
      console.log('[resync-customers] time guard hit at', Date.now() - startTime, 'ms')
      break
    }

    page++
    const res = await fetch(nextUrl, { headers: { 'X-Shopify-Access-Token': accessToken } })
    if (!res.ok) {
      console.error('[resync-customers] Shopify error', res.status)
      break
    }

    const { orders = [] } = await res.json()

    // Log sample from first page so we can debug what Shopify returns
    if (page === 1 && orders.length > 0) {
      const s = orders[0]
      console.log('[resync-customers] sample order[0]:', JSON.stringify({
        id:           s.id,
        email:        s.email,
        customer:     s.customer,
        billing_name: s.billing_address?.name,
        billing_phone:s.billing_address?.phone,
      }, null, 2).slice(0, 800))
    }

    if (!orders.length) break

    const updates = orders.map(extractCustomer)

    // Concurrent updates in chunks of 25
    const CHUNK = 25
    for (let i = 0; i < updates.length; i += CHUNK) {
      const chunk = updates.slice(i, i + CHUNK)
      await Promise.all(chunk.map(({ shopify_id, customer_name, customer_email, customer_phone }) => {
        const patch = {
          customer_name:  customer_name,
          customer_email: customer_email,
          updated_at:     new Date().toISOString(),
        }
        if (hasPhoneCol) patch.customer_phone = customer_phone
        return supabase
          .from('shopify_orders')
          .update(patch)
          .eq('user_id', user.id)
          .eq('shopify_id', shopify_id)
      }))
      totalUpdated += chunk.length
    }

    const link  = res.headers.get('link') || ''
    const match = link.match(/<([^>]+)>; rel="next"/)
    nextUrl = match ? match[1] : null
  }

  console.log(`[resync-customers] done: ${totalUpdated} orders in ${Date.now() - startTime}ms`)

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updated: totalUpdated, elapsed: Date.now() - startTime }),
  }
}
