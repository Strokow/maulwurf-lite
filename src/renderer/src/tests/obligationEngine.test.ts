import { describe, it, expect } from 'vitest'
import {
  clampDayToMonth,
  formatLocalDate,
  effectiveAmount,
  defaultStatus,
  getEffectiveStatus,
  isNativeActive,
  paidInstallmentCount,
  isInstallmentCompleted,
  coverageMonths,
  paidUntil,
} from '../utils/obligationEngine'
import type { Obligation, ObligationMonth } from '../types'

function makeObligation(overrides: Partial<Obligation> = {}): Obligation {
  return {
    id: 'o1',
    name: 'Test',
    type: 'subscription',
    amount: 10,
    approximateDay: null,
    bankId: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    frequency: 'monthly',
    ...overrides,
  }
}

function makeMonth(overrides: Partial<ObligationMonth> = {}): ObligationMonth {
  return {
    obligationId: 'o1',
    year: 2026,
    month: 1,
    status: 'paid',
    actualAmount: null,
    ...overrides,
  }
}

describe('clampDayToMonth', () => {
  it('keeps a valid day', () => {
    expect(clampDayToMonth(2026, 0, 15)).toBe(15)
  })
  it('clamps day 31 in February to the last day', () => {
    expect(clampDayToMonth(2026, 1, 31)).toBe(28)
  })
  it('handles leap years', () => {
    expect(clampDayToMonth(2028, 1, 31)).toBe(29)
  })
})

describe('formatLocalDate', () => {
  it('formats without UTC shift', () => {
    expect(formatLocalDate(new Date(2026, 3, 1))).toBe('2026-04-01')
  })
})

describe('effectiveAmount', () => {
  it('returns base amount without changes', () => {
    expect(effectiveAmount({ amount: 9.99 }, 2026, 5)).toBe(9.99)
  })
  it('returns null when amount is null and no changes', () => {
    expect(effectiveAmount({ amount: null }, 2026, 5)).toBeNull()
  })
  it('applies the change from its effective month onward', () => {
    const o = { amount: 10, amountChanges: [{ from: '2026-06', amount: 12 }] }
    expect(effectiveAmount(o, 2026, 5)).toBe(10)
    expect(effectiveAmount(o, 2026, 6)).toBe(12)
    expect(effectiveAmount(o, 2027, 1)).toBe(12)
  })
  it('applies the latest applicable change when several exist', () => {
    const o = {
      amount: 10,
      amountChanges: [
        { from: '2026-09', amount: 14 },
        { from: '2026-06', amount: 12 },
      ],
    }
    expect(effectiveAmount(o, 2026, 7)).toBe(12)
    expect(effectiveAmount(o, 2026, 9)).toBe(14)
  })
})

describe('defaultStatus / getEffectiveStatus', () => {
  it('yearly and quarterly default to unknown', () => {
    expect(defaultStatus({ frequency: 'yearly' })).toBe('unknown')
    expect(defaultStatus({ frequency: 'quarterly' })).toBe('unknown')
  })
  it('monthly and once default to unpaid', () => {
    expect(defaultStatus({ frequency: 'monthly' })).toBe('unpaid')
    expect(defaultStatus({ frequency: 'once' })).toBe('unpaid')
    expect(defaultStatus({})).toBe('unpaid')
  })
  it('a record always wins over the default', () => {
    const o = makeObligation({ frequency: 'yearly' })
    expect(getEffectiveStatus(o, makeMonth({ status: 'paid' }))).toBe('paid')
    expect(getEffectiveStatus(o, null)).toBe('unknown')
  })
})

describe('isNativeActive', () => {
  it('inactive obligations are never native', () => {
    expect(isNativeActive(makeObligation({ isActive: false }), 2026, 5)).toBe(false)
  })
  it('months before creation are not native', () => {
    const o = makeObligation({ createdAt: '2026-03-01T00:00:00.000Z' })
    expect(isNativeActive(o, 2026, 2)).toBe(false)
    expect(isNativeActive(o, 2026, 3)).toBe(true)
    expect(isNativeActive(o, 2026, 4)).toBe(true)
  })
  it('once is native only in its creation month', () => {
    const o = makeObligation({ frequency: 'once', createdAt: '2026-03-01T00:00:00.000Z' })
    expect(isNativeActive(o, 2026, 3)).toBe(true)
    expect(isNativeActive(o, 2026, 4)).toBe(false)
    expect(isNativeActive(o, 2026, 2)).toBe(false)
  })
})

describe('period coverage (yearly / quarterly)', () => {
  it('coverage windows', () => {
    expect(coverageMonths('yearly')).toBe(12)
    expect(coverageMonths('quarterly')).toBe(3)
  })
  it('yearly paid in Mar 2026 covers until Feb 2027', () => {
    expect(paidUntil('yearly', 2026, 3)).toEqual({ untilYear: 2027, untilMonth: 2 })
  })
  it('yearly paid in Jan covers until Dec of the same year', () => {
    expect(paidUntil('yearly', 2026, 1)).toEqual({ untilYear: 2026, untilMonth: 12 })
  })
  it('quarterly paid in Feb 2026 covers Feb–Apr 2026', () => {
    expect(paidUntil('quarterly', 2026, 2)).toEqual({ untilYear: 2026, untilMonth: 4 })
  })
  it('quarterly paid in Nov 2026 rolls over the year boundary (until Jan 2027)', () => {
    expect(paidUntil('quarterly', 2026, 11)).toEqual({ untilYear: 2027, untilMonth: 1 })
  })
  it('quarterly paid in Dec 2026 covers until Feb 2027', () => {
    expect(paidUntil('quarterly', 2026, 12)).toEqual({ untilYear: 2027, untilMonth: 2 })
  })
})

describe('installments', () => {
  const plan = makeObligation({ isInstallment: true, totalInstallments: 3 })
  it('counts paid month records', () => {
    const months = [
      makeMonth({ month: 1, status: 'paid' }),
      makeMonth({ month: 2, status: 'paid' }),
      makeMonth({ month: 3, status: 'unpaid' }),
      makeMonth({ obligationId: 'other', month: 4, status: 'paid' }),
    ]
    expect(paidInstallmentCount(plan, months)).toBe(2)
  })
  it('completed when paid >= totalInstallments', () => {
    const months = [1, 2, 3].map((m) => makeMonth({ month: m, status: 'paid' }))
    expect(isInstallmentCompleted(plan, months)).toBe(true)
  })
  it('not completed while payments remain', () => {
    const months = [makeMonth({ month: 1, status: 'paid' })]
    expect(isInstallmentCompleted(plan, months)).toBe(false)
  })
  it('never completed for non-installment obligations', () => {
    const o = makeObligation()
    const months = [makeMonth({ status: 'paid' })]
    expect(isInstallmentCompleted(o, months)).toBe(false)
  })
})
