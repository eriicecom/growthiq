import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const API = '2025-07'

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) return json(500, { error: 'Variables de entorno de Supabase no configuradas.' })

  const supabase = createClient(supabaseUrl, supabaseKey, { realtime: { transport: ws } })

  const token = event.headers.authorization?.replace('Bearer ', '')
  if (!token) return json(401, { error: 'No autorizado' })

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return json(401, { error: 'Sesión inválida.' })

  const { data: conn, error: connErr } = await supabase
    .from('shopify_connections')
    .select('shop_domain, access_token')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  if (connErr || !conn) return json(404, { error: 'No hay ninguna tienda Shopify conectada.' })

  const { shop_domain: shopDomain, access_token } = conn
  const accessToken = access_token.trim()

  const res = await fetch(
    `https://${shopDomain}/admin/api/${API}/webhooks.json?limit=250`,
    { headers: { 'X-Shopify-Access-Token': accessToken } }
  )

  if (!res.ok) {
    const text = await res.text()
    console.error('[list-webhooks] Shopify error:', res.status, text.slice(0, 200))
    return json(502, { error: `Shopify devolvió ${res.status}` })
  }

  const { webhooks } = await res.json()
  console.log(`[list-webhooks] shop: ${shopDomain} | total: ${webhooks.length}`)
  return json(200, { shop: shopDomain, total: webhooks.length, webhooks })
}
