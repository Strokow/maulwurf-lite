// ── notificationEngine — pure, deterministic in-app notification layer (Phase 8) ──
//
// `now` is injected (testability, and to catch a midnight / 1st-of-month rollover
// while the window stays open). No store/IPC/React access — a pure function.
//
// Localization is NOT done here: evaluate() returns STRUCTURED notifications and the
// toast container renders them via useI18n(). This keeps the engine independent of
// language and trivially testable.
//
// Persistent dedup lives in NotificationsState (stored, outside undo): type 1 at most
// once a day, types 2/3 once a month — otherwise every launch after the 15th spams.
//
// Lite has no OS notification and no account balances, so rule 1 computes due dates
// from the obligations themselves (no "risk" split — Lite has nothing to risk against).

import type { NotificationsState, Obligation, ObligationMonth } from '../types'
import {
  clampDayToMonth,
  formatLocalDate,
  isNativeActive,
  getEffectiveStatus,
  isInstallmentCompleted,
} from '../utils/obligationEngine'

export type { NotificationsState }

export type NotificationType = 'upcoming' | 'firstOfMonth' | 'mostlyUnpaid'

export interface AppNotification {
  type: NotificationType
  // upcoming: up to 2 shown items + how many more; firstOfMonth/mostlyUnpaid: month
  items?: { name: string; amount: number | null }[]
  extraCount?: number
  month?: number // 1-12
  unpaid?: number
  total?: number
}

export interface EvaluateInput {
  obligations: Obligation[]
  obligationMonths: ObligationMonth[]
  now: Date
  state: NotificationsState
}

export interface EvaluateResult {
  notifications: AppNotification[]
  nextState: NotificationsState
}

// Days until the next occurrence of an obligation's approximate day, clamped to the
// month length. Mirrors ObligationCard's due-warning maths.
function daysUntilDue(approxDay: number, now: Date): number {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const y = start.getFullYear()
  const m0 = start.getMonth()
  let due = new Date(y, m0, clampDayToMonth(y, m0, approxDay))
  due.setHours(0, 0, 0, 0)
  if (due < start) due = new Date(y, m0 + 1, clampDayToMonth(y, m0 + 1, approxDay))
  return Math.round((due.getTime() - start.getTime()) / 86400000)
}

export function evaluate(input: EvaluateInput): EvaluateResult {
  const { obligations, obligationMonths, now, state } = input
  const notifications: AppNotification[] = []
  const nextState: NotificationsState = { ...state }

  const todayStr = formatLocalDate(now)
  const monthStr = todayStr.slice(0, 7)
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const date = now.getDate()

  const recFor = (o: Obligation): ObligationMonth | null =>
    obligationMonths.find((r) => r.obligationId === o.id && r.year === y && r.month === m) ?? null

  // ── Type 1: due within 3 days (at most once a day) ───────────────────────────
  if (state.lastShownUpcomingDate !== todayStr) {
    const soon = obligations.filter((o) => {
      if (o.approximateDay == null) return false
      if (!isNativeActive(o, y, m)) return false
      if (isInstallmentCompleted(o, obligationMonths)) return false
      if (getEffectiveStatus(o, recFor(o)) === 'paid') return false
      const d = daysUntilDue(o.approximateDay, now)
      return d >= 0 && d <= 3
    })
    if (soon.length > 0) {
      notifications.push({
        type: 'upcoming',
        items: soon.slice(0, 2).map((o) => ({ name: o.name, amount: o.amount })),
        extraCount: Math.max(0, soon.length - 2),
      })
      nextState.lastShownUpcomingDate = todayStr
    }
  }

  // ── Type 2: 1st of the month (once a month) ──────────────────────────────────
  if (date === 1 && state.lastShownFirstMonth !== monthStr) {
    notifications.push({ type: 'firstOfMonth', month: m })
    nextState.lastShownFirstMonth = monthStr
  }

  // ── Type 3: second half of the month + most unpaid (once a month) ────────────
  if (date > 15 && state.lastShownMostlyUnpaid !== monthStr) {
    let paid = 0
    let unpaid = 0
    for (const o of obligations) {
      if (!isNativeActive(o, y, m)) continue
      if (isInstallmentCompleted(o, obligationMonths)) continue
      const status = getEffectiveStatus(o, recFor(o))
      if (status === 'paid') paid++
      else if (status === 'unpaid') unpaid++
      // 'unknown'/'skipped' are not counted
    }
    const total = paid + unpaid
    if (total > 0 && unpaid / total > 0.5) {
      notifications.push({ type: 'mostlyUnpaid', month: m, unpaid, total })
      nextState.lastShownMostlyUnpaid = monthStr
    }
  }

  return { notifications, nextState }
}
