// Shared period window calculations.
// period: 'today' | 'yesterday' | '7' | '14' | '30' | '90'

function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

/**
 * Returns all window boundaries for the given period:
 *   windowStart / windowEnd     — current period (ISO Date objects)
 *   compareStart / compareEnd   — comparison period (same-week-day for single-day, prev period otherwise)
 *   numDays                     — length of the current window in days
 *   chartEndDate                — the "last day" of the current window (for chart generation)
 *   isSingleDay                 — true for 'today' / 'yesterday'
 */
export function buildPeriodWindows(period) {
  const now = new Date()

  if (period === 'today') {
    const dayStart     = startOfDay(now)
    const compareStart = addDays(dayStart, -7)  // same weekday last week
    return {
      windowStart:  dayStart,
      windowEnd:    now,
      compareStart,
      compareEnd:   dayStart,        // exclusive end = start of today
      numDays:      1,
      chartEndDate: now,
      isSingleDay:  true,
    }
  }

  if (period === 'yesterday') {
    const todayStart   = startOfDay(now)
    const ystStart     = addDays(todayStart, -1)
    const compareStart = addDays(ystStart, -7)   // same weekday last week
    const compareEnd   = addDays(todayStart, -7) // exclusive end
    return {
      windowStart:  ystStart,
      windowEnd:    todayStart,
      compareStart,
      compareEnd,
      numDays:      1,
      chartEndDate: ystStart,
      isSingleDay:  true,
    }
  }

  // Regular numeric periods (7, 14, 30, 90)
  const days         = Number(period)
  const windowStart  = addDays(now, -days)
  const compareStart = addDays(now, -days * 2)
  return {
    windowStart,
    windowEnd:    now,
    compareStart,
    compareEnd:   windowStart,  // exclusive end = start of current window
    numDays:      days,
    chartEndDate: now,
    isSingleDay:  false,
  }
}
