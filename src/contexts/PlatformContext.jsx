import { createContext, useContext, useState } from 'react'

export const PLATFORMS = [
  { value: 'all',       label: 'Todas'     },
  { value: 'shopify',   label: 'Shopify'   },
  { value: 'wordpress', label: 'WordPress' },
]

const PlatformCtx = createContext({ platform: 'all', setPlatform: () => {} })

export function PlatformProvider({ children }) {
  const [platform, setPlatformState] = useState(
    () => localStorage.getItem('growthiq-platform') || 'all'
  )

  const setPlatform = (p) => {
    setPlatformState(p)
    localStorage.setItem('growthiq-platform', p)
  }

  return <PlatformCtx.Provider value={{ platform, setPlatform }}>{children}</PlatformCtx.Provider>
}

export const usePlatform = () => useContext(PlatformCtx)
