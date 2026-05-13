import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

const DEFAULTS = { storeName: '', currency: 'USD', timezone: 'Europe/Madrid' }
const LS_CURRENCY_KEY = 'growthiq-currency'

const Ctx = createContext({ ...DEFAULTS, refreshSettings: async () => {}, setCurrency: async () => {} })

export function StoreSettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS)
  const settingsRef = useRef(DEFAULTS)

  function applySettings(next) {
    settingsRef.current = next
    setSettings(next)
    // Keep useCurrency hook's localStorage in sync
    localStorage.setItem(LS_CURRENCY_KEY, next.currency)
  }

  const loadSettings = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data } = await supabase
      .from('store_settings')
      .select('store_name, currency, timezone')
      .eq('user_id', session.user.id)
      .maybeSingle()
    if (data) {
      applySettings({
        storeName: data.store_name || '',
        currency:  data.currency   || 'USD',
        timezone:  data.timezone   || 'Europe/Madrid',
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist only currency, preserving other fields — used from Dashboard selector
  const setCurrency = useCallback(async (code) => {
    const next = { ...settingsRef.current, currency: code }
    applySettings(next)
    if (!isSupabaseConfigured || !supabase) return
    const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: {} }))
    if (!user?.id) return
    await supabase.from('store_settings').upsert({
      user_id:    user.id,
      store_name: next.storeName,
      currency:   next.currency,
      timezone:   next.timezone,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
  }, []) // settingsRef is a ref so no dependency needed

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return
    loadSettings()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN')  loadSettings()
      if (event === 'SIGNED_OUT') applySettings(DEFAULTS)
    })
    return () => subscription.unsubscribe()
  }, [loadSettings])

  return (
    <Ctx.Provider value={{ ...settings, refreshSettings: loadSettings, setCurrency }}>
      {children}
    </Ctx.Provider>
  )
}

export const useStoreSettings = () => useContext(Ctx)
