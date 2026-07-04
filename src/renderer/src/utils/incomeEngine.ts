import type { Income } from '../types'

// The income log lives in its own logic, separate from the obligation engine:
// entries are keyed by their date's month, nothing here touches obligations.

// 'YYYY-MM' prefix used to match entry dates against a viewed month.
export function incomeMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

// Entries of one month, sorted by date (stable: creation order breaks ties).
// String comparison on the ISO date — no Date parsing, no timezone shifts.
export function incomesForMonth(incomes: Income[], year: number, month: number): Income[] {
  const prefix = `${incomeMonthKey(year, month)}-`
  return incomes
    .filter((i) => i.date.startsWith(prefix))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
}

export function sumIncomes(incomes: Income[]): number {
  return incomes.reduce((sum, i) => sum + i.amount, 0)
}

// Default date for a new entry in the viewed month: today when the viewed
// month is the current one, otherwise the 1st of that month.
export function defaultIncomeDate(year: number, month: number, today = new Date()): string {
  if (today.getFullYear() === year && today.getMonth() + 1 === month) {
    return `${incomeMonthKey(year, month)}-${String(today.getDate()).padStart(2, '0')}`
  }
  return `${incomeMonthKey(year, month)}-01`
}

// Locale display of a stored 'YYYY-MM-DD' date (built via local Date parts —
// parsing the ISO string directly would interpret it as UTC).
export function formatIncomeDate(iso: string, locale: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(y, m - 1, d))
}
