import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

function makeSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  return url && key ? createClient(url, key, { realtime: { transport: ws } }) : null
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  // ── Auth check ────────────────────────────────────────────────────────────
  const supabase = makeSupabase()
  if (!supabase) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase no configurado' }) }
  }

  const token = event.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: 'No autorizado' }) }
  }
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Sesión inválida. Vuelve a iniciar sesión.' }) }
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let shopDomain, accessToken
  try {
    ;({ shopDomain, accessToken } = JSON.parse(event.body))
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Cuerpo de solicitud inválido' }) }
  }

  if (!shopDomain || !accessToken) {
    return { statusCode: 400, body: JSON.stringify({ error: 'shopDomain y accessToken son obligatorios' }) }
  }

  const domain = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase()
  console.log('[validate] user:', user.id, '| domain:', domain)

  try {
    const res = await fetch(`https://${domain}/admin/api/2025-07/shop.json`, {
      headers: { 'X-Shopify-Access-Token': accessToken },
    })

    console.log('[validate] Shopify status:', res.status)

    if (res.status === 401 || res.status === 403) {
      console.log('[validate] error body:', await res.text())
      return { statusCode: 400, body: JSON.stringify({ error: 'Token de acceso inválido o permisos insuficientes' }) }
    }

    if (!res.ok) {
      console.log('[validate] error body:', await res.text())
      return { statusCode: 400, body: JSON.stringify({ error: `No se pudo conectar con la tienda (${res.status})` }) }
    }

    const { shop } = await res.json()
    console.log('[validate] OK —', shop.name, shop.domain)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        valid: true,
        shop: { name: shop.name, email: shop.email, currency: shop.currency, domain: shop.domain },
      }),
    }
  } catch (err) {
    console.error('[validate] excepción:', err.message)
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'No se pudo alcanzar la tienda. Verifica el dominio.' }),
    }
  }
}
