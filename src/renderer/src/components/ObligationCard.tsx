import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Pencil,
  Trash2,
  AlertTriangle,
  Clock,
  Copy,
  ChevronLeft,
  ChevronRight,
  CalendarCheck,
  Link2,
  Unlink,
  ChevronsRight,
  ChevronsLeft,
} from 'lucide-react'
import type { Bank, Obligation, ObligationMonth, ObligationStatus } from '../types'
import { useI18n } from '../i18n'

const statusColors: Record<ObligationStatus, string> = {
  paid: 'bg-green-900/50 text-green-300',
  unpaid: 'bg-red-900/50 text-red-300',
  unknown: 'bg-neutral-800 text-neutral-400',
  skipped: 'bg-neutral-800 text-neutral-600',
}

interface PaidUntilInfo {
  paidMonth: number
  paidYear: number
  untilMonth: number
  untilYear: number
}

interface ObligationCardProps {
  obligation: Obligation
  currentMonthRecord: ObligationMonth | null
  bank?: Bank
  currency: string
  // "Paid until" coverage window of a period obligation (yearly/quarterly);
  // passed only when the viewed month is actually covered.
  paidUntil?: PaidUntilInfo
  onEdit: (obligation: Obligation) => void
  onDelete: (id: string) => void
  onStatusChange: (obligationId: string, status: ObligationStatus) => void
  onCopy: (obligation: Obligation, targetYear: number, targetMonth: number) => void
  isChild?: boolean
  isParent?: boolean
  parentName?: string
  childCount?: number
  onUnlink?: (obligationId: string) => void
  installmentPaidCount?: number
  onCarryDebt?: (toYear: number, toMonth: number) => void
  carriedToYear?: number
  carriedToMonth?: number
  onPayCarried?: () => void
  onPayAll?: () => void
  onReturnCarried?: () => void
  effectiveAmt?: number | null // effective price for the viewed month (amountChanges)
  navYear?: number // viewed month — the carry picker only allows future months
  navMonth?: number
  // The obligation "natively" occurs in this month (monthly always; once — only
  // in its creation month). false → the card is shown ONLY because a debt was
  // carried here; the month's own payment is not charged.
  occursNatively?: boolean
}

