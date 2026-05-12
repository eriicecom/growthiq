import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const GRAPH = 'https://graph.facebook.com/v19.0'

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) return json(500, { error: 'Variables de entorno de Supabase no configuradas.' })

  const supabase = createClient(supabaseUrl, supabaseKey, { realtime: { transport: ws } })

  // Auth
  const token = event.headers.authorization?.replace('Bearer ', '')
  if (!token) return json(401, { error: 'No autorizado' })
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return json(401, { error: 'Sesión inválida. Vuelve a iniciar sesión.' })

  let body = {}
  try { body = JSON.parse(event.body || '{}') } catch { return json(400, { error: 'Body inválido' }) }

  const { access_token, ad_account_id } = body
  if (!access_token || !ad_account_id) return json(400, { error: 'Se requieren access_token y ad_account_id' })

  // Normalize ad_account_id — Meta requires act_ prefix
  const accountId = ad_account_id.startsWith('act_') ? ad_account_id : `act_${ad_account_id}`

  // Validate token against Meta Graph API
  let accountName = ''
  let currency = 'USD'
  try {
    const res = await fetch(
      `${GRAPH}/${accountId}?fields=name,currency&access_token=${encodeURIComponent(access_token)}`
    )
    const data = await res.json()
    if (!res.ok || data.error) {
      const msg = data.error?.message || 'Token inválido o Ad Account incorrecto'
      return json(400, { error: msg })
    }
    accountName = data.name || accountId
    currency    = data.currency || 'USD'
  } catch (err) {
    console.error('[meta-connect] Graph API error:', err.message)
    return json(502, { error: 'No se pudo contactar con la API de Meta. Inténtalo de nuevo.' })
  }

  // Save / update connection
  const { error: dbErr } = await supabase
    .from('meta_connections')
    .upsert(
      {
        user_id:      user.id,
        access_token,
        ad_account_id: accountId,
        account_name:  accountName,
        currency,
        is_active:    true,
        updated_at:   new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )

  if (dbErr) {
    console.error('[meta-connect] DB error:', dbErr.message)
    return json(500, { error: `Error al guardar la conexión: ${dbErr.message}` })
  }

  return json(200, { success: true, account_name: accountName, currency })
}
