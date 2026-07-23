import type { Obligation, ObligationMonth, ObligationStatus } from '../types'

// Clamp a day-of-month to the month length, otherwise new Date(2026, 1, 31)
// silently becomes March 3rd instead of Feb 28th.
export function clampDayToMonth(year: number, month0: number, day: number): number {
  const lastDay = new Date(year, month0 + 1, 0).getDate()
  return Math.min(day, lastDay)
}

// Local YYYY-MM-DD without the UTC shift: new Date(2026,4,1).toISOString()
// in a CEST timezone yields '2026-04-30'.
export function formatLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Effective price of an obligation for a given month, honouring the
// effective-dated price history (amountChanges). Months before the earliest
// entry use the base amount; the past is never rewritten by a price change.
export function effectiveAmount(
  o: { amount: number | null; amountChanges?: { from: string; amount: number }[] },
  year: number,
  month: number
): number | null {
  if (!o.amountChanges || o.amountChanges.length === 0) return o.amount
  const key = `${year}-${String(month).padStart(2, '0')}`
  let amt = o.amount
  for (const ch of [...o.amountChanges].sort((a, b) => a.from.localeCompare(b.from))) {
    if (ch.from <= key) amt = ch.amount
    else break
  }
  return amt
}

// Default status when no ObligationMonth record exists:
// yearly/quarterly → 'unknown' (we don't know whether it is due this month);
// monthly/once → 'unpaid' (an active subscription / pending payment).
// A once obligation is only visible in its creation month, where the payment
// genuinely lies ahead — hence 'unpaid', not 'unknown'.
export function defaultStatus(o: Pick<Obligation, 'frequency'>): ObligationStatus {
  const f = o.frequency ?? 'monthly'
  return f === 'yearly' || f === 'quarterly' ? 'unknown' : 'unpaid'
}

// Period obligations (yearly/quarterly): one payment covers this many months.
export type PeriodFrequency = 'yearly' | 'quarterly'

export function coverageMonths(frequency: PeriodFrequency): number {
  return frequency === 'yearly' ? 12 : 3
}

// Given a payment in (paidYear, paidMonth), the last covered month (inclusive):
// yearly paid in Mar 2026 → until Feb 2027; quarterly paid in Nov 2026 → until Jan 2027.
export function paidUntil(
  frequency: PeriodFrequency,
  paidYear: number,
  paidMonth: number
): { untilYear: number; untilMonth: number } {
  let untilMonth = paidMonth + coverageMonths(frequency) - 1
  let untilYear = paidYear
  while (untilMonth > 12) {
    untilMonth -= 12
    untilYear++
  }
  return { untilYear, untilMonth }
}

export function getEffectiveStatus(
  o: Pick<Obligation, 'frequency'>,
  rec: ObligationMonth | null
): ObligationStatus {
  if (rec?.status != null) return rec.status
  return defaultStatus(o)
}

// "Natively" active in a given month: isActive + month >= createdAt month
// (once — only in its creation month). Used both to filter the visible list
// and as the gate for charging the month's own payment in all totals.
export function isNativeActive(o: Obligation, y: number, m: number): boolean {
  if (!o.isActive) return false
  const created = new Date(o.createdAt)
  const createdYear = created.getFullYear()
  const createdMonth = created.getMonth() + 1
  if (y < createdYear || (y === createdYear && m < createdMonth)) return false
  if (o.frequency === 'once') return createdYear === y && createdMonth === m
  return true
}

// Number of 'paid' month records of an installment obligation.
export function paidInstallmentCount(o: Obligation, months: ObligationMonth[]): number {
  return months.filter((m) => m.obligationId === o.id && m.status === 'paid').length
}

// A completed installment plan (paid >= totalInstallments) no longer owes
// anything and must be excluded from every "to pay" total. Its card is visible
// in the month of the last payment and hidden from every later month
// (isHiddenCompleted, Phase 6).
export function isInstallmentCompleted(o: Obligation, months: ObligationMonth[]): boolean {
  if (!o.isInstallment || o.totalInstallments == null || o.totalInstallments <= 0) return false
  return paidInstallmentCount(o, months) >= o.totalInstallments
}

// Month of the last paid installment as y*12+m (or null when nothing is paid).
// The "history" boundary of a completed plan (Phase 6).
export function lastPaidYM(o: Obligation, months: ObligationMonth[]): number | null {
  let max: number | null = null
  for (const m of months) {
    if (m.obligationId === o.id && m.status === 'paid') {
      const ym = m.year * 12 + m.month
      if (max == null || ym > max) max = ym
    }
  }
  return max
}

// A completed installment plan that we no longer show in THIS month (Phase 6):
// visible in the month of the last payment, hidden in every later month. Data is
// NOT deleted — navigating back to a past month shows the card again, and
// retroactively un-marking the last payment makes the plan incomplete → the card
// returns everywhere.
export function isHiddenCompleted(
  o: Obligation,
  months: ObligationMonth[],
  year: number,
  month: number
): boolean {
  if (!isInstallmentCompleted(o, months)) return false
  const last = lastPaidYM(o, months)
  if (last == null) return false // guard: completed with no paid records — don't hide
  return year * 12 + month > last
}