export function ObligationCard({
  obligation,
  currentMonthRecord,
  bank,
  currency,
  paidUntil,
  onEdit,
  onDelete,
  onStatusChange,
  onCopy,
  isChild,
  isParent,
  parentName,
  childCount,
  onUnlink,
  installmentPaidCount,
  onCarryDebt,
  carriedToYear,
  carriedToMonth,
  onPayCarried,
  onPayAll,
  onReturnCarried,
  effectiveAmt,
  navYear,
  navMonth,
  occursNatively,
}: ObligationCardProps): React.JSX.Element {
  const { t, tn, monthName, monthYear, monthShort, formatCurrency } = useI18n()
  const [showMonthPicker, setShowMonthPicker] = useState(false)
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear())
  const [showCarryPicker, setShowCarryPicker] = useState(false)
  const [carryPickerYear, setCarryPickerYear] = useState(navYear ?? new Date().getFullYear())
  const [exitDir, setExitDir] = useState<'up' | 'down' | null>(null)

  const fmt = (n: number): string => formatCurrency(n, currency)

  const statusLabels: Record<ObligationStatus, string> = {
    paid: t('statusPaid'),
    unpaid: t('statusUnpaid'),
    unknown: t('statusUnknown'),
    skipped: t('statusSkipped'),
  }

  // Period obligations (yearly/quarterly) covered by a past payment show as
  // "paid" without a record.
  const isPeriodCovered =
    (obligation.frequency === 'yearly' || obligation.frequency === 'quarterly') && !!paidUntil
  // Default without a record: yearly/quarterly → 'unknown' (we don't know if it
  // is due this month); monthly and once → 'unpaid'.
  const defaultStatus: ObligationStatus =
    obligation.frequency === 'yearly' || obligation.frequency === 'quarterly'
      ? 'unknown'
      : 'unpaid'
  const status: ObligationStatus = isPeriodCovered
    ? 'paid'
    : (currentMonthRecord?.status ?? defaultStatus)

  // The obligation natively occurs this month; false → shown only because a
  // debt was carried here → no current charge.
  const nativeCharge = occursNatively !== false
  // SOURCE card: the debt was carried OUT of this month → dim it.
  const transferredOut = carriedToYear != null && carriedToMonth != null
  const displayAmount = effectiveAmt !== undefined ? effectiveAmt : obligation.amount
  const currentAmount = nativeCharge ? (displayAmount ?? 0) : 0

  // Carry-over state of THIS month's record
  const rec = currentMonthRecord
  const carriedAmt = rec?.carriedAmount
  const carriedIsPaid = rec?.carriedPaid === true
  const currentIsPaid = rec?.status === 'paid'
  const hasCombinedDebt = rec?.isCarriedOver === true && carriedAmt != null && !carriedIsPaid
  const fullySettled = currentIsPaid && (!rec?.isCarriedOver || carriedIsPaid || carriedAmt == null)
  const isNewCarriedOver = rec?.isCarriedOver === true && !fullySettled
  // Both parts paid, but the source month was settled late → late-fee risk note
  const paidCarryover =
    rec?.isCarriedOver === true && carriedIsPaid && currentIsPaid && carriedAmt != null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const approxDay = obligation.approximateDay
  let dueWarning: string | null = null

  if (approxDay !== null && status !== 'paid' && !obligation.isInstallment) {
    const year = today.getFullYear()
    const month = today.getMonth()
    let nextDate = new Date(year, month, approxDay)
    nextDate.setHours(0, 0, 0, 0)
    if (nextDate < today) {
      nextDate = new Date(year, month + 1, approxDay)
    }
    const diff = Math.round((nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (diff >= 0 && diff <= 5) {
      dueWarning = diff === 0 ? t('paymentToday') : tn('paymentInDays', diff)
    }
  }

  const nextStatus: ObligationStatus = status === 'paid' ? 'unpaid' : 'paid'

  const handleStatusClick = (): void => {
    const dir = nextStatus === 'paid' ? 'down' : 'up'
    setExitDir(dir)
    setTimeout(() => {
      onStatusChange(obligation.id, nextStatus)
      setExitDir(null)
    }, 250)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{
        opacity: exitDir ? 0 : 1,
        y: exitDir === 'down' ? 50 : exitDir === 'up' ? -50 : 0,
        scale: exitDir ? 0.97 : 1,
      }}
      transition={{ duration: exitDir ? 0.25 : 0.3, ease: [0.4, 0, 0.2, 1] }}
      className={`rounded-xl border bg-neutral-900/50 p-4${transferredOut ? ' opacity-60' : ''}${
        isNewCarriedOver
          ? ' border-amber-600/70 ring-1 ring-amber-700/40'
          : paidCarryover
            ? ' border-amber-800/50 ring-1 ring-amber-900/30'
            : isChild
              ? ' border-blue-800/40'
              : isParent
                ? ' border-blue-700/50 ring-1 ring-blue-900/30'
                : ' border-neutral-800'
      }`}
    >
      {dueWarning && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-orange-950/40 px-3 py-2 text-sm text-orange-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {dueWarning}
        </div>
      )}

      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-neutral-100">{obligation.name}</span>
            {isParent && childCount != null && childCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-900/40 px-2 py-0.5 text-xs font-medium text-blue-300">
                <Link2 className="h-3 w-3" />
                {tn('linkedCount', childCount)}
              </span>
            )}
            {isChild && parentName && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-900/30 px-2 py-0.5 text-xs font-medium text-blue-400/70">
                <Link2 className="h-3 w-3" />
                {t('viaParent', { name: parentName })}
              </span>
            )}
            {isPeriodCovered ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-900/40 px-2 py-0.5 text-xs font-medium text-green-300">
                <CalendarCheck className="h-3 w-3" />
                {t('paidUntil', {
                  month: monthYear(paidUntil!.untilYear, paidUntil!.untilMonth),
                })}
              </span>
            ) : isChild ? (
              <span
                className={`cursor-default rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[status]} opacity-70`}
                title={t('paidViaParent', { name: parentName ?? '' })}
              >
                {statusLabels[status]}
              </span>
            ) : (
              <button
                onClick={handleStatusClick}
                disabled={exitDir !== null}
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[status]}`}
              >
                {statusLabels[status]}
              </button>
            )}
          </div>
          <p className="flex flex-wrap items-center gap-x-1 text-xs text-neutral-400">
            <span>{obligation.type === 'subscription' ? t('subscription') : t('manualPayment')}</span>
            <span>·</span>
            {bank ? (
              <span className="inline-flex items-center gap-1">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: bank.color }}
                />
                {bank.name}
              </span>
            ) : (
              <span className="text-neutral-600">{t('noBank')}</span>
            )}
            {obligation.frequency === 'yearly' && (
              <>
                <span>·</span>
                <span className="text-purple-400">
                  {obligation.yearlyMonth != null
                    ? t('yearlyIn', { month: monthName(obligation.yearlyMonth) })
                    : t('yearlyLabel')}
                </span>
              </>
            )}
            {obligation.frequency === 'quarterly' && (
              <>
                <span>·</span>
                <span className="text-cyan-400">{t('quarterlyLabel')}</span>
              </>
            )}
            {obligation.frequency === 'once' && (
              <>
                <span>·</span>
                <span className="text-orange-400">{t('onceLabel')}</span>
              </>
            )}
          </p>

          {/* Amount */}
          <div className="pt-1">
            {displayAmount !== null ? (
              hasCombinedDebt ? (
                // Combined debt: carried amount + current month's own charge (if unpaid)
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-neutral-400">
                      {t('debtFrom', {
                        month: rec?.carriedFromMonth != null ? monthName(rec.carriedFromMonth) : '',
                      })}
                    </span>
                    <span className="font-medium text-amber-300">{fmt(carriedAmt!)}</span>
                  </div>
                  {nativeCharge && !currentIsPaid && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-neutral-400">
                        {t('subscriptionOf', { month: rec?.month != null ? monthName(rec.month) : '' })}
                      </span>
                      <span className="font-medium text-neutral-200">{fmt(currentAmount)}</span>
                    </div>
                  )}
                  {nativeCharge && !currentIsPaid && (
                    <div className="mt-0.5 border-t border-amber-800/30 pt-1">
                      <p className="text-lg font-bold text-amber-300">
                        {t('total', { amount: fmt(currentAmount + carriedAmt!) })}
                      </p>
                    </div>
                  )}
                  {currentIsPaid && (
                    <p className="text-xs text-green-400/80">{t('subPaidDebtOpen')}</p>
                  )}
                </div>
              ) : paidCarryover ? (
                // Both parts paid: show the breakdown + total (payment was late)
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-neutral-400">
                      {rec?.carriedFromMonth != null && rec?.carriedFromYear != null
                        ? monthYear(rec.carriedFromYear, rec.carriedFromMonth)
                        : ''}
                      :
                    </span>
                    <span className="font-medium text-green-300">{fmt(carriedAmt!)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-neutral-400">
                      {rec?.month != null ? monthName(rec.month) : ''}:
                    </span>
                    <span className="font-medium text-green-300">{fmt(currentAmount)}</span>
                  </div>
                  <div className="mt-0.5 border-t border-green-800/30 pt-1">
                    <p className="text-lg font-bold text-green-300">
                      {t('total', { amount: fmt(currentAmount + carriedAmt!) })}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-lg font-semibold text-neutral-200">{fmt(currentAmount)}</p>
              )
            ) : (
              <p className="text-sm text-neutral-500">{t('amountUnknown')}</p>
            )}
            {obligation.approximateDay !== null && (
              <p className="mt-0.5 text-xs text-neutral-500">
                {t('approxDayOfMonth', { day: obligation.approximateDay })}
              </p>
            )}
          </div>

          {/* Late-payment note: both parts paid, but the source month was settled late */}
          {paidCarryover && rec?.carriedFromMonth != null && (
            <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-800/30 bg-amber-950/40 px-3 py-2 text-xs text-amber-300">
              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                <p className="font-medium">
                  {t('paidLate', {
                    month: monthYear(rec.carriedFromYear ?? 0, rec.carriedFromMonth),
                  })}
                </p>
                <p className="mt-0.5 text-amber-400/70">{t('lateFeePossible')}</p>
              </div>
            </div>
          )}

          {/* Open carried debt: warning + payment buttons */}
          {hasCombinedDebt && rec?.carriedFromMonth != null && (
            <div className="mt-2 space-y-2">
              <div className="flex items-start gap-2 rounded-lg border border-amber-800/30 bg-amber-950/40 px-3 py-2 text-xs text-amber-300">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div>
                  <p className="font-medium">
                    {t('debtCarriedHere', {
                      month: monthYear(rec.carriedFromYear ?? 0, rec.carriedFromMonth),
                    })}
                  </p>
                  <p className="mt-0.5 text-amber-400/70">{t('lateFeeWarning')}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {!currentIsPaid && onPayAll && (
                  <button
                    onClick={onPayAll}
                    className="rounded-md border border-amber-700/50 bg-amber-900/40 px-2.5 py-1 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-800/50"
                  >
                    {t('payAll', { amount: fmt(currentAmount + carriedAmt!) })}
                  </button>
                )}
                {nativeCharge && !carriedIsPaid && onPayCarried && (
                  <button
                    onClick={onPayCarried}
                    className="rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-700"
                  >
                    {t('payDebt', { amount: fmt(carriedAmt!) })}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Simple "carried over" badge once the carried debt is already settled */}
          {isNewCarriedOver && !hasCombinedDebt && rec?.carriedFromMonth != null && (
            <div className="mt-1 flex items-center gap-2 rounded-lg border border-amber-800/30 bg-amber-950/40 px-3 py-2 text-xs text-amber-300">
              <ChevronsRight className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              <span className="font-medium">
                {t('carriedFromBadge', {
                  month: monthYear(rec.carriedFromYear ?? 0, rec.carriedFromMonth),
                })}
              </span>
            </div>
          )}

          {/* Source-card note: the debt was carried to another month */}
          {carriedToMonth != null && carriedToYear != null && (
            <p className="mt-1 flex items-center gap-1 text-xs text-amber-500/70">
              <ChevronsRight className="h-3 w-3" />
              {t('debtCarriedTo', { month: monthYear(carriedToYear, carriedToMonth) })}
            </p>
          )}

          {obligation.notes && <p className="text-xs italic text-neutral-600">{obligation.notes}</p>}

          {/* Installment progress — based on the count of paid month records */}
          {obligation.isInstallment &&
            obligation.totalInstallments != null &&
            (() => {
              const paid = installmentPaidCount ?? 0
              const total = obligation.totalInstallments!
              const fullyPaid = paid >= total
              return fullyPaid ? (
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-green-800/30 bg-green-950/40 px-3 py-2">
                  <span className="text-sm font-medium text-green-400">{t('fullyPaidOff')}</span>
                  {obligation.originalTotal != null && (
                    <span className="ml-auto text-xs text-neutral-500">
                      {fmt(obligation.originalTotal)}
                    </span>
                  )}
                </div>
              ) : (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-pink-400/80">
                      {t('installmentProgress', { paid, total })}
                    </span>
                    {obligation.originalTotal != null && (
                      <span className="text-neutral-500">
                        {t('originalDebt', { amount: fmt(obligation.originalTotal) })}
                      </span>
                    )}
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-pink-600 to-pink-400 transition-all duration-500"
                      style={{ width: `${Math.min(100, (paid / total) * 100)}%` }}
                    />
                  </div>
                </div>
              )
            })()}
        </div>

        {/* Action buttons */}
        <div className="ml-2 flex shrink-0 gap-1">
          {isChild && onUnlink && (
            <button
              onClick={() => onUnlink(obligation.id)}
              title={t('unlink')}
              className="rounded-md p-1.5 text-neutral-500 hover:bg-orange-950 hover:text-orange-400"
            >
              <Unlink className="h-3.5 w-3.5" />
            </button>
          )}
          {rec?.isCarriedOver && onReturnCarried && (
            <button
              onClick={onReturnCarried}
              title={
                rec.carriedFromMonth != null
                  ? t('returnCarried', { month: monthName(rec.carriedFromMonth) })
                  : t('returnCarriedGeneric')
              }
              className="rounded-md p-1.5 text-amber-600/70 hover:bg-amber-950 hover:text-amber-400"
            >
              <ChevronsLeft className="h-3.5 w-3.5" />
            </button>
          )}
          {onCarryDebt &&
            (() => {
              // Block the carry when there is no amount to carry (neither on the
              // obligation nor recorded for the month).
              const noAmount = obligation.amount == null && rec?.actualAmount == null
              return (
                <button
                  onClick={
                    noAmount
                      ? undefined
                      : () => {
                          setShowCarryPicker((v) => !v)
                          setShowMonthPicker(false)
                        }
                  }
                  disabled={noAmount}
                  title={noAmount ? t('carryNoAmount') : t('carryToMonth')}
                  className={
                    noAmount
                      ? 'cursor-not-allowed rounded-md p-1.5 text-neutral-700'
                      : `rounded-md p-1.5 text-amber-600/70 hover:bg-amber-950 hover:text-amber-400${
                          showCarryPicker ? ' bg-amber-950 text-amber-400' : ''
                        }`
                  }
                >
                  <ChevronsRight className="h-3.5 w-3.5" />
                </button>
              )
            })()}
          <button
            onClick={() => setShowMonthPicker(!showMonthPicker)}
            title={t('copyToMonth')}
            className="rounded-md p-1.5 text-neutral-500 hover:bg-blue-950 hover:text-blue-400"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onEdit(obligation)}
            title={t('edit')}
            className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete(obligation.id)}
            title={t('delete')}
            className="rounded-md p-1.5 text-neutral-500 hover:bg-red-950 hover:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Copy-to-month picker */}
      <AnimatePresence>
        {showMonthPicker && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 overflow-hidden"
          >
            <div className="rounded-lg border border-neutral-700 bg-neutral-800/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <button
                  onClick={() => setPickerYear(pickerYear - 1)}
                  title={t('prevYear')}
                  className="rounded p-1 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="text-xs font-medium text-neutral-300">{pickerYear}</span>
                <button
                  onClick={() => setPickerYear(pickerYear + 1)}
                  title={t('nextYear')}
                  className="rounded p-1 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      onCopy(obligation, pickerYear, m)
                      setShowMonthPicker(false)
                    }}
                    className="rounded px-2 py-1 text-xs text-neutral-300 transition-colors hover:bg-blue-900/50 hover:text-blue-300"
                  >
                    {monthShort(m)}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Carry-debt picker (future months only) */}
      <AnimatePresence>
        {showCarryPicker && onCarryDebt && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 overflow-hidden"
          >
            <div className="rounded-lg border border-amber-700/50 bg-amber-950/20 p-3">
              <p className="mb-2 text-xs font-medium text-amber-300">{t('carryPickMonth')}</p>
              <div className="mb-2 flex items-center justify-between">
                <button
                  onClick={() => setCarryPickerYear(carryPickerYear - 1)}
                  title={t('prevYear')}
                  className="rounded p-1 text-amber-400/70 hover:bg-amber-900/40 hover:text-amber-300"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="text-xs font-medium text-amber-300">{carryPickerYear}</span>
                <button
                  onClick={() => setCarryPickerYear(carryPickerYear + 1)}
                  title={t('nextYear')}
                  className="rounded p-1 text-amber-400/70 hover:bg-amber-900/40 hover:text-amber-300"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {(() => {
                  const nY = navYear ?? new Date().getFullYear()
                  const nM = navMonth ?? new Date().getMonth() + 1
                  const navYM = nY * 12 + nM
                  return Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                    const disabled = carryPickerYear * 12 + m <= navYM // future months only
                    return (
                      <button
                        key={m}
                        disabled={disabled}
                        onClick={() => {
                          onCarryDebt(carryPickerYear, m)
                          setShowCarryPicker(false)
                        }}
                        className={
                          disabled
                            ? 'cursor-not-allowed rounded px-2 py-1 text-xs text-neutral-700'
                            : 'rounded px-2 py-1 text-xs text-amber-200 transition-colors hover:bg-amber-900/50 hover:text-amber-100'
                        }
                      >
                        {monthShort(m)}
                      </button>
                    )
                  })
                })()}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
