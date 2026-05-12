import { createContext, useContext, useState } from 'react'

export const PERIODS = [
  { value: 7,  label: 'Últimos 7 días'  },
  { value: 14, label: 'Últimos 14 días' },
  { value: 30, label: 'Últimos 30 días' },
  { value: 90, label: 'Últimos 90 días' },
]

const PeriodCtx = createContext({ days: 30, setDays: () => {} })

export function PeriodProvider({ children }) {
  const [days, setDaysState] = useState(
    () => parseInt(localStorage.getItem('growthiq-period') || '30')
  )

  const setDays = (d) => {
    setDaysState(d)
    localStorage.setItem('growthiq-period', String(d))
  }

  return <PeriodCtx.Provider value={{ days, setDays }}>{children}</PeriodCtx.Provider>
}

export const usePeriod = () => useContext(PeriodCtx)
