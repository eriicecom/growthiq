/**
 * One-shot migration function. Call it once (authenticated) to add missing
 * columns to shopify_orders. Safe to call multiple times (IF NOT EXISTS).
 *
 * Usage:
 *   curl -X POST https://YOUR_SITE/.netlify/functions/apply-migration \
 *     -H "Authorization: Bearer YOUR_SUPABASE_JWT"
 *
 * After running, delete or disable this function.
 */
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const SQL = `
ALTER TABLE shopify_orders ADD COLUMN IF NOT EXISTS customer_name  TEXT;
ALTER TABLE shopify_orders ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE shopify_orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
`

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars' }) }
  }

  // Verify the caller is a logged-in user (basic auth check)
  const token = event.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  const supabase = createClient(supabaseUrl, serviceKey, { realtime: { transport: ws } })
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid session' }) }
  }

  // Try supabase.sql (available in @supabase/supabase-js v2+)
  try {
    if (typeof supabase.sql === 'function') {
      for (const stmt of SQL.trim().split('\n').filter(l => l.trim())) {
        const { error } = await supabase.sql([stmt])
        if (error) throw error
      }
      return { statusCode: 200, body: JSON.stringify({ ok: true, method: 'supabase.sql' }) }
    }
  } catch (sqlErr) {
    console.error('[apply-migration] supabase.sql error:', sqlErr.message)
    // Fall through to manual instructions
  }

  // supabase.sql not available — return the SQL for manual execution
  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: false,
      message: 'Run this SQL manually in the Supabase SQL Editor (Dashboard → SQL Editor):',
      sql: SQL.trim(),
    }),
  }
}
