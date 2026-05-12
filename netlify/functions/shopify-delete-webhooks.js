import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const API    = '2025-07'
const TOPICS = ['orders/create', 'orders/updated', 'orders/paid', 'fulfillments/create']

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

export const handler = async (event) => {
  // Accept both DELETE and POST (some clients/browsers block DELETE)
  if (event.httpMethod !== 'DELETE' && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

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

  // ── 1. List all current webhooks ─────────────────────────────────────────
  const listRes = await fetch(
    `https://${shopDomain}/admin/api/${API}/webhooks.json?limit=250`,
    { headers: { 'X-Shopify-Access-Token': accessToken } }
  )

  if (!listRes.ok) {
    const text = await listRes.text()
    console.error('[delete-webhooks] list error:', listRes.status, text.slice(0, 200))
    return json(502, { error: `Error al listar webhooks de Shopify (${listRes.status})` })
  }

  const { webhooks } = await listRes.json()
  console.log(`[delete-webhooks] shop: ${shopDomain} | encontrados: ${webhooks.length}`)

  // ── 2. Delete every existing webhook ────────────────────────────────────
  const deleted      = []
  const deleteErrors = []

  for (const wh of webhooks) {
    const delRes = await fetch(
      `https://${shopDomain}/admin/api/${API}/webhooks/${wh.id}.json`,
      { method: 'DELETE', headers: { 'X-Shopify-Access-Token': accessToken } }
    )

    // Shopify returns 200 (with empty body) on successful delete
    if (delRes.ok) {
      deleted.push({ id: wh.id, topic: wh.topic, address: wh.address })
      console.log(`[delete-webhooks] eliminado: ${wh.topic} id=${wh.id}`)
    } else {
      deleteErrors.push({ id: wh.id, topic: wh.topic, status: delRes.status })
      console.error(`[delete-webhooks] error eliminando ${wh.id}: ${delRes.status}`)
    }
  }

  // ── 3. Re-register the correct webhooks ──────────────────────────────────
  const siteUrl = process.env.URL || process.env.DEPLOY_URL
  const registered      = []
  const registerErrors  = []

  if (!siteUrl) {
    console.warn('[delete-webhooks] URL del sitio no disponible — no se registrarán webhooks')
  } else {
    const webhookAddress = `${siteUrl}/.netlify/functions/shopify-webhook`

    for (const topic of TOPICS) {
      try {
        const regRes = await fetch(`https://${shopDomain}/admin/api/${API}/webhooks.json`, {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ webhook: { topic, address: webhookAddress, format: 'json' } }),
        })

        if (regRes.status === 201) {
          registered.push(topic)
          console.log(`[delete-webhooks] registrado: ${topic} → ${webhookAddress}`)
        } else {
          const errText = await regRes.text()
          registerErrors.push({ topic, status: regRes.status })
          console.error(`[delete-webhooks] error registrando ${topic}:`, errText.slice(0, 200))
        }
      } catch (err) {
        registerErrors.push({ topic, error: err.message })
        console.error(`[delete-webhooks] excepción registrando ${topic}:`, err.message)
      }
    }
  }

  const ok = deleteErrors.length === 0 && registerErrors.length === 0

  return json(200, {
    ok,
    shop:              shopDomain,
    deleted_count:     deleted.length,
    registered_count:  registered.length,
    deleted,
    registered,
    errors: {
      delete:   deleteErrors,
      register: registerErrors,
    },
    no_site_url: !siteUrl,
  })
}
