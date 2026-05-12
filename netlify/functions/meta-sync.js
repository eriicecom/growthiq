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

  // Read Meta connection
  const { data: conn, error: connErr } = await supabase
    .from('meta_connections')
    .select('access_token, ad_account_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (connErr || !conn) {
    return json(404, { error: 'No hay ninguna cuenta de Meta Ads conectada. Ve a Configuración → Meta Ads.' })
  }

  const { access_token, ad_account_id } = conn

  // Fetch insights from Meta Marketing API (last 30 days, one row per day)
  const allRows = []
  let nextUrl = `${GRAPH}/${ad_account_id}/insights?fields=spend,impressions,clicks&time_increment=1&date_preset=last_30d&access_token=${encodeURIComponent(access_token)}`

  try {
    while (nextUrl) {
      const res = await fetch(nextUrl)
      const data = await res.json()

      if (!res.ok || data.error) {
        const msg = data.error?.message || `Meta API error (${res.status})`
        console.error('[meta-sync] API error:', msg)
        return json(400, { error: msg })
      }

      if (data.data?.length) allRows.push(...data.data)
      nextUrl = data.paging?.next || null
    }
  } catch (err) {
    console.error('[meta-sync] fetch error:', err.message)
    return json(502, { error: `Error al contactar con Meta: ${err.message}` })
  }

  if (allRows.length === 0) {
    await supabase
      .from('meta_connections')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('user_id', user.id)
    return json(200, { synced: 0 })
  }

  // Upsert rows into meta_ad_spend
  const upsertRows = allRows.map((row) => ({
    user_id:     user.id,
    date:        row.date_start,
    spend:       parseFloat(row.spend) || 0,
    impressions: parseInt(row.impressions, 10) || 0,
    clicks:      parseInt(row.clicks, 10) || 0,
    updated_at:  new Date().toISOString(),
  }))

  const { error: upsertErr } = await supabase
    .from('meta_ad_spend')
    .upsert(upsertRows, { onConflict: 'user_id,date' })

  if (upsertErr) {
    console.error('[meta-sync] upsert error:', upsertErr.message)
    return json(500, { error: `Error guardando datos: ${upsertErr.message}` })
  }

  // Update last_synced_at
  await supabase
    .from('meta_connections')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('user_id', user.id)

  return json(200, { synced: allRows.length })
}
