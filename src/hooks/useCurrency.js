import { useState } from 'react'

// Exchange rates relative to USD (approximate, static)
export const CURRENCIES = [
  { code: 'USD', symbol: '$',    label: '$ USD',    rate: 1     },
  { code: 'EUR', symbol: '€',    label: '€ EUR',    rate: 0.92  },
  { code: 'GBP', symbol: '£',    label: '£ GBP',    rate: 0.79  },
  { code: 'MXN', symbol: 'MX$',  label: 'MX$ MXN',  rate: 17.2  },
  { code: 'BRL', symbol: 'R$',   label: 'R$ BRL',   rate: 5.0   },
  { code: 'ARS', symbol: '$',    label: '$ ARS',    rate: 900   },
  { code: 'COP', symbol: 'COP$', label: 'COP$ COP', rate: 3900  },
]

const STORAGE_KEY = 'growthiq-currency'

export function useCurrency() {
  const [currency, setCurrencyState] = useState(
    () => localStorage.getItem(STORAGE_KEY) || 'USD'
  )

  const setCurrency = (code) => {
    setCurrencyState(code)
    localStorage.setItem(STORAGE_KEY, code)
  }

  const cur = CURRENCIES.find((c) => c.code === currency) ?? CURRENCIES[0]

  // Multiply a stored value by the selected rate
  const convert = (value) => Math.round(value * cur.rate * 100) / 100

  return { currency, setCurrency, symbol: cur.symbol, rate: cur.rate, convert }
}
