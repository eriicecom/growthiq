import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

const DEFAULTS = { storeName: '', currency: 'USD', timezone: 'Europe/Madrid' }

const Ctx = createContext({ ...DEFAULTS, refreshSettings: async () => {} })

export function StoreSettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS)

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
      setSettings({
        storeName: data.store_name || '',
        currency:  data.currency   || 'USD',
        timezone:  data.timezone   || 'Europe/Madrid',
      })
    }
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return
    loadSettings()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN')  loadSettings()
      if (event === 'SIGNED_OUT') setSettings(DEFAULTS)
    })
    return () => subscription.unsubscribe()
  }, [loadSettings])

  return (
    <Ctx.Provider value={{ ...settings, refreshSettings: loadSettings }}>
      {children}
    </Ctx.Provider>
  )
}

export const useStoreSettings = () => useContext(Ctx)
