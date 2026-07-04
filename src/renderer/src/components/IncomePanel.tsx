import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Plus, Trash2, TrendingUp, Pencil, Check, X } from 'lucide-react'
import type { Income } from '../types'
import { defaultIncomeDate, formatIncomeDate, incomeMonthKey } from '../utils/incomeEngine'
import { useI18n } from '../i18n'

// Collapsible dashboard card for the month's income log. Lives in its own
// logic, independent of obligations: collapsed it shows only the month total,
// expanded it lists the entries with add / edit / delete.
interface IncomePanelProps {
  incomes: Income[] // entries of the viewed month, already filtered and sorted
  total: number
  currency: string
  year: number
  month: number
  monthLabel: string
  // Promise<unknown>: the store's addIncome returns the created entry — ignored here.
  onAdd: (income: { date: string; amount: number; label: string }) => Promise<unknown>
  onUpdate: (id: string, updates: { date: string; amount: number; label: string }) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

const inputCls =
  'rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200 placeholder-neutral-600 focus:border-neutral-500 focus:outline-none'

const parseAmount = (raw: string): number => Number(raw.replace(',', '.'))

export function IncomePanel({
  incomes,
  total,
  currency,
  year,
  month,
  monthLabel,
  onAdd,
  onUpdate,
  onDelete,
}: IncomePanelProps): React.JSX.Element {
  const { t, locale, formatCurrency } = useI18n()
  const [open, setOpen] = useState(false)

  // Add form
  const [date, setDate] = useState(() => defaultIncomeDate(year, month))
  const [amount, setAmount] = useState('')
  const [label, setLabel] = useState('')

  // Inline edit (one row at a time)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [editLabel, setEditLabel] = useState('')

  const monthPrefix = `${incomeMonthKey(year, month)}-`
  const lastDay = new Date(year, month, 0).getDate()
  const minDate = `${monthPrefix}01`
  const maxDate = `${monthPrefix}${String(lastDay).padStart(2, '0')}`

  // Month switched: reset the form date and drop a stale edit state.
  useEffect(() => {
    setDate(defaultIncomeDate(year, month))
    setEditingId(null)
  }, [year, month])

  const amountNum = parseAmount(amount)
  // New entries are pinned to the viewed month (min/max on the input; typed
  // dates outside it are rejected here).
  const canAdd = date.startsWith(monthPrefix) && Number.isFinite(amountNum) && amountNum > 0

  const handleAdd = async (): Promise<void> => {
    if (!canAdd) return
    await onAdd({ date, amount: amountNum, label: label.trim() })
    setAmount('')
    setLabel('')
  }

  const startEdit = (inc: Income): void => {
    setEditingId(inc.id)
    setEditDate(inc.date)
    setEditAmount(String(inc.amount))
    setEditLabel(inc.label)
  }

  const editAmountNum = parseAmount(editAmount)
  // Editing allows ANY valid date — changing the month deliberately moves the
  // entry into that month's list.
  const canSaveEdit =
    /^\d{4}-\d{2}-\d{2}$/.test(editDate) && Number.isFinite(editAmountNum) && editAmountNum > 0

  const handleSaveEdit = async (): Promise<void> => {
    if (editingId === null || !canSaveEdit) return
    await onUpdate(editingId, { date: editDate, amount: editAmountNum, label: editLabel.trim() })
    setEditingId(null)
  }

  return (
    <div className="rounded-xl border border-emerald-900/50 bg-neutral-900/50">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <span className="flex items-center gap-2 text-xs text-neutral-400">
          <TrendingUp className="h-4 w-4 text-emerald-500" />
          {t('incomeIn', { month: monthLabel })}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-2xl font-bold text-emerald-400">
            {formatCurrency(total, currency)}
          </span>
          <ChevronDown
            className={`h-4 w-4 text-neutral-500 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 border-t border-neutral-800 p-4">
              {incomes.length === 0 ? (
                <p className="text-sm text-neutral-500">{t('incomeEmpty')}</p>
              ) : (
                <ul className="space-y-1.5">
                  {incomes.map((inc) =>
                    editingId === inc.id ? (
                      <li key={inc.id} className="flex flex-wrap items-center gap-2">
                        <input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          title={t('incomeDate')}
                          className={`${inputCls} [color-scheme:dark]`}
                        />
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          placeholder="0.00"
                          className={`${inputCls} w-24`}
                        />
                        <input
                          type="text"
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && void handleSaveEdit()}
                          placeholder={t('incomeLabelPlaceholder')}
                          className={`${inputCls} min-w-0 flex-1`}
                        />
                        <button
                          onClick={() => void handleSaveEdit()}
                          disabled={!canSaveEdit}
                          title={t('save')}
                          className="rounded-md p-1.5 text-emerald-500 hover:bg-emerald-950 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          title={t('cancel')}
                          className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    ) : (
                      <li key={inc.id} className="group flex items-center gap-3 text-sm">
                        <span className="w-24 shrink-0 text-xs text-neutral-500">
                          {formatIncomeDate(inc.date, locale)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-neutral-300">
                          {inc.label || '—'}
                        </span>
                        <span className="font-medium text-emerald-300">
                          {formatCurrency(inc.amount, currency)}
                        </span>
                        <span className="flex gap-0.5">
                          <button
                            onClick={() => startEdit(inc)}
                            title={t('edit')}
                            className="rounded p-1 text-neutral-600 hover:bg-neutral-800 hover:text-neutral-300"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => void onDelete(inc.id)}
                            title={t('delete')}
                            className="rounded p-1 text-neutral-600 hover:bg-red-950 hover:text-red-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      </li>
                    )
                  )}
                </ul>
              )}

              {/* Add form */}
              <div className="flex flex-wrap items-center gap-2 border-t border-neutral-800 pt-3">
                <input
                  type="date"
                  value={date}
                  min={minDate}
                  max={maxDate}
                  onChange={(e) => setDate(e.target.value)}
                  title={t('incomeDate')}
                  className={`${inputCls} [color-scheme:dark]`}
                />
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className={`${inputCls} w-24`}
                />
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void handleAdd()}
                  placeholder={t('incomeLabelPlaceholder')}
                  className={`${inputCls} min-w-0 flex-1`}
                />
                <button
                  onClick={() => void handleAdd()}
                  disabled={!canAdd}
                  className="flex items-center gap-1 rounded-md border border-emerald-800/60 bg-emerald-950/40 px-2.5 py-1.5 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-900/40 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('addIncome')}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
