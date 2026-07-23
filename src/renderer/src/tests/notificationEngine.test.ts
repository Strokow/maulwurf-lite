import { describe, it, expect } from 'vitest'
import { evaluate, type NotificationsState } from '../services/notificationEngine'
import type { Obligation, ObligationMonth } from '../types'

function ob(over: Partial<Obligation> = {}): Obligation {
  return {
    id: 'o1',
    name: 'Test',
    type: 'subscription',
    amount: 10,
    approximateDay: null,
    bankId: null,
    isActive: true,
    createdAt: '2020-01-01T00:00:00.000Z',
    frequency: 'monthly',
    ...over,
  }
}

function mrec(over: Partial<ObligationMonth> = {}): ObligationMonth {
  return { obligationId: 'o1', year: 2026, month: 7, status: 'paid', actualAmount: null, ...over }
}

const empty: NotificationsState = {}

describe('notificationEngine — type 1 (due in 3 days)', () => {
  const now = new Date(2026, 6, 10, 12, 0) // 10 Jul 2026

  it('a due-soon payment yields an upcoming notification + dedup date', () => {
    const o = ob({ id: 'a', name: 'Vodafone', amount: 40, approximateDay: 12 })
    const res = evaluate({ obligations: [o], obligationMonths: [], now, state: empty })
    expect(res.notifications).toHaveLength(1)
    expect(res.notifications[0].type).toBe('upcoming')
    expect(res.notifications[0].items?.[0]).toEqual({ name: 'Vodafone', amount: 40 })
    expect(res.nextState.lastShownUpcomingDate).toBe('2026-07-10')
  })

  it('dedup: already shown today → silent', () => {
    const o = ob({ approximateDay: 12 })
    const res = evaluate({
      obligations: [o],
      obligationMonths: [],
      now,
      state: { lastShownUpcomingDate: '2026-07-10' },
    })
    expect(res.notifications).toHaveLength(0)
  })

  it('a paid obligation is not due', () => {
    const o = ob({ id: 'a', approximateDay: 12 })
    const months = [mrec({ obligationId: 'a', status: 'paid' })]
    const res = evaluate({ obligations: [o], obligationMonths: months, now, state: empty })
    expect(res.notifications).toHaveLength(0)
  })

  it('further than 3 days is not shown', () => {
    const o = ob({ approximateDay: 20 })
    const res = evaluate({ obligations: [o], obligationMonths: [], now, state: empty })
    expect(res.notifications).toHaveLength(0)
  })

  it('up to 2 items + extra count', () => {
    const obs = [
      ob({ id: 'a', name: 'A', approximateDay: 11 }),
      ob({ id: 'b', name: 'B', approximateDay: 12 }),
      ob({ id: 'c', name: 'C', approximateDay: 13 }),
    ]
    const res = evaluate({ obligations: obs, obligationMonths: [], now, state: empty })
    expect(res.notifications[0].items).toHaveLength(2)
    expect(res.notifications[0].extraCount).toBe(1)
  })

  it('a completed installment is excluded', () => {
    const o = ob({ id: 'k', isInstallment: true, totalInstallments: 1, approximateDay: 12 })
    const months = [mrec({ obligationId: 'k', month: 6, status: 'paid' })]
    const res = evaluate({ obligations: [o], obligationMonths: months, now, state: empty })
    expect(res.notifications).toHaveLength(0)
  })
})

describe('notificationEngine — type 2 (1st of month)', () => {
  it('on the 1st, not yet shown → once a month', () => {
    const res = evaluate({
      obligations: [],
      obligationMonths: [],
      now: new Date(2026, 6, 1, 9, 0),
      state: empty,
    })
    const t2 = res.notifications.find((n) => n.type === 'firstOfMonth')
    expect(t2).toBeDefined()
    expect(t2?.month).toBe(7)
    expect(res.nextState.lastShownFirstMonth).toBe('2026-07')
  })

  it('dedup: already shown this month → silent', () => {
    const res = evaluate({
      obligations: [],
      obligationMonths: [],
      now: new Date(2026, 6, 1, 9, 0),
      state: { lastShownFirstMonth: '2026-07' },
    })
    expect(res.notifications.find((n) => n.type === 'firstOfMonth')).toBeUndefined()
  })

  it('not the 1st → none', () => {
    const res = evaluate({
      obligations: [],
      obligationMonths: [],
      now: new Date(2026, 6, 2, 9, 0),
      state: empty,
    })
    expect(res.notifications.find((n) => n.type === 'firstOfMonth')).toBeUndefined()
  })
})

describe('notificationEngine — type 3 (most unpaid)', () => {
  const now = new Date(2026, 6, 20, 9, 0) // 20 Jul 2026

  it('after the 15th, all three unpaid → 3 of 3', () => {
    const obs = [ob({ id: 'a' }), ob({ id: 'b' }), ob({ id: 'c' })]
    const res = evaluate({ obligations: obs, obligationMonths: [], now, state: empty })
    const t3 = res.notifications.find((n) => n.type === 'mostlyUnpaid')
    expect(t3).toEqual({ type: 'mostlyUnpaid', month: 7, unpaid: 3, total: 3 })
    expect(res.nextState.lastShownMostlyUnpaid).toBe('2026-07')
  })

  it('mostly paid (1 of 3) → none', () => {
    const obs = [ob({ id: 'a' }), ob({ id: 'b' }), ob({ id: 'c' })]
    const months = [
      mrec({ obligationId: 'b', status: 'paid' }),
      mrec({ obligationId: 'c', status: 'paid' }),
    ]
    const res = evaluate({ obligations: obs, obligationMonths: months, now, state: empty })
    expect(res.notifications.find((n) => n.type === 'mostlyUnpaid')).toBeUndefined()
  })

  it('dedup this month → silent', () => {
    const obs = [ob({ id: 'a' }), ob({ id: 'b' })]
    const res = evaluate({
      obligations: obs,
      obligationMonths: [],
      now,
      state: { lastShownMostlyUnpaid: '2026-07' },
    })
    expect(res.notifications.find((n) => n.type === 'mostlyUnpaid')).toBeUndefined()
  })

  it('first half of the month (<=15) → none', () => {
    const obs = [ob({ id: 'a' }), ob({ id: 'b' })]
    const res = evaluate({
      obligations: obs,
      obligationMonths: [],
      now: new Date(2026, 6, 10, 9, 0),
      state: empty,
    })
    expect(res.notifications.find((n) => n.type === 'mostlyUnpaid')).toBeUndefined()
  })

  it('a completed installment is excluded from the denominator', () => {
    const obs = [
      ob({ id: 'a' }),
      ob({ id: 'k', isInstallment: true, totalInstallments: 2 }),
    ]
    const months = [
      mrec({ obligationId: 'k', month: 6, status: 'paid' }),
      mrec({ obligationId: 'k', month: 7, status: 'paid' }),
    ]
    const res = evaluate({ obligations: obs, obligationMonths: months, now, state: empty })
    const t3 = res.notifications.find((n) => n.type === 'mostlyUnpaid')
    expect(t3).toEqual({ type: 'mostlyUnpaid', month: 7, unpaid: 1, total: 1 })
  })
})
