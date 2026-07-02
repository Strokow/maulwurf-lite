import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import type { Bank, Obligation, ObligationType, ObligationFrequency } from '../types'
import { useI18n } from '../i18n'
import { Button } from './ui/button'

interface ObligationModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (
    obligation: Omit<Obligation, 'id' | 'createdAt'>,
    paidInstallments?: number,
    priceFromCurrentMonth?: boolean
  ) => void
  banks: Bank[]
  currency: string
  editObligation?: Obligation | null
  editEffectiveAmount?: number | null // effective price of the open month, pre-fills the form
  preselectedType?: ObligationType
  preselectedFrequency?: ObligationFrequency
  preselectedInstallment?: boolean
  installmentPaidCount?: number
}

interface FormState {
  name: string
  type: ObligationType
  amount: string
  approximateDay: string
  bankId: string
  notes: string
  frequency: ObligationFrequency
  yearlyMonth: string
  isInstallment: boolean
  totalInstallments: string
  originalTotal: string
  paidInstallments: string
}

const emptyForm: FormState = {
  name: '',
  type: 'subscription',
  amount: '',
  approximateDay: '',
  bankId: '',
  notes: '',
  frequency: 'monthly',
  yearlyMonth: '',
  isInstallment: false,
  totalInstallments: '',
  originalTotal: '',
  paidInstallments: '',
}

