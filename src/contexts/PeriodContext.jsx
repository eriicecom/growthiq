import { createContext, useContext, useState } from 'react'

export const PERIODS = [
  { value: 'today',     label: 'Hoy'            },
  { value: 'yesterday', label: 'Ayer'           },
  { value: '7',         label: 'Últimos 7 días'  },
  { value: '14',        label: 'Últimos 14 días' },
  { value: '30',        label: 'Últimos 30 días' },
  { value: '90',        label: 'Últimos 90 días' },
]

// Returns the display label for a stored period value.
export function periodLabel(value) {
  return PERIODS.find(p => p.value === String(value))?.label ?? `${value} días`
}

const PeriodCtx = createContext({ days: '30', setDays: () => {} })

export function PeriodProvider({ children }) {
  // days is now always a string: 'today' | 'yesterday' | '7' | '14' | '30' | '90'
  // Existing localStorage values ('7', '14', '30', '90') are already strings — no migration needed.
  const [days, setDaysState] = useState(
    () => localStorage.getItem('growthiq-period') || '30'
  )

  const setDays = (d) => {
    setDaysState(String(d))
    localStorage.setItem('growthiq-period', String(d))
  }

  return <PeriodCtx.Provider value={{ days, setDays }}>{children}</PeriodCtx.Provider>
}

export const usePeriod = () => useContext(PeriodCtx)
