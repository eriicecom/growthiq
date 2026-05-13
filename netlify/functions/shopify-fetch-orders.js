import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const API = '2025-07'

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

  // ── Supabase client ───────────────────────────────────────────────────────
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Variables de entorno de Supabase no configuradas.' }),
    }
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { realtime: { transport: ws } })

  // ── Auth check ────────────────────────────────────────────────────────────
  const token = event.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'No autorizado' }) }
  }
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) {
    return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Sesión inválida. Vuelve a iniciar sesión.' }) }
  }

  // ── Find active connection for this user ──────────────────────────────────
  const { data: conn, error: connErr } = await supabase
    .from('shopify_connections')
    .select('shop_domain, access_token')
    .eq('is_active', true)
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  if (connErr || !conn) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'No hay ninguna tienda Shopify conectada. Ve a Configuración → Shopify.' }),
    }
  }

  const { shop_domain: shopDomain, access_token } = conn
  const accessToken = access_token.trim()
  const startTime   = Date.now()

  try {
    let allOrders = []
    let nextUrl   = `https://${shopDomain}/admin/api/${API}/orders.json?status=any&limit=250`

    while (nextUrl) {
      if (Date.now() - startTime > 8500) break

      const res = await fetch(nextUrl, { headers: { 'X-Shopify-Access-Token': accessToken } })

      if (!res.ok) {
        const errText = await res.text()
        console.error('[fetch-orders] Shopify error', res.status, errText.slice(0, 200))

        if (res.status === 401 || res.status === 403) {
          return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: `Sin permiso para leer pedidos (Shopify ${res.status}). Añade el scope "read_orders" en tu app de Shopify.` }),
          }
        }

        return {
          statusCode: 502,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: `Error de Shopify (${res.status})` }),
        }
      }

      const { orders } = await res.json()

      if (orders?.length) {
        allOrders = allOrders.concat(orders)

        const { error: upsertErr } = await supabase
          .from('shopify_orders')
          .upsert(orders.map(o => mapOrder(o, user.id)), { onConflict: 'user_id,shopify_id' })

        if (upsertErr) {
          return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: `Error guardando pedidos: ${upsertErr.message}` }),
          }
        }
      }

      const link  = res.headers.get('link') || ''
      const match = link.match(/<([^>]+)>; rel="next"/)
      nextUrl = match ? match[1] : null
    }

    await supabase
      .from('shopify_connections')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('shop_domain', shopDomain)
      .eq('user_id', user.id)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ synced: allOrders.length, shop: shopDomain }),
    }
  } catch (err) {
    console.error('[fetch-orders] excepción:', err.message)
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `Error interno: ${err.message}` }),
    }
  }
}