export function ObligationModal({
  isOpen,
  onClose,
  onSave,
  banks,
  currency,
  editObligation,
  editEffectiveAmount,
  preselectedType,
  preselectedFrequency,
  preselectedInstallment,
  installmentPaidCount,
}: ObligationModalProps): React.JSX.Element {
  const { t, monthName } = useI18n()
  const [form, setForm] = useState<FormState>(emptyForm)
  const [priceFromThisMonth, setPriceFromThisMonth] = useState(false)
  const backdropRef = useRef<HTMLDivElement>(null)
  // Guard against double submit (double click / repeated call) → duplicate obligation.
  const submittingRef = useRef(false)

  useEffect(() => {
    if (isOpen) {
      submittingRef.current = false
      setPriceFromThisMonth(false)
      if (editObligation) {
        setForm({
          name: editObligation.name,
          type: editObligation.type,
          amount: (() => {
            const a = editEffectiveAmount !== undefined ? editEffectiveAmount : editObligation.amount
            return a !== null ? String(a) : ''
          })(),
          approximateDay:
            editObligation.approximateDay !== null ? String(editObligation.approximateDay) : '',
          bankId: editObligation.bankId ?? '',
          notes: editObligation.notes ?? '',
          frequency: editObligation.frequency ?? 'monthly',
          yearlyMonth: editObligation.yearlyMonth != null ? String(editObligation.yearlyMonth) : '',
          isInstallment: editObligation.isInstallment ?? false,
          totalInstallments:
            editObligation.totalInstallments != null ? String(editObligation.totalInstallments) : '',
          originalTotal:
            editObligation.originalTotal != null ? String(editObligation.originalTotal) : '',
          paidInstallments: installmentPaidCount != null ? String(installmentPaidCount) : '0',
        })
      } else {
        setForm({
          ...emptyForm,
          type: preselectedType ?? 'subscription',
          frequency: preselectedFrequency ?? 'monthly',
          isInstallment: preselectedInstallment ?? false,
          paidInstallments: '0',
        })
      }
    }
  }, [
    isOpen,
    editObligation,
    editEffectiveAmount,
    preselectedType,
    preselectedFrequency,
    preselectedInstallment,
    installmentPaidCount,
  ])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  const handleBackdropMouseDown = (e: React.MouseEvent): void => {
    if (e.target === backdropRef.current) onClose()
  }

  const handleSave = (): void => {
    if (!form.name.trim()) return
    if (submittingRef.current) return
    submittingRef.current = true
    const paidInst =
      form.isInstallment && form.paidInstallments ? parseInt(form.paidInstallments, 10) : undefined
    onSave(
      {
        name: form.name.trim(),
        type: form.type,
        amount: form.amount ? parseFloat(form.amount) : null,
        approximateDay: form.approximateDay ? parseInt(form.approximateDay, 10) : null,
        bankId: form.bankId || null,
        notes: form.notes.trim() || undefined,
        isActive: editObligation ? editObligation.isActive : true,
        frequency: form.frequency,
        yearlyMonth:
          form.frequency === 'yearly' && form.yearlyMonth ? parseInt(form.yearlyMonth, 10) : null,
        isInstallment: form.isInstallment || undefined,
        totalInstallments:
          form.isInstallment && form.totalInstallments
            ? parseInt(form.totalInstallments, 10)
            : undefined,
        originalTotal:
          form.isInstallment && form.originalTotal ? parseFloat(form.originalTotal) : undefined,
      },
      paidInst,
      priceFromThisMonth
    )
    onClose()
  }

  const update = (field: keyof FormState, value: string | boolean): void => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const freqButton = (freq: ObligationFrequency, label: string): React.JSX.Element => (
    <button
      onClick={() =>
        setForm((prev) => ({
          ...prev,
          frequency: freq,
          yearlyMonth: freq === 'yearly' ? prev.yearlyMonth : '',
        }))
      }
      className={`flex-1 rounded-md px-3 py-2 text-sm ${
        form.frequency === freq
          ? 'bg-neutral-700 text-white'
          : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
      }`}
    >
      {label}
    </button>
  )

  const inputCls =
    'w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none'

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={backdropRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={handleBackdropMouseDown}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-900 p-6"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-100">
                {editObligation
                  ? t('editObligation')
                  : form.isInstallment
                    ? t('newInstallment')
                    : t('newObligation')}
              </h2>
              <button
                onClick={onClose}
                title={t('cancel')}
                className="rounded-md p-1 text-neutral-500 hover:text-neutral-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-neutral-400">{t('fieldName')}</label>
                <input
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  placeholder={t('fieldNamePlaceholder')}
                  className={inputCls}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-neutral-400">{t('fieldType')}</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => update('type', 'subscription')}
                    className={`flex-1 rounded-md px-3 py-2 text-sm ${
                      form.type === 'subscription'
                        ? 'bg-neutral-700 text-white'
                        : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {t('typeSubscriptionAuto')}
                  </button>
                  <button
                    onClick={() => update('type', 'manual_payment')}
                    className={`flex-1 rounded-md px-3 py-2 text-sm ${
                      form.type === 'manual_payment'
                        ? 'bg-neutral-700 text-white'
                        : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {t('typeManual')}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-neutral-400">
                    {t('fieldAmount')} ({currency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.amount}
                    onChange={(e) => update('amount', e.target.value)}
                    placeholder={t('fieldAmountPlaceholder')}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-neutral-400">{t('fieldApproxDay')}</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={form.approximateDay}
                    onChange={(e) => update('approximateDay', e.target.value)}
                    placeholder={t('fieldApproxDayPlaceholder')}
                    className={inputCls}
                  />
                </div>
              </div>

              {editObligation &&
                (form.frequency === 'monthly' ||
                  form.frequency === 'quarterly' ||
                  form.frequency === 'yearly') && (
                <label className="flex cursor-pointer select-none items-start gap-2 rounded-md border border-neutral-700 bg-neutral-800/50 px-3 py-2 text-xs text-neutral-300">
                  <input
                    type="checkbox"
                    checked={priceFromThisMonth}
                    onChange={(e) => setPriceFromThisMonth(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-pink-600"
                  />
                  <span>{t('priceFromThisMonth')}</span>
                </label>
              )}

              <div>
                <label className="mb-1 block text-xs text-neutral-400">{t('fieldBank')}</label>
                <select
                  value={form.bankId}
                  onChange={(e) => update('bankId', e.target.value)}
                  title={t('fieldBank')}
                  className={inputCls}
                >
                  <option value="">{t('noBank')}</option>
                  {banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-neutral-400">{t('fieldFrequency')}</label>
                <div className="grid grid-cols-2 gap-2">
                  {freqButton('monthly', t('typeMonthly'))}
                  {freqButton('quarterly', t('typeQuarterly'))}
                  {freqButton('yearly', t('typeYearly'))}
                  {freqButton('once', t('typeOnce'))}
                </div>
              </div>

              {form.frequency === 'yearly' && (
                <div>
                  <label className="mb-1 block text-xs text-neutral-400">
                    {t('fieldPaymentMonth')}
                  </label>
                  <select
                    value={form.yearlyMonth}
                    onChange={(e) => update('yearlyMonth', e.target.value)}
                    title={t('fieldPaymentMonth')}
                    className={inputCls}
                  >
                    <option value="">{t('notSpecified')}</option>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={String(m)}>
                        {monthName(m)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <label
                className={`flex cursor-pointer select-none items-start gap-2.5 rounded-lg border px-3 py-2.5 text-xs transition-colors ${
                  form.isInstallment
                    ? 'border-pink-700/60 bg-pink-950/30'
                    : 'border-pink-900/40 bg-pink-950/10 hover:border-pink-800/60'
                }`}
              >
                <input
                  type="checkbox"
                  checked={form.isInstallment}
                  onChange={(e) => update('isInstallment', e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-pink-600"
                />
                <span>
                  <span className="text-sm font-medium text-pink-400">{t('installmentPlan')}</span>
                  <span className="mt-0.5 block leading-relaxed text-neutral-500">
                    {t('installmentPlanHint')}
                  </span>
                </span>
              </label>

              {form.isInstallment && (
                <div className="space-y-3 rounded-lg border border-pink-900/40 bg-pink-950/20 p-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="mb-1 block text-xs text-neutral-400">
                        {t('fieldTotalInstallments')}
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={form.totalInstallments}
                        onChange={(e) => update('totalInstallments', e.target.value)}
                        placeholder="6"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-neutral-400">
                        {t('fieldPaidInstallments')}
                      </label>
                      <input
                        type="number"
                        min="0"
                        max={form.totalInstallments || undefined}
                        value={form.paidInstallments}
                        onChange={(e) => update('paidInstallments', e.target.value)}
                        placeholder="0"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-neutral-400">
                        {t('fieldOriginalTotal')} ({currency})
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.originalTotal}
                        onChange={(e) => update('originalTotal', e.target.value)}
                        placeholder="—"
                        className={inputCls}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs text-neutral-400">{t('fieldNotes')}</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => update('notes', e.target.value)}
                  rows={2}
                  placeholder={t('fieldNotesPlaceholder')}
                  className={inputCls}
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-md px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200"
              >
                {t('cancel')}
              </button>
              <Button onClick={handleSave} disabled={!form.name.trim()}>
                {editObligation ? t('save') : t('add')}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
