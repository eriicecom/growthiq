import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const API      = '2025-07'
const TOPICS   = ['orders/create', 'orders/updated', 'orders/paid', 'fulfillments/create']

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

  // ── Auth: extract user from JWT ───────────────────────────────────────────
  const token = event.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'No autorizado' }) }
  }
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) {
    return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Sesión inválida. Vuelve a iniciar sesión.' }) }
  }

  // ── Read user's active Shopify connection ─────────────────────────────────
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
      body: JSON.stringify({ error: 'No hay ninguna tienda Shopify conectada.' }),
    }
  }

  const { shop_domain: shopDomain, access_token } = conn
  const accessToken = access_token.trim()

  // ── Webhook address (must be a publicly reachable URL) ────────────────────
  const siteUrl = process.env.URL || process.env.DEPLOY_URL
  if (!siteUrl) {
    // In local dev there is no public URL — skip silently
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, message: 'URL del sitio no disponible (entorno local).' }),
    }
  }

  const webhookAddress = `${siteUrl}/.netlify/functions/shopify-webhook`

  // ── Register each topic ───────────────────────────────────────────────────
  const results = { registered: [], already_existed: [], failed: [] }

  for (const topic of TOPICS) {
    try {
      const res = await fetch(`https://${shopDomain}/admin/api/${API}/webhooks.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ webhook: { topic, address: webhookAddress, format: 'json' } }),
      })

      if (res.status === 201) {
        results.registered.push(topic)
        console.log(`[register-webhooks] registrado: ${topic}`)
      } else if (res.status === 422) {
        // Already exists — idempotent, not an error
        results.already_existed.push(topic)
        console.log(`[register-webhooks] ya existía: ${topic}`)
      } else {
        const body = await res.text()
        console.error(`[register-webhooks] error ${res.status} para ${topic}:`, body.slice(0, 200))
        results.failed.push({ topic, status: res.status })
      }
    } catch (err) {
      console.error(`[register-webhooks] excepción para ${topic}:`, err.message)
      results.failed.push({ topic, error: err.message })
    }
  }

  const ok = results.failed.length === 0
  const total = results.registered.length + results.already_existed.length

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok, total, ...results }),
  }
}
