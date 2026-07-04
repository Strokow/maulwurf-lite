import { describe, it, expect } from 'vitest'
import type { Income } from '../types'
import {
  incomeMonthKey,
  incomesForMonth,
  sumIncomes,
  defaultIncomeDate,
  formatIncomeDate,
} from '../utils/incomeEngine'

const inc = (date: string, amount: number, label = '', createdAt = '2026-01-01T00:00:00Z'): Income => ({
  id: `${date}-${amount}`,
  date,
  amount,
  label,
  createdAt,
})

describe('incomeMonthKey', () => {
  it('pads the month to two digits', () => {
    expect(incomeMonthKey(2026, 7)).toBe('2026-07')
    expect(incomeMonthKey(2026, 12)).toBe('2026-12')
  })
})

describe('incomesForMonth', () => {
  const all = [
    inc('2026-07-15', 100),
    inc('2026-07-01', 50),
    inc('2026-06-30', 999),
    inc('2026-12-01', 10),
    inc('2025-07-10', 777), // same month, different year
  ]

  it('keeps only entries of the given month and year', () => {
    const july = incomesForMonth(all, 2026, 7)
    expect(july.map((i) => i.amount)).toEqual([50, 100])
  })

  it('does not confuse July (07) with December (12) or other years', () => {
    expect(incomesForMonth(all, 2026, 12).map((i) => i.amount)).toEqual([10])
    expect(incomesForMonth(all, 2025, 7).map((i) => i.amount)).toEqual([777])
  })

  it('sorts by date, then by creation time', () => {
    const sameDay = [
      inc('2026-07-05', 2, 'later', '2026-07-05T12:00:00Z'),
      inc('2026-07-05', 1, 'earlier', '2026-07-05T08:00:00Z'),
    ]
    expect(incomesForMonth(sameDay, 2026, 7).map((i) => i.label)).toEqual(['earlier', 'later'])
  })

  it('returns an empty list for a month without entries', () => {
    expect(incomesForMonth(all, 2027, 1)).toEqual([])
  })
})

describe('sumIncomes', () => {
  it('adds all amounts', () => {
    expect(sumIncomes([inc('2026-07-01', 1200), inc('2026-07-02', 34.5)])).toBeCloseTo(1234.5)
  })

  it('is 0 for an empty month', () => {
    expect(sumIncomes([])).toBe(0)
  })
})

describe('defaultIncomeDate', () => {
  it('uses today when the viewed month is the current one', () => {
    const today = new Date(2026, 6, 4) // 2026-07-04
    expect(defaultIncomeDate(2026, 7, today)).toBe('2026-07-04')
  })

  it('falls back to the 1st for another month', () => {
    const today = new Date(2026, 6, 4)
    expect(defaultIncomeDate(2026, 3, today)).toBe('2026-03-01')
    expect(defaultIncomeDate(2025, 7, today)).toBe('2025-07-01')
  })
})

describe('formatIncomeDate', () => {
  it('renders the stored date in the given locale without timezone shifts', () => {
    expect(formatIncomeDate('2026-07-04', 'de-DE')).toBe('04.07.2026')
    expect(formatIncomeDate('2026-07-04', 'en-US')).toBe('07/04/2026')
  })

  it('returns malformed input unchanged', () => {
    expect(formatIncomeDate('oops', 'en-US')).toBe('oops')
  })
})
