/**
 * Diagnostic function — call once to see exactly what Shopify returns
 * vs what's stored in the DB, and what mapOrder produces.
 *
 * GET or POST  /.netlify/functions/shopify-diagnose
 * Header: Authorization: Bearer <supabase-jwt>
 */
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const API = '2025-07'

function mapCustomer(order) {
  const firstName = order.customer?.first_name || ''
  const lastName  = order.customer?.last_name  || ''
  let name = [firstName, lastName].filter(Boolean).join(' ')
  if (!name) name = order.billing_address?.name || order.shipping_address?.name || ''

  return {
    computed_name:  name || '(vacío — usaría «Cliente desconocido»)',
    computed_email: order.customer?.email || order.contact_email || order.email || '(vacío)',
    computed_phone: order.customer?.phone || order.billing_address?.phone || null,
    raw: {
      customer:          order.customer,
      order_email:       order.email,
      contact_email:     order.contact_email,
      billing_name:      order.billing_address?.name,
      billing_phone:     order.billing_address?.phone,
      shipping_name:     order.shipping_address?.name,
    },
  }
}

export const handler = async (event) => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing Supabase env vars' }) }
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { realtime: { transport: ws } })

  const token = event.headers.authorization?.replace('Bearer ', '')
  if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Provide Authorization header' }) }

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) }

  const { data: conn } = await supabase
    .from('shopify_connections')
    .select('shop_domain, access_token')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (!conn) return { statusCode: 404, body: JSON.stringify({ error: 'No active Shopify connection' }) }

  // ── 1. Fetch 3 most recent orders from Shopify ──────────────────────────
  const shopifyRes = await fetch(
    `https://${conn.shop_domain}/admin/api/${API}/orders.json?status=any&limit=3`,
    { headers: { 'X-Shopify-Access-Token': conn.access_token.trim() } }
  )
  const shopifyBody = await shopifyRes.json()
  const shopifyOrders = shopifyBody.orders || []

  // ── 2. Fetch same 3 orders from Supabase ───────────────────────────────
  const shopifyIds = shopifyOrders.map(o => String(o.id))
  const { data: dbOrders } = shopifyIds.length
    ? await supabase
        .from('shopify_orders')
        .select('shopify_id, customer_name, customer_email, customer_phone')
        .eq('user_id', user.id)
        .in('shopify_id', shopifyIds)
    : { data: [] }

  const dbMap = Object.fromEntries((dbOrders || []).map(r => [r.shopify_id, r]))

  // ── 3. Sample of DB rows to check null/empty state ─────────────────────
  const { data: dbSample } = await supabase
    .from('shopify_orders')
    .select('shopify_id, order_number, customer_name, customer_email')
    .eq('user_id', user.id)
    .order('shopify_created_at', { ascending: false })
    .limit(5)

  // ── Build report ─────────────────────────────────────────────────────────
  const report = {
    shopify_api_status:  shopifyRes.status,
    shopify_order_count: shopifyOrders.length,
    orders: shopifyOrders.map(o => ({
      shopify_id:   String(o.id),
      order_number: o.order_number,
      shopify_data: mapCustomer(o),
      db_current:   dbMap[String(o.id)] || '(not in DB)',
    })),
    db_sample_last_5: dbSample,
    summary: {
      db_rows_with_empty_name:  dbSample?.filter(r => !r.customer_name || r.customer_name === 'Cliente desconocido').length,
      db_rows_checked: dbSample?.length,
    },
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report, null, 2),
  }
}
