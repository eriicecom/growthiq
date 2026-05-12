import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

// undefined = loading | null = no session | object = active session
const AuthCtx = createContext(undefined)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    if (!supabase) {
      setSession(null)
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  return <AuthCtx.Provider value={session}>{children}</AuthCtx.Provider>
}

export const useSession = () => useContext(AuthCtx)
