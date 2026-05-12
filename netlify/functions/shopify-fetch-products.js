import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const API = '2025-07'

export const handler = async (event) => {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  // ── Supabase client ───────────────────────────────────────────────────────
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Supabase no configurado' }) }
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { realtime: { transport: ws } })

  // ── Auth ──────────────────────────────────────────────────────────────────
  const token = event.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'No autorizado' }) }
  }
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) {
    return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Sesión inválida' }) }
  }

  // ── Get active Shopify connection ─────────────────────────────────────────
  const { data: conn, error: connErr } = await supabase
    .from('shopify_connections')
    .select('shop_domain, access_token')
    .eq('user_id', user.id)
    .eq('is_active', true)
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

  // ── Fetch products from Shopify ───────────────────────────────────────────
  try {
    const res = await fetch(
      `https://${shopDomain}/admin/api/${API}/products.json?limit=250&fields=id,title,image,variants`,
      { headers: { 'X-Shopify-Access-Token': accessToken } }
    )

    if (!res.ok) {
      const errText = await res.text()
      console.error('[fetch-products] Shopify error', res.status, errText.slice(0, 200))
      if (res.status === 401 || res.status === 403) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: `Sin permiso para leer productos (Shopify ${res.status}). Añade el scope "read_products" en tu app.` }),
        }
      }
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Error de Shopify (${res.status})` }),
      }
    }

    const { products } = await res.json()

    const mapped = (products || []).map((p) => ({
      id:       String(p.id),
      title:    p.title,
      image:    p.image?.src || null,
      variants: (p.variants || []).map((v) => ({
        id:    String(v.id),
        title: v.title,
        price: parseFloat(v.price) || 0,
      })),
    }))

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ products: mapped }),
    }
  } catch (err) {
    console.error('[fetch-products] excepción:', err.message)
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `Error interno: ${err.message}` }),
    }
  }
}
