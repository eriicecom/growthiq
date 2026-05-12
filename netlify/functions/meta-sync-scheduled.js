import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const GRAPH = 'https://graph.facebook.com/v19.0'

async function syncOneUser(supabase, userId, adAccountId, accessToken) {
  const allRows = []
  let nextUrl =
    `${GRAPH}/${adAccountId}/insights` +
    `?fields=spend,impressions,clicks&time_increment=1&date_preset=last_30d` +
    `&access_token=${encodeURIComponent(accessToken)}`

  while (nextUrl) {
    const res  = await fetch(nextUrl)
    const data = await res.json()
    if (!res.ok || data.error) throw new Error(data.error?.message || `Meta API ${res.status}`)
    if (data.data?.length) allRows.push(...data.data)
    nextUrl = data.paging?.next || null
  }

  if (allRows.length === 0) {
    await supabase
      .from('meta_connections')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('user_id', userId)
    return 0
  }

  const upsertRows = allRows.map((row) => ({
    user_id:     userId,
    date:        row.date_start,
    spend:       parseFloat(row.spend) || 0,
    impressions: parseInt(row.impressions, 10) || 0,
    clicks:      parseInt(row.clicks, 10) || 0,
    updated_at:  new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('meta_ad_spend')
    .upsert(upsertRows, { onConflict: 'user_id,date' })
  if (error) throw new Error(error.message)

  await supabase
    .from('meta_connections')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('user_id', userId)

  return allRows.length
}

export const handler = async () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  // Scheduled functions run server-side and need the service role key to bypass RLS
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error('[meta-sync-scheduled] SUPABASE_SERVICE_ROLE_KEY is required for scheduled sync')
    return { statusCode: 500 }
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { realtime: { transport: ws } })

  const { data: connections, error } = await supabase
    .from('meta_connections')
    .select('user_id, ad_account_id, access_token')
    .eq('is_active', true)

  if (error) {
    console.error('[meta-sync-scheduled] Failed to fetch connections:', error.message)
    return { statusCode: 500 }
  }

  if (!connections?.length) {
    console.log('[meta-sync-scheduled] No active Meta connections — nothing to sync')
    return { statusCode: 200 }
  }

  console.log(`[meta-sync-scheduled] Syncing ${connections.length} user(s)`)

  let ok = 0, fail = 0
  for (const conn of connections) {
    try {
      const days = await syncOneUser(supabase, conn.user_id, conn.ad_account_id, conn.access_token)
      console.log(`[meta-sync-scheduled] OK  user=${conn.user_id} days=${days}`)
      ok++
    } catch (err) {
      console.error(`[meta-sync-scheduled] ERR user=${conn.user_id} :`, err.message)
      fail++
    }
  }

  console.log(`[meta-sync-scheduled] Finished — ${ok} ok, ${fail} failed`)
  return { statusCode: 200 }
}
