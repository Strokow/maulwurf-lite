import { useState, useMemo, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Undo2,
  Redo2,
  Search,
  X,
  ArrowUpDown,
  ChevronDown,
  FolderPlus,
  Pencil,
  Trash2,
  Check as CheckIcon,
  Download,
  Settings as SettingsIcon,
  History as HistoryIcon,
} from 'lucide-react'
import type {
  Obligation,
  ObligationMonth,
  ObligationStatus,
  ObligationType,
  ObligationFrequency,
} from '../types'
import type { UseStoreReturn } from '../store/useStore'
import { useI18n } from '../i18n'
import {
  clampDayToMonth,
  formatLocalDate,
  effectiveAmount,
  getEffectiveStatus,
  isNativeActive,
  isInstallmentCompleted as engineInstallmentCompleted,
} from '../utils/obligationEngine'
import { ObligationCard } from './ObligationCard'
import { ObligationModal } from './ObligationModal'
import { SettingsModal } from './SettingsModal'
import { HistoryModal } from './HistoryModal'

interface ObligationsPageProps {
  store: UseStoreReturn
}

export function ObligationsPage({ store }: ObligationsPageProps): React.JSX.Element {
  const {
    obligations,
    obligationMonths,
    banks,
    customSections,
    undoHistory,
    redoStack,
    settings,
    addObligation: onAdd,
    updateObligation: onUpdate,
    deleteObligation: onDelete,
    setObligationStatus: onStatusChange,
    getObligationMonth: getMonthRecord,
    carryObligationDebt: onCarryDebt,
    setCarriedPaid: onSetCarriedPaid,
    returnCarriedObligation: onReturnCarried,
    undo: onUndo,
    redo: onRedo,
    pushUndo,
    addCustomSection: onAddSection,
    deleteCustomSection: onDeleteSection,
    renameCustomSection: onRenameSection,
  } = store

  const i18n = useI18n()
  const { t, tn, monthYear, formatCurrency, formatDateTime } = i18n
  const currency = settings.currency
  const fmt = (n: number): string => formatCurrency(n, currency)

  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Obligation | null>(null)
  const [preselectedType, setPreselectedType] = useState<ObligationType>('subscription')
  const [preselectedFrequency, setPreselectedFrequency] = useState<ObligationFrequency>('monthly')
  const [preselectedInstallment, setPreselectedInstallment] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [newSectionName, setNewSectionName] = useState('')
  const [showAddSection, setShowAddSection] = useState(false)
  const [renamingSectionId, setRenamingSectionId] = useState<string | null>(null)
  const [renamingSectionName, setRenamingSectionName] = useState('')
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  // Month navigation
  const [navYear, setNavYear] = useState(new Date().getFullYear())
  const [navMonth, setNavMonth] = useState(new Date().getMonth() + 1)

  // Search and filters
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'paid' | 'unpaid' | 'unknown'>('all')
  const [filterType, setFilterType] = useState<'all' | 'monthly' | 'yearly' | 'once'>('all')
  const [sortBy, setSortBy] = useState<'name' | 'amount' | 'date'>('name')

  // Collapsed built-in sections
  const [collapsedMonthly, setCollapsedMonthly] = useState(false)
  const [collapsedYearly, setCollapsedYearly] = useState(false)
  const [collapsedOnce, setCollapsedOnce] = useState(false)
  const [collapsedInstallments, setCollapsedInstallments] = useState(false)

  const now = useMemo(() => new Date(), [])
  const year = navYear
  const month = navMonth

  const bankById = useMemo(() => new Map(banks.map((b) => [b.id, b])), [banks])
  const currentMonthLabel = monthYear(year, month)

  const canGoPrev = true
  // Budget planning up to 3 months ahead.
  const canGoNext = useMemo(() => {
    const rn = new Date()
    const nextMonth = new Date(year, month, 1)
    return nextMonth <= new Date(rn.getFullYear(), rn.getMonth() + 3, 1)
  }, [year, month])

  // Obligations CARRIED INTO this month (an isCarriedOver record exists for the
  // nav month). Needed so once/yearly — which the native filter hides outside
  // their month — still show up in the carry target month and join the totals.
  const carriedInIds = useMemo(() => {
    const ids = new Set<string>()
    for (const m of obligationMonths) {
      if (m.isCarriedOver && m.year === year && m.month === month) ids.add(m.obligationId)
    }
    return ids
  }, [obligationMonths, year, month])

  const active = useMemo(
    () =>
      obligations.filter(
        (o) => isNativeActive(o, year, month) || (o.isActive && carriedInIds.has(o.id))
      ),
    [obligations, year, month, carriedInIds]
  )

  // For yearly obligations: find the month they were last paid and compute the
  // "paid until" window. Paid in month M of year Y → covered until month M-1 of Y+1.
  const yearlyPaidUntilMap = useMemo(() => {
    const map = new Map<
      string,
      { paidMonth: number; paidYear: number; untilMonth: number; untilYear: number }
    >()
    for (const o of active) {
      if (o.frequency !== 'yearly') continue
      let cy = year
      let cm = month
      for (let i = 0; i < 13; i++) {
        const rec = getMonthRecord(o.id, cy, cm)
        if (rec?.status === 'paid') {
          let untilMonth = cm - 1
          let untilYear = cy + 1
          if (untilMonth === 0) {
            untilMonth = 12
            untilYear--
          }
          map.set(o.id, { paidMonth: cm, paidYear: cy, untilMonth, untilYear })
          break
        }
        cm--
        if (cm === 0) {
          cm = 12
          cy--
        }
      }
    }
    return map
  }, [active, year, month, getMonthRecord])

  const isYearlyCovered = useCallback(
    (o: Obligation): boolean => {
      if (o.frequency !== 'yearly') return false
      const info = yearlyPaidUntilMap.get(o.id)
      if (!info) return false
      const paidYM = info.paidYear * 12 + info.paidMonth
      const untilYM = info.untilYear * 12 + info.untilMonth
      const currentYM = year * 12 + month
      return currentYM >= paidYM && currentYM <= untilYM
    },
    [yearlyPaidUntilMap, year, month]
  )

  // For every obligation in the nav month: where its debt was carried TO (if anywhere).
  const carryDestMap = useMemo(() => {
    const map = new Map<string, { toYear: number; toMonth: number }>()
    for (const m of obligationMonths) {
      if (m.isCarriedOver && m.carriedFromYear === year && m.carriedFromMonth === month) {
        map.set(m.obligationId, { toYear: m.year, toMonth: m.month })
      }
    }
    return map
  }, [obligationMonths, year, month])

  // Apply filters
  const filtered = useMemo(() => {
    return active.filter((o) => {
      // Hide obligations skipped for this specific month
      if (getMonthRecord(o.id, year, month)?.status === 'skipped') return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const bankName = o.bankId ? (bankById.get(o.bankId)?.name ?? '') : ''
        const text = `${o.name} ${o.notes ?? ''} ${bankName}`.toLowerCase()
        if (!text.includes(q)) return false
      }
      if (filterStatus !== 'all') {
        const rec = getMonthRecord(o.id, year, month)
        const status = getEffectiveStatus(o, rec)
        if (filterStatus === 'paid' && status !== 'paid') return false
        if (filterStatus === 'unpaid' && status !== 'unpaid') return false
        if (filterStatus === 'unknown' && status !== 'unknown') return false
      }
      if (filterType !== 'all') {
        const freq: ObligationFrequency = o.frequency ?? 'monthly'
        if (freq !== filterType) return false
      }
      return true
    })
  }, [active, searchQuery, filterStatus, filterType, year, month, getMonthRecord, bankById])

  // Sort: paid obligations sink to the bottom, then by the selected criterion
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const recA = getMonthRecord(a.id, year, month)
      const recB = getMonthRecord(b.id, year, month)
      const aPaid = recA?.status === 'paid' || (a.frequency === 'yearly' && isYearlyCovered(a))
      const bPaid = recB?.status === 'paid' || (b.frequency === 'yearly' && isYearlyCovered(b))
      if (aPaid !== bPaid) return aPaid ? 1 : -1
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      if (sortBy === 'amount') return (b.amount ?? 0) - (a.amount ?? 0)
      if (sortBy === 'date') return (b.approximateDay ?? 0) - (a.approximateDay ?? 0)
      return 0
    })
  }, [filtered, sortBy, getMonthRecord, year, month, isYearlyCovered])

  // Installments (any frequency) live in their own subsection and are excluded
  // from monthly/yearly/once — otherwise a one-time installment would land in
  // the "One-time" group.
  const monthlyObligations = sorted.filter(
    (o) => (o.frequency ?? 'monthly') === 'monthly' && !o.isInstallment && !o.sectionId && !o.parentId
  )
  const regularMonthlyUnpaid = monthlyObligations.filter(
    (o) => getMonthRecord(o.id, year, month)?.status !== 'paid'
  )
  const regularMonthlyPaid = monthlyObligations.filter(
    (o) => getMonthRecord(o.id, year, month)?.status === 'paid'
  )
  const installmentAll = sorted.filter((o) => o.isInstallment && !o.sectionId && !o.parentId)
  const yearlyObligations = sorted.filter(
    (o) => o.frequency === 'yearly' && !o.isInstallment && !o.sectionId && !o.parentId
  )
  const onceObligations = sorted.filter(
    (o) => o.frequency === 'once' && !o.isInstallment && !o.sectionId && !o.parentId
  )

  // Map installment obligation IDs to their count of paid month records
  const installmentPaidCountMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const o of obligations) {
      if (!o.isInstallment) continue
      map.set(
        o.id,
        obligationMonths.filter((m) => m.obligationId === o.id && m.status === 'paid').length
      )
    }
    return map
  }, [obligations, obligationMonths])

  // A completed plan stays visible as history but drops out of the header
  // totals and the paid/pending counters.
  const isInstallmentCompleted = useCallback(
    (o: Obligation): boolean => engineInstallmentCompleted(o, obligationMonths),
    [obligationMonths]
  )

  const sectionObligations = useMemo(() => {
    const map = new Map<string, Obligation[]>()
    for (const s of customSections) {
      map.set(
        s.id,
        sorted.filter((o) => o.sectionId === s.id && !o.parentId)
      )
    }
    return map
  }, [sorted, customSections])

  const totalMonthlyFiltered = useMemo(() => {
    return filtered.reduce((sum, o) => {
      // A completed installment plan owes nothing, but months after its last
      // payment have no record → the monthly default 'unpaid' would falsely
      // add its amount to "left to pay".
      if (isInstallmentCompleted(o)) return sum
      // Debt carried OUT of this month → fully excluded
      if (carryDestMap.has(o.id)) return sum

      const rec = getMonthRecord(o.id, year, month)

      if (o.frequency === 'yearly') {
        if (isYearlyCovered(o)) return sum
        if (o.yearlyMonth != null && o.yearlyMonth !== month) return sum
      }

      const base = effectiveAmount(o, year, month) ?? 0

      // Carry-over records: count each part separately. The month's own charge
      // is only added when the obligation is native here — obligations carried
      // into this month owe only the carried debt itself.
      if (rec?.isCarriedOver) {
        const carriedPart = rec.carriedPaid ? 0 : (rec.carriedAmount ?? 0)
        const nativeHere = isNativeActive(o, year, month)
        const currentPart = nativeHere && rec.status !== 'paid' ? base : 0
        const total = carriedPart + currentPart
        return total > 0 ? sum + total : sum
      }

      if (rec?.status === 'paid') return sum
      if (rec && rec.status === 'unknown') return sum
      // No record: monthly counts as unpaid, the rest are skipped
      if (!rec && getEffectiveStatus(o, null) === 'unknown') return sum

      return sum + base
    }, 0)
  }, [filtered, isYearlyCovered, getMonthRecord, year, month, carryDestMap, isInstallmentCompleted])

  const totalPaidFiltered = useMemo(() => {
    return filtered.reduce((sum, o) => {
      const rec = getMonthRecord(o.id, year, month)
      const base = effectiveAmount(o, year, month) ?? 0
      if (rec?.isCarriedOver) {
        const nativeHere = isNativeActive(o, year, month)
        const carriedPart = rec.carriedPaid ? (rec.carriedAmount ?? 0) : 0
        const currentPart = nativeHere && rec.status === 'paid' ? base : 0
        return sum + carriedPart + currentPart
      }
      if (rec?.status === 'paid') return sum + base
      return sum
    }, 0)
  }, [filtered, getMonthRecord, year, month])

  // Yearly total — natives only (yearly carried into this month gets no own charge).
  const yearlyTotal = yearlyObligations.reduce(
    (s, o) => s + (isNativeActive(o, year, month) ? (effectiveAmount(o, year, month) ?? 0) : 0),
    0
  )

  const paidCount = filtered.filter((o) => {
    // Completed plans are excluded — their paid mark for the current month is
    // import history, not a real user payment.
    if (isInstallmentCompleted(o)) return false
    const rec = getMonthRecord(o.id, year, month)
    return rec?.status === 'paid'
  }).length

  const pendingCount = filtered.filter((o) => {
    if (isInstallmentCompleted(o)) return false
    if (carryDestMap.has(o.id)) return false
    const rec = getMonthRecord(o.id, year, month)
    // Debt carried HERE: pending until settled; own charge only when native.
    if (rec?.isCarriedOver) {
      const nativeHere = isNativeActive(o, year, month)
      return !rec.carriedPaid || (nativeHere && rec.status !== 'paid')
    }
    if (o.frequency === 'yearly') {
      if (isYearlyCovered(o)) return false
      if (o.yearlyMonth != null && o.yearlyMonth !== month) return false
    }
    if (rec?.status === 'paid') return false
    if (rec && rec.status === 'unknown') return false
    if (!rec && o.frequency === 'yearly') return false
    return true
  }).length

  // Obligations due within 5 days that are not paid. Installments excluded —
  // their schedule is tracked by the plan progress itself.
  const dueWarnings = useMemo(() => {
    const today = new Date(now)
    today.setHours(0, 0, 0, 0)
    return active.filter((o) => {
      if (o.approximateDay === null) return false
      if (o.isInstallment) return false
      const rec = getMonthRecord(o.id, year, month)
      if (rec?.status === 'paid') return false
      const oMonth = today.getMonth()
      const oYear = today.getFullYear()
      let nextDate = new Date(oYear, oMonth, clampDayToMonth(oYear, oMonth, o.approximateDay))
      nextDate.setHours(0, 0, 0, 0)
      if (nextDate < today) {
        nextDate = new Date(oYear, oMonth + 1, clampDayToMonth(oYear, oMonth + 1, o.approximateDay))
      }
      const diff = Math.round((nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      return diff >= 0 && diff <= 5
    })
  }, [active, year, month, now, getMonthRecord])

  const handleOpenAdd = (
    type: ObligationType,
    frequency: ObligationFrequency = 'monthly',
    installment = false
  ): void => {
    setEditTarget(null)
    setPreselectedType(type)
    setPreselectedFrequency(frequency)
    setPreselectedInstallment(installment)
    setModalOpen(true)
  }

  const handleEdit = (o: Obligation): void => {
    setEditTarget(o)
    setModalOpen(true)
  }

  const handleDelete = (id: string): void => {
    setDeleteConfirm(id)
  }

  const handleSkipMonth = async (): Promise<void> => {
    if (deleteConfirm) {
      await onStatusChange(deleteConfirm, year, month, 'skipped')
      setDeleteConfirm(null)
    }
  }

  const confirmDelete = async (): Promise<void> => {
    if (deleteConfirm) {
      const target = obligations.find((o) => o.id === deleteConfirm)
      if (target) {
        pushUndo(
          t('actionDeleteObligation'),
          { obligations: [...obligations] },
          { obligations: obligations.filter((o) => o.id !== deleteConfirm) }
        )
      }
      await onDelete(deleteConfirm)
      setDeleteConfirm(null)
    }
  }

  const handleSave = async (
    o: Omit<Obligation, 'id' | 'createdAt'>,
    paidInstallments?: number,
    priceFromCurrentMonth?: boolean
  ): Promise<void> => {
    if (editTarget) {
      // "Change price only from the open month": leave the base amount alone,
      // add an effective-dated entry to amountChanges for the viewed month.
      let patch = o
      if (priceFromCurrentMonth && o.amount != null) {
        const key = `${year}-${String(month).padStart(2, '0')}`
        const prevChanges = (editTarget.amountChanges ?? []).filter((c) => c.from !== key)
        const newChanges = [...prevChanges, { from: key, amount: o.amount }].sort((a, b) =>
          a.from.localeCompare(b.from)
        )
        patch = { ...o, amount: editTarget.amount, amountChanges: newChanges }
      }
      pushUndo(
        t('actionEditObligation'),
        { obligations, obligationMonths },
        {
          obligations: obligations.map((ob) => (ob.id === editTarget.id ? { ...ob, ...patch } : ob)),
          obligationMonths,
        }
      )
      await onUpdate(editTarget.id, patch)

      // Installments: recalculate month records when the paid count changes
      if (editTarget.isInstallment && paidInstallments != null) {
        const currentPaid = installmentPaidCountMap.get(editTarget.id) ?? 0
        if (paidInstallments !== currentPaid) {
          const created = new Date(editTarget.createdAt)
          const sYear = created.getFullYear()
          const sMonth = created.getMonth() + 1
          // future-paid guard: months after the current real month can't be 'paid'
          const realNow = new Date()
          const curYM = realNow.getFullYear() * 12 + (realNow.getMonth() + 1)

          for (let i = 0; i < paidInstallments; i++) {
            let mYear = sYear
            let mMonth = sMonth + i
            while (mMonth > 12) {
              mMonth -= 12
              mYear++
            }
            if (mYear * 12 + mMonth > curYM) break
            const existing = obligationMonths.find(
              (m) => m.obligationId === editTarget.id && m.year === mYear && m.month === mMonth
            )
            if (existing?.status !== 'paid') {
              await onStatusChange(editTarget.id, mYear, mMonth, 'paid')
            }
          }

          if (paidInstallments < currentPaid) {
            const totalInst = o.totalInstallments ?? editTarget.totalInstallments ?? 999
            for (let i = paidInstallments; i < totalInst; i++) {
              let mYear = sYear
              let mMonth = sMonth + i
              while (mMonth > 12) {
                mMonth -= 12
                mYear++
              }
              const existing = obligationMonths.find(
                (m) => m.obligationId === editTarget.id && m.year === mYear && m.month === mMonth
              )
              if (existing?.status === 'paid') {
                await onStatusChange(editTarget.id, mYear, mMonth, 'unpaid')
              }
            }
          }
        }
      }
    } else {
      const beforeObligations = [...obligations]
      const beforeMonths = [...obligationMonths]
      const realNow = new Date()
      const realYear = realNow.getFullYear()
      const realMonth = realNow.getMonth() + 1
      const isViewingCurrent = year === realYear && month === realMonth

      if (o.isInstallment && paidInstallments != null && paidInstallments > 0) {
        // The plan started `paidInstallments` months before the viewed month:
        // payments 1..paid occupy the months before it, the viewed month is the
        // next (unpaid) installment.
        let sY = year
        let sM = month - paidInstallments
        while (sM <= 0) {
          sM += 12
          sY--
        }
        const createdAt = new Date(sY, sM - 1, 1).toISOString()
        const newObligation = await onAdd(o, createdAt)
        const curYM = realYear * 12 + realMonth
        const newRecords: ObligationMonth[] = []
        for (let i = 0; i < paidInstallments; i++) {
          let mY = sY
          let mM = sM + i
          while (mM > 12) {
            mM -= 12
            mY++
          }
          // future-paid guard: months after the current real month can't be 'paid'
          if (mY * 12 + mM > curYM) break
          await onStatusChange(newObligation.id, mY, mM, 'paid', true)
          newRecords.push({
            obligationId: newObligation.id,
            year: mY,
            month: mM,
            status: 'paid',
            actualAmount: null,
            paidDate: formatLocalDate(new Date()),
          })
        }
        await onStatusChange(newObligation.id, year, month, 'unpaid', true)
        newRecords.push({
          obligationId: newObligation.id,
          year,
          month,
          status: 'unpaid',
          actualAmount: null,
        })
        // One combined undo entry removes both the obligation and its records.
        pushUndo(
          t('actionAddObligation'),
          { obligations: beforeObligations, obligationMonths: beforeMonths },
          {
            obligations: [...beforeObligations, newObligation],
            obligationMonths: [...beforeMonths, ...newRecords],
          }
        )
      } else {
        // Bind createdAt to the viewed month when it isn't the current one — the
        // obligation then appears exactly in the open month (past OR future) and
        // once obligations don't leak into the wrong month.
        const targetCreatedAt = isViewingCurrent
          ? undefined
          : new Date(year, month - 1, 1).toISOString()
        const newObligation = await onAdd(o, targetCreatedAt)
        await onStatusChange(newObligation.id, year, month, 'unpaid', true)
        const record: ObligationMonth = {
          obligationId: newObligation.id,
          year,
          month,
          status: 'unpaid',
          actualAmount: null,
        }
        pushUndo(
          t('actionAddObligation'),
          { obligations: beforeObligations, obligationMonths: beforeMonths },
          {
            obligations: [...beforeObligations, newObligation],
            obligationMonths: [...beforeMonths, record],
          }
        )
      }
    }
  }

  const handleStatusToggle = async (
    obligationId: string,
    status: ObligationStatus
  ): Promise<void> => {
    const currentRecord = getMonthRecord(obligationId, year, month)
    const beforeState = { obligationMonths: [...obligationMonths] }

    // skipUndo=true: the inner calls don't write their own undo — below we push
    // ONE combined entry for the whole operation (status + children + carry-over
    // auto-resolve). Otherwise one click would produce 2+ undo entries.
    await onStatusChange(obligationId, year, month, status, true)

    // When marking as 'paid', also settle consecutive unpaid previous months
    // (up to 3) of monthly obligations.
    const carryoverMonthsToPay: Array<{ y: number; m: number; oId: string }> = []
    const collectCarryover = (oId: string): void => {
      const obligation = obligations.find((o) => o.id === oId)
      if (obligation && obligation.frequency !== 'yearly' && obligation.frequency !== 'once') {
        const createdDate = new Date(obligation.createdAt)
        const cYear = createdDate.getFullYear()
        const cMonth = createdDate.getMonth() + 1
        const MAX_CARRY = 3
        let cy = year
        let cm = month - 1
        if (cm === 0) {
          cm = 12
          cy--
        }
        for (let i = 0; i < MAX_CARRY; i++) {
          if (cy < cYear || (cy === cYear && cm < cMonth)) break
          const rec = obligationMonths.find(
            (r) => r.obligationId === oId && r.year === cy && r.month === cm
          )
          if (rec?.status !== 'unpaid') break
          carryoverMonthsToPay.push({ y: cy, m: cm, oId })
          cm--
          if (cm === 0) {
            cm = 12
            cy--
          }
        }
      }
    }
    // Do NOT auto-resolve previous months for isCarriedOver records: the user
    // carried the debt explicitly — the source month must stay 'unpaid'.
    if (status === 'paid' && !currentRecord?.isCarriedOver) {
      collectCarryover(obligationId)
    }

    // Linked children: propagate the status to all children of this obligation
    const childObligations = obligations.filter((o) => o.parentId === obligationId)
    for (const child of childObligations) {
      const childRecord = getMonthRecord(child.id, year, month)
      await onStatusChange(child.id, year, month, status, true)
      if (status === 'paid' && !childRecord?.isCarriedOver) {
        collectCarryover(child.id)
      }
    }

    for (const { y, m, oId } of carryoverMonthsToPay) {
      await onStatusChange(oId, y, m, 'paid', true)
    }

    // After the change, push one undo entry with the correct before/after
    const afterRecord: ObligationMonth = {
      ...(currentRecord ?? {}),
      obligationId,
      year,
      month,
      status,
      actualAmount: currentRecord?.actualAmount ?? null,
      paidDate: status === 'paid' ? formatLocalDate(new Date()) : undefined,
    }
    let afterMonths = obligationMonths
      .filter((m) => !(m.obligationId === obligationId && m.year === year && m.month === month))
      .concat(afterRecord)
    for (const child of childObligations) {
      afterMonths = afterMonths
        .filter((r) => !(r.obligationId === child.id && r.year === year && r.month === month))
        .concat({
          obligationId: child.id,
          year,
          month,
          status,
          actualAmount: null,
          paidDate: status === 'paid' ? formatLocalDate(new Date()) : undefined,
        })
    }
    for (const { y, m, oId } of carryoverMonthsToPay) {
      afterMonths = afterMonths
        .filter((r) => !(r.obligationId === oId && r.year === y && r.month === m))
        .concat({
          obligationId: oId,
          year: y,
          month: m,
          status: 'paid',
          actualAmount: null,
          paidDate: formatLocalDate(new Date()),
        })
    }
    pushUndo(t('actionStatusChange'), beforeState, { obligationMonths: afterMonths })
  }

  const handleCopyToMonth = async (
    obligation: Obligation,
    targetYear: number,
    targetMonth: number
  ): Promise<void> => {
    const { id: _id, createdAt: _createdAt, ...rest } = obligation
    const targetCreatedAt = new Date(targetYear, targetMonth - 1, 1).toISOString()
    const beforeObligations = [...obligations]
    const newObligation = await onAdd(rest, targetCreatedAt)
    pushUndo(
      t('actionCopyObligation'),
      { obligations: beforeObligations },
      { obligations: [...beforeObligations, newObligation] }
    )
  }

  const handlePrevMonth = (): void => {
    if (month === 1) {
      setNavMonth(12)
      setNavYear(year - 1)
    } else {
      setNavMonth(month - 1)
    }
  }

  const handleNextMonth = (): void => {
    if (canGoNext) {
      if (month === 12) {
        setNavMonth(1)
        setNavYear(year + 1)
      } else {
        setNavMonth(month + 1)
      }
    }
  }

  const resetFilters = (): void => {
    setSearchQuery('')
    setFilterStatus('all')
    setFilterType('all')
    setSortBy('name')
  }

  // ── Drag-and-drop between sections + auto-scroll ──────────
  const [dragOverSection, setDragOverSection] = useState<string | null>(null)
  const dragYRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const scrollLoopRef = useRef<() => void>(() => {})
  scrollLoopRef.current = () => {
    const y = dragYRef.current
    if (y === null) return
    const ZONE = 120
    const MAX_SPEED = 14
    const h = window.innerHeight
    if (y < ZONE) {
      const f = 1 - y / ZONE
      window.scrollBy({ top: -Math.round(MAX_SPEED * f * f), behavior: 'instant' as ScrollBehavior })
    } else if (y > h - ZONE) {
      const f = 1 - (h - y) / ZONE
      window.scrollBy({ top: Math.round(MAX_SPEED * f * f), behavior: 'instant' as ScrollBehavior })
    }
    rafRef.current = requestAnimationFrame(scrollLoopRef.current)
  }

  const handleDragStart = useCallback((e: React.DragEvent, obligationId: string) => {
    e.dataTransfer.setData('text/plain', obligationId)
    e.dataTransfer.effectAllowed = 'all'
    dragYRef.current = e.clientY
    document.body.style.setProperty('cursor', 'grabbing', 'important')
    rafRef.current = requestAnimationFrame(scrollLoopRef.current)
  }, [])

  const handleDrag = useCallback((e: React.DragEvent) => {
    if (e.clientY !== 0) dragYRef.current = e.clientY
  }, [])

  const handleDragEnd = useCallback(() => {
    dragYRef.current = null
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    document.body.style.cursor = ''
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, section: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverSection(section)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOverSection(null)
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetSection: string) => {
      e.preventDefault()
      setDragOverSection(null)
      const obligationId = e.dataTransfer.getData('text/plain')
      const obligation = obligations.find((o) => o.id === obligationId)
      if (!obligation) return

      let patch: Partial<Obligation> | null = null
      if (targetSection === 'monthly') {
        if ((obligation.frequency ?? 'monthly') === 'monthly' && !obligation.sectionId && !obligation.parentId)
          return
        patch = { frequency: 'monthly', sectionId: undefined, parentId: undefined }
      } else if (targetSection === 'yearly') {
        if (obligation.frequency === 'yearly' && !obligation.sectionId && !obligation.parentId) return
        patch = { frequency: 'yearly', sectionId: undefined, parentId: undefined }
      } else if (targetSection === 'once') {
        if (obligation.frequency === 'once' && !obligation.sectionId && !obligation.parentId) return
        patch = { frequency: 'once', sectionId: undefined, parentId: undefined }
      } else {
        if (obligation.sectionId === targetSection && !obligation.parentId) return
        patch = { sectionId: targetSection, parentId: undefined }
      }
      if (!patch) return

      // Drag-drop is undoable: without this, undo/redo desynchronised
      // frequency/sectionId and the obligation "got lost".
      const beforeObligations = [...obligations]
      await onUpdate(obligationId, patch)
      pushUndo(
        t('actionMoveObligation'),
        { obligations: beforeObligations },
        { obligations: beforeObligations.map((o) => (o.id === obligationId ? { ...o, ...patch } : o)) }
      )
    },
    [obligations, onUpdate, pushUndo, t]
  )

  const handleAddSection = useCallback(async () => {
    const name = newSectionName.trim()
    if (!name) return
    await onAddSection(name)
    setNewSectionName('')
    setShowAddSection(false)
  }, [newSectionName, onAddSection])

  const handleRenameSection = useCallback(
    async (id: string) => {
      const name = renamingSectionName.trim()
      if (!name) return
      await onRenameSection(id, name)
      setRenamingSectionId(null)
      setRenamingSectionName('')
    },
    [renamingSectionName, onRenameSection]
  )

  // ── Linked obligations: drop onto a card to link as a child ──
  const [linkDropTarget, setLinkDropTarget] = useState<string | null>(null)
  const [childAreaDropTarget, setChildAreaDropTarget] = useState<string | null>(null)

  const handleChildAreaDragOver = useCallback((e: React.DragEvent, parentId: string) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'link'
    setChildAreaDropTarget(parentId)
  }, [])

  const handleChildAreaDragLeave = useCallback((e: React.DragEvent) => {
    e.stopPropagation()
    setChildAreaDropTarget(null)
  }, [])

  const handleChildAreaDrop = useCallback(
    async (e: React.DragEvent, parentId: string) => {
      e.preventDefault()
      e.stopPropagation()
      setChildAreaDropTarget(null)
      const draggedId = e.dataTransfer.getData('text/plain')
      if (!draggedId || draggedId === parentId) return
      const dragged = obligations.find((o) => o.id === draggedId)
      const target = obligations.find((o) => o.id === parentId)
      if (!dragged || !target || target.parentId) return
      if (obligations.some((o) => o.parentId === draggedId)) return // parents can't be moved
      if (dragged.parentId === parentId) return // already a child
      await onUpdate(draggedId, { parentId })
    },
    [obligations, onUpdate]
  )

  const handleCardDragOver = useCallback((e: React.DragEvent, targetObligationId: string) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'link'
    setLinkDropTarget(targetObligationId)
  }, [])

  const handleCardDragLeave = useCallback((e: React.DragEvent) => {
    e.stopPropagation()
    setLinkDropTarget(null)
  }, [])

  const handleCardDrop = useCallback(
    async (e: React.DragEvent, targetObligationId: string) => {
      e.preventDefault()
      e.stopPropagation()
      setLinkDropTarget(null)
      const draggedId = e.dataTransfer.getData('text/plain')
      if (!draggedId || draggedId === targetObligationId) return

      const dragged = obligations.find((o) => o.id === draggedId)
      const target = obligations.find((o) => o.id === targetObligationId)
      if (!dragged || !target) return

      // No self-links, no linking to a card that is itself a child, and a
      // parent that already has children can't become someone's child.
      if (target.parentId) return
      if (obligations.some((o) => o.parentId === draggedId)) return

      await onUpdate(draggedId, { parentId: targetObligationId })
    },
    [obligations, onUpdate]
  )

  const handleUnlink = useCallback(
    async (obligationId: string) => {
      await onUpdate(obligationId, { parentId: undefined })
    },
    [onUpdate]
  )

  const childrenMap = useMemo(() => {
    const map = new Map<string, Obligation[]>()
    for (const o of obligations) {
      if (o.parentId && o.isActive) {
        const list = map.get(o.parentId) ?? []
        list.push(o)
        map.set(o.parentId, list)
      }
    }
    return map
  }, [obligations])

  const toggleSectionCollapse = useCallback((sectionId: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return next
    })
  }, [])

  // ── Handlers for partial payment of a carried debt ────────
  const handlePayCarried = useCallback(
    async (obligationId: string) => {
      await onSetCarriedPaid(obligationId, year, month, true)
    },
    [onSetCarriedPaid, year, month]
  )

  const handleReturnCarried = useCallback(
    async (obligationId: string) => {
      await onReturnCarried(obligationId, year, month)
    },
    [onReturnCarried, year, month]
  )

  const handlePayAll = useCallback(
    async (obligationId: string) => {
      await onStatusChange(obligationId, year, month, 'paid')
      await onSetCarriedPaid(obligationId, year, month, true)
    },
    [onStatusChange, onSetCarriedPaid, year, month]
  )

  // ── Render one obligation card together with its linked children ──
  const renderObligationWithChildren = useCallback(
    (o: Obligation) => {
      const children = childrenMap.get(o.id) ?? []
      const isParent = children.length > 0

      // The carry button is available to ANY frequency; the target month is
      // chosen in the card's picker (future months only).
      const getCarryHandler = (ob: Obligation): ((toY: number, toM: number) => void) | undefined => {
        if (carryDestMap.has(ob.id)) return undefined // already carried OUT of this month
        return (toY, toM) => {
          void onCarryDebt(ob.id, year, month, toY, toM)
        }
      }

      const carryDest = carryDestMap.get(o.id)

      const cardProps = (ob: Obligation) => ({
        obligation: ob,
        currentMonthRecord: getMonthRecord(ob.id, year, month),
        bank: ob.bankId ? bankById.get(ob.bankId) : undefined,
        currency,
        yearlyPaidUntil: yearlyPaidUntilMap.get(ob.id),
        onEdit: handleEdit,
        onDelete: handleDelete,
        onStatusChange: handleStatusToggle,
        onCopy: handleCopyToMonth,
        installmentPaidCount: installmentPaidCountMap.get(ob.id),
        onCarryDebt: getCarryHandler(ob),
        onPayCarried: () => void handlePayCarried(ob.id),
        onPayAll: () => void handlePayAll(ob.id),
        onReturnCarried: () => void handleReturnCarried(ob.id),
        effectiveAmt: effectiveAmount(ob, year, month),
        navYear: year,
        navMonth: month,
        occursNatively: isNativeActive(ob, year, month),
      })

      return (
        <div key={o.id}>
          <div
            draggable
            onDragStart={(e) => handleDragStart(e, o.id)}
            onDrag={handleDrag}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleCardDragOver(e, o.id)}
            onDragLeave={handleCardDragLeave}
            onDrop={(e) => void handleCardDrop(e, o.id)}
            className={`cursor-grab transition-all active:cursor-grabbing ${
              linkDropTarget === o.id ? 'rounded-xl ring-2 ring-blue-500' : ''
            }`}
          >
            <ObligationCard
              {...cardProps(o)}
              isParent={isParent}
              childCount={children.length}
              carriedToYear={carryDest?.toYear}
              carriedToMonth={carryDest?.toMonth}
            />
          </div>
          {children.length > 0 && (
            <div
              className={`ml-6 mt-1 border-l-2 pb-1 pl-3 transition-colors ${
                childAreaDropTarget === o.id ? 'border-blue-500/60' : 'border-blue-800/40'
              }`}
              onDragOver={(e) => handleChildAreaDragOver(e, o.id)}
              onDragLeave={handleChildAreaDragLeave}
              onDrop={(e) => void handleChildAreaDrop(e, o.id)}
            >
              <div className="space-y-1">
                {children.map((child) => {
                  const childCarryDest = carryDestMap.get(child.id)
                  return (
                    <div
                      key={child.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, child.id)}
                      onDrag={handleDrag}
                      onDragEnd={handleDragEnd}
                      className="cursor-grab active:cursor-grabbing"
                    >
                      <ObligationCard
                        {...cardProps(child)}
                        isChild
                        parentName={o.name}
                        onUnlink={handleUnlink}
                        carriedToYear={childCarryDest?.toYear}
                        carriedToMonth={childCarryDest?.toMonth}
                      />
                    </div>
                  )
                })}
              </div>
              <div
                className={`mt-1 select-none rounded border border-dashed px-3 py-1 text-center text-xs transition-all ${
                  childAreaDropTarget === o.id
                    ? 'border-blue-500/60 bg-blue-950/20 text-blue-400/80'
                    : 'border-neutral-800/60 text-neutral-700'
                }`}
              >
                {t('dropToLink')}
              </div>
            </div>
          )}
        </div>
      )
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      childrenMap,
      linkDropTarget,
      childAreaDropTarget,
      handleDragStart,
      handleDrag,
      handleDragEnd,
      handleCardDragOver,
      handleCardDragLeave,
      handleCardDrop,
      handleChildAreaDragOver,
      handleChildAreaDragLeave,
      handleChildAreaDrop,
      getMonthRecord,
      year,
      month,
      bankById,
      currency,
      carryDestMap,
      yearlyPaidUntilMap,
      installmentPaidCountMap,
      handleUnlink,
      onCarryDebt,
      handlePayCarried,
      handlePayAll,
      handleReturnCarried,
      t,
    ]
  )

  // ── Export helpers (MD + PDF) ─────────────────────────────
  interface ExportData {
    allSorted: Obligation[]
    monthlyAll: Obligation[]
    installmentsAllGroup: Obligation[]
    yearlyAll: Obligation[]
    onceAll: Obligation[]
    totalPayable: number
    totalPaidAmt: number
    paidCountAll: number
    pendingCountAll: number
  }

  const buildExportData = useCallback((): ExportData => {
    // Export uses ALL active obligations, ignoring the current filter/search state
    const allSorted = [...active].sort((a, b) => a.name.localeCompare(b.name))
    const monthlyAll = allSorted.filter(
      (o) => (o.frequency ?? 'monthly') === 'monthly' && !o.isInstallment && !o.sectionId && !o.parentId
    )
    const installmentsAllGroup = allSorted.filter(
      (o) => o.isInstallment && !o.sectionId && !o.parentId
    )
    const yearlyAll = allSorted.filter(
      (o) => o.frequency === 'yearly' && !o.isInstallment && !o.sectionId && !o.parentId
    )
    const onceAll = allSorted.filter(
      (o) => o.frequency === 'once' && !o.isInstallment && !o.sectionId && !o.parentId
    )

    const totalPayable = allSorted.reduce((sum, o) => {
      if (isInstallmentCompleted(o)) return sum
      if (carryDestMap.has(o.id)) return sum
      const rec = getMonthRecord(o.id, year, month)
      if (o.frequency === 'yearly') {
        if (isYearlyCovered(o)) return sum
        if (o.yearlyMonth != null && o.yearlyMonth !== month) return sum
      }
      const base = effectiveAmount(o, year, month) ?? 0
      if (rec?.isCarriedOver) {
        const nativeHere = isNativeActive(o, year, month)
        const cp = rec.carriedPaid ? 0 : (rec.carriedAmount ?? 0)
        const cur = nativeHere && rec.status !== 'paid' ? base : 0
        const total = cp + cur
        return total > 0 ? sum + total : sum
      }
      if (rec?.status === 'paid') return sum
      if (rec && rec.status === 'unknown') return sum
      if (!rec && o.frequency === 'yearly') return sum
      return sum + base
    }, 0)

    const totalPaidAmt = allSorted.reduce((sum, o) => {
      const rec = getMonthRecord(o.id, year, month)
      const base = effectiveAmount(o, year, month) ?? 0
      if (rec?.isCarriedOver) {
        const nativeHere = isNativeActive(o, year, month)
        return (
          sum +
          (rec.carriedPaid ? (rec.carriedAmount ?? 0) : 0) +
          (nativeHere && rec.status === 'paid' ? base : 0)
        )
      }
      return rec?.status === 'paid' ? sum + base : sum
    }, 0)

    const paidCountAll = allSorted.filter((o) => {
      if (isInstallmentCompleted(o)) return false
      return getMonthRecord(o.id, year, month)?.status === 'paid'
    }).length

    const pendingCountAll = allSorted.filter((o) => {
      if (isInstallmentCompleted(o)) return false
      if (carryDestMap.has(o.id)) return false
      const rec = getMonthRecord(o.id, year, month)
      if (rec?.isCarriedOver) {
        const nativeHere = isNativeActive(o, year, month)
        return !rec.carriedPaid || (nativeHere && rec.status !== 'paid')
      }
      if (o.frequency === 'yearly') {
        if (isYearlyCovered(o)) return false
        if (o.yearlyMonth != null && o.yearlyMonth !== month) return false
      }
      if (rec?.status === 'paid') return false
      if (rec && rec.status === 'unknown') return false
      if (!rec && o.frequency === 'yearly') return false
      return true
    }).length

    return {
      allSorted,
      monthlyAll,
      installmentsAllGroup,
      yearlyAll,
      onceAll,
      totalPayable,
      totalPaidAmt,
      paidCountAll,
      pendingCountAll,
    }
  }, [active, carryDestMap, getMonthRecord, isInstallmentCompleted, isYearlyCovered, year, month])

  const statusLabel = useCallback(
    (s: ObligationStatus): string =>
      ({
        paid: t('statusPaid'),
        unpaid: t('statusUnpaid'),
        unknown: t('statusUnknown'),
        skipped: t('statusSkipped'),
      })[s] ?? t('statusUnknown'),
    [t]
  )

  const freqLabel = useCallback(
    (f?: ObligationFrequency): string =>
      f === 'yearly'
        ? t('exportFrequencyYearly')
        : f === 'once'
          ? t('exportFrequencyOnce')
          : t('exportFrequencyMonthly'),
    [t]
  )

  const exportStamp = (): string => {
    const d = new Date()
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getFullYear()).slice(-2)}`
  }

  const handleExportMD = useCallback(async () => {
    const data = buildExportData()

    // Rows for one obligation: the main row (when native this month) + a
    // separate row for a debt carried HERE + children recursively underneath.
    const rowsFor = (o: Obligation, isChildRow: boolean): string[] => {
      const out: string[] = []
      const rec = getMonthRecord(o.id, year, month)
      const nativeHere = isNativeActive(o, year, month)
      const transferredOut = carryDestMap.get(o.id)
      const name = ((isChildRow ? '↳ ' : '') + o.name).replace(/\|/g, '\\|')
      const dayStr = o.approximateDay !== null ? `~${o.approximateDay}` : ''
      const notes = (o.notes ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
      if (nativeHere) {
        if (transferredOut) {
          out.push(
            `| ${name} | ${freqLabel(o.frequency)} | — | ${dayStr} | ${t('exportCarriedTo', { month: monthYear(transferredOut.toYear, transferredOut.toMonth) })} | ${notes} |`
          )
        } else {
          const st = isYearlyCovered(o)
            ? 'paid'
            : ((rec?.status ?? (o.frequency === 'yearly' ? 'unknown' : 'unpaid')) as ObligationStatus)
          const ea = effectiveAmount(o, year, month)
          const amt = ea !== null ? fmt(ea) : '—'
          out.push(
            `| ${name} | ${freqLabel(o.frequency)} | ${amt} | ${dayStr} | ${statusLabel(st)} | ${notes} |`
          )
        }
      }
      if (rec?.isCarriedOver && rec.carriedAmount != null && !transferredOut) {
        const dSt: ObligationStatus = rec.carriedPaid ? 'paid' : 'unpaid'
        const from = t('exportDebtFrom', {
          month: monthYear(rec.carriedFromYear ?? 0, rec.carriedFromMonth ?? 1),
        })
        out.push(
          `| ${name} (${from}) | ${freqLabel(o.frequency)} | ${fmt(rec.carriedAmount)} | | ${statusLabel(dSt)} | ${t('exportCarried')} |`
        )
      }
      for (const child of childrenMap.get(o.id) ?? []) out.push(...rowsFor(child, true))
      return out
    }

    const renderGroupMd = (title: string, items: Obligation[]): string => {
      if (items.length === 0) return ''
      const rows = items.flatMap((o) => rowsFor(o, false)).join('\n')
      if (!rows) return ''
      return `\n## ${title} (${items.length})\n\n| ${t('exportColName')} | ${t('exportColFrequency')} | ${t('exportColAmount')} | ${t('exportColDay')} | ${t('exportColStatus')} | ${t('exportColNotes')} |\n|---|---|---|---|---|---|\n${rows}\n`
    }

    const allCustomMd = customSections
      .map((s) =>
        renderGroupMd(
          s.name,
          data.allSorted.filter((o) => o.sectionId === s.id)
        )
      )
      .join('')

    const md = [
      `# ${t('exportTitle', { month: currentMonthLabel })}`,
      ``,
      t('exportGenerated', { date: formatDateTime(new Date()) }),
      ``,
      `## ${t('exportTotals')}`,
      ``,
      `| ${t('exportMetric')} | ${t('exportValue')} |`,
      `|---|---|`,
      `| ${t('exportTotalPayable')} | ${fmt(data.totalPayable)} |`,
      `| ${t('exportPaid')} | ${fmt(data.totalPaidAmt)} (${tn('exportPositions', data.paidCountAll)}) |`,
      `| ${t('exportPending')} | ${data.pendingCountAll} |`,
      renderGroupMd(t('sectionMonthly'), data.monthlyAll),
      renderGroupMd(t('sectionInstallments'), data.installmentsAllGroup),
      renderGroupMd(t('sectionYearly'), data.yearlyAll),
      renderGroupMd(t('sectionOnce'), data.onceAll),
      allCustomMd,
    ].join('\n')

    await window.api.exportMd(md, `${t('exportFileName', { date: exportStamp() })}.md`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    buildExportData,
    customSections,
    getMonthRecord,
    year,
    month,
    currentMonthLabel,
    carryDestMap,
    isYearlyCovered,
    childrenMap,
    t,
    tn,
    monthYear,
    formatDateTime,
    freqLabel,
    statusLabel,
  ])

  const handleExportPDF = useCallback(async () => {
    const data = buildExportData()
    const statusBadge = (s: ObligationStatus): string => {
      const colors: Record<ObligationStatus, string> = {
        paid: '#16a34a',
        unpaid: '#dc2626',
        unknown: '#6b7280',
        skipped: '#6b7280',
      }
      return `<span style="color:${colors[s]};font-weight:600">${statusLabel(s)}</span>`
    }
    const td = 'padding:8px 12px;border-bottom:1px solid #ddd'

    const rowsFor = (o: Obligation, isChildRow: boolean): string[] => {
      const out: string[] = []
      const rec = getMonthRecord(o.id, year, month)
      const nativeHere = isNativeActive(o, year, month)
      const transferredOut = carryDestMap.get(o.id)
      const name = (isChildRow ? '↳ ' : '') + o.name
      const dayStr = o.approximateDay !== null ? `~${o.approximateDay}` : ''
      if (nativeHere) {
        if (transferredOut) {
          out.push(`<tr>
          <td style="${td}">${name}</td>
          <td style="${td}">${freqLabel(o.frequency)}</td>
          <td style="${td}">—</td>
          <td style="${td}">${dayStr}</td>
          <td style="${td};color:#b45309">${t('exportCarriedTo', { month: monthYear(transferredOut.toYear, transferredOut.toMonth) })}</td>
          <td style="${td};color:#666">${o.notes ?? ''}</td>
        </tr>`)
        } else {
          const st = isYearlyCovered(o)
            ? 'paid'
            : ((rec?.status ?? (o.frequency === 'yearly' ? 'unknown' : 'unpaid')) as ObligationStatus)
          const ea = effectiveAmount(o, year, month)
          const amt = ea !== null ? fmt(ea) : '—'
          out.push(`<tr>
          <td style="${td}">${name}</td>
          <td style="${td}">${freqLabel(o.frequency)}</td>
          <td style="${td}">${amt}</td>
          <td style="${td}">${dayStr}</td>
          <td style="${td}">${statusBadge(st)}</td>
          <td style="${td};color:#666">${o.notes ?? ''}</td>
        </tr>`)
        }
      }
      if (rec?.isCarriedOver && rec.carriedAmount != null && !transferredOut) {
        const dSt: ObligationStatus = rec.carriedPaid ? 'paid' : 'unpaid'
        const from = t('exportDebtFrom', {
          month: monthYear(rec.carriedFromYear ?? 0, rec.carriedFromMonth ?? 1),
        })
        out.push(`<tr>
          <td style="${td};color:#b45309">${name} <span style="font-size:11px">(${from})</span></td>
          <td style="${td}">${freqLabel(o.frequency)}</td>
          <td style="${td}">${fmt(rec.carriedAmount)}</td>
          <td style="${td}"></td>
          <td style="${td}">${statusBadge(dSt)}</td>
          <td style="${td};color:#666">${t('exportCarried')}</td>
        </tr>`)
      }
      for (const child of childrenMap.get(o.id) ?? []) out.push(...rowsFor(child, true))
      return out
    }

    const renderGroup = (title: string, items: Obligation[]): string => {
      if (items.length === 0) return ''
      const rows = items.flatMap((o) => rowsFor(o, false)).join('')
      return `<h2 style="margin:24px 0 8px;color:#111">${title} <span style="color:#666;font-size:14px">(${items.length})</span></h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="text-align:left;color:#666;border-bottom:2px solid #bbb">
            <th style="padding:8px 12px">${t('exportColName')}</th>
            <th style="padding:8px 12px">${t('exportColFrequency')}</th>
            <th style="padding:8px 12px">${t('exportColAmount')}</th>
            <th style="padding:8px 12px">${t('exportColDay')}</th>
            <th style="padding:8px 12px">${t('exportColStatus')}</th>
            <th style="padding:8px 12px">${t('exportColNotes')}</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>`
    }

    const allCustom = customSections
      .map((s) =>
        renderGroup(
          s.name,
          data.allSorted.filter((o) => o.sectionId === s.id)
        )
      )
      .join('')

    const html = `<!DOCTYPE html>
<html lang="${i18n.language}">
<head>
  <meta charset="UTF-8">
  <title>${t('exportTitle', { month: currentMonthLabel })}</title>
  <style>
    body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; background: #fff; color: #111; padding: 32px; max-width: 900px; margin: 0 auto; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    .meta { color: #666; font-size: 13px; margin-bottom: 24px; }
    .stats { display: flex; gap: 16px; margin-bottom: 24px; }
    .stat { flex: 1; background: #f5f5f5; border: 1px solid #ddd; border-radius: 12px; padding: 16px; }
    .stat-label { font-size: 11px; color: #666; text-transform: uppercase; }
    .stat-value { font-size: 22px; font-weight: 700; margin-top: 4px; }
    table { color: #222; }
    h2 { color: #111; }
  </style>
</head>
<body>
  <h1>${t('exportTitle', { month: currentMonthLabel })}</h1>
  <p class="meta">${t('exportGenerated', { date: formatDateTime(new Date()) })}</p>
  <div class="stats">
    <div class="stat">
      <div class="stat-label">${t('exportTotalPayable')}</div>
      <div class="stat-value">${fmt(data.totalPayable)}</div>
    </div>
    <div class="stat">
      <div class="stat-label">${t('exportPaid')}</div>
      <div class="stat-value" style="color:#16a34a">${fmt(data.totalPaidAmt)}</div>
      <div style="font-size:12px;color:#666;margin-top:4px">${tn('exportPositions', data.paidCountAll)}</div>
    </div>
    <div class="stat">
      <div class="stat-label">${t('exportPending')}</div>
      <div class="stat-value" style="color:${data.pendingCountAll > 0 ? '#dc2626' : '#16a34a'}">${data.pendingCountAll}</div>
    </div>
  </div>
  ${renderGroup(t('sectionMonthly'), data.monthlyAll)}
  ${renderGroup(t('sectionInstallments'), data.installmentsAllGroup)}
  ${renderGroup(t('sectionYearly'), data.yearlyAll)}
  ${renderGroup(t('sectionOnce'), data.onceAll)}
  ${allCustom}
</body>
</html>`

    await window.api.exportPdf(html, `${t('exportFileName', { date: exportStamp() })}.pdf`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    buildExportData,
    customSections,
    getMonthRecord,
    year,
    month,
    currentMonthLabel,
    carryDestMap,
    isYearlyCovered,
    childrenMap,
    t,
    tn,
    monthYear,
    formatDateTime,
    freqLabel,
    statusLabel,
    i18n.language,
  ])

  const sectionHeaderBtn =
    'flex items-center gap-1 px-2 py-1 text-xs rounded bg-neutral-800 text-neutral-400 hover:text-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed'

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Header: title, month navigation, actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold text-neutral-200">{t('obligations')}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevMonth}
              disabled={!canGoPrev}
              title={t('prevMonth')}
              className="rounded p-1 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="min-w-32 text-center text-sm font-medium capitalize text-neutral-300">
              {currentMonthLabel}
            </span>
            <button
              onClick={handleNextMonth}
              disabled={!canGoNext}
              title={t('nextMonth')}
              className="rounded p-1 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void onUndo()}
            disabled={!undoHistory || undoHistory.length === 0}
            className={sectionHeaderBtn}
            title={t('undo')}
          >
            <Undo2 className="h-4 w-4" />
            {t('undo')}
          </button>
          <button
            onClick={() => void onRedo()}
            disabled={!redoStack || redoStack.length === 0}
            className={sectionHeaderBtn}
            title={t('redo')}
          >
            <Redo2 className="h-4 w-4" />
            {t('redo')}
          </button>
          <button onClick={() => void handleExportMD()} className={sectionHeaderBtn} title="Markdown">
            <Download className="h-4 w-4" />
            MD
          </button>
          <button onClick={() => void handleExportPDF()} className={sectionHeaderBtn} title="PDF">
            <Download className="h-4 w-4" />
            PDF
          </button>
          <button
            onClick={() => setHistoryOpen(true)}
            className={sectionHeaderBtn}
            title={t('history')}
          >
            <HistoryIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className={sectionHeaderBtn}
            title={t('settings')}
          >
            <SettingsIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Search and filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full rounded border border-neutral-700 bg-neutral-800 py-1.5 pl-8 pr-8 text-sm text-neutral-200 placeholder:text-neutral-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              title={t('clearSearch')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          {(
            [
              ['all', t('filterAll')],
              ['paid', t('filterPaid')],
              ['unpaid', t('filterUnpaid')],
              ['unknown', t('filterUnknown')],
            ] as const
          ).map(([s, label]) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`rounded px-2 py-1 text-xs transition-colors ${
                filterStatus === s
                  ? 'bg-neutral-700 text-neutral-200'
                  : 'bg-neutral-800 text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {(
            [
              ['all', t('filterAll')],
              ['monthly', t('typeMonthly')],
              ['yearly', t('typeYearly')],
              ['once', t('typeOnce')],
            ] as const
          ).map(([ty, label]) => (
            <button
              key={ty}
              onClick={() => setFilterType(ty)}
              className={`rounded px-2 py-1 text-xs transition-colors ${
                filterType === ty
                  ? 'bg-neutral-700 text-neutral-200'
                  : 'bg-neutral-800 text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <ArrowUpDown className="h-4 w-4 text-neutral-500" />
          {(
            [
              ['name', t('sortName')],
              ['amount', t('sortAmount')],
              ['date', t('sortDate')],
            ] as const
          ).map(([s, label]) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`rounded px-2 py-1 text-xs transition-colors ${
                sortBy === s
                  ? 'bg-neutral-700 text-neutral-200'
                  : 'bg-neutral-800 text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {(searchQuery || filterStatus !== 'all' || filterType !== 'all' || sortBy !== 'name') && (
          <button
            onClick={resetFilters}
            className="text-xs text-neutral-400 underline hover:text-neutral-200"
          >
            {t('resetFilters')}
          </button>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          <p className="text-xs text-neutral-400">{t('leftToPayIn', { month: currentMonthLabel })}</p>
          <p className="mt-1 text-2xl font-bold text-neutral-100">
            {fmt(totalMonthlyFiltered)}
            <span className="ml-1 text-xs font-normal text-neutral-500">
              {t('ofCount', { n: filtered.length })}
            </span>
          </p>
          {totalPaidFiltered > 0 && (
            <div className="mt-2 border-t border-neutral-800 pt-2">
              <p className="text-xs text-neutral-400">{t('paidIn', { month: currentMonthLabel })}</p>
              <p className="mt-0.5 text-lg font-semibold text-green-400">{fmt(totalPaidFiltered)}</p>
            </div>
          )}
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          <p className="text-xs text-neutral-400">{t('paidThisMonth')}</p>
          <p className="mt-1 text-2xl font-bold text-green-400">{paidCount}</p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          <p className="text-xs text-neutral-400">{t('pendingPayments')}</p>
          <p
            className={`mt-1 text-2xl font-bold ${pendingCount > 0 ? 'text-red-400' : 'text-green-400'}`}
          >
            {pendingCount}
          </p>
        </div>
      </div>

      {/* Due warning banner */}
      {dueWarnings.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 rounded-xl bg-orange-950/40 px-4 py-3 text-sm text-orange-300"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {tn('duePayments', dueWarnings.length)}{' '}
            <span className="font-medium text-orange-200">
              {dueWarnings.map((o) => o.name).join(', ')}
            </span>
          </span>
        </motion.div>
      )}

      {/* Grouped sections */}
      <div className="space-y-4">
        {/* Monthly */}
        <div
          className={`rounded-xl border bg-neutral-900/30 transition-colors ${
            dragOverSection === 'monthly' ? 'border-blue-600 bg-blue-950/10' : 'border-neutral-800'
          }`}
          onDragOver={(e) => handleDragOver(e, 'monthly')}
          onDragLeave={handleDragLeave}
          onDrop={(e) => void handleDrop(e, 'monthly')}
        >
          <div
            className="flex cursor-pointer items-center justify-between px-4 py-3"
            onClick={() => setCollapsedMonthly(!collapsedMonthly)}
          >
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-neutral-300">{t('sectionMonthly')}</h3>
              <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
                {monthlyObligations.length}
              </span>
              <span className="text-xs text-neutral-500">
                {fmt(
                  monthlyObligations.reduce((s, o) => s + (effectiveAmount(o, year, month) ?? 0), 0)
                )}
              </span>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-neutral-500 transition-transform ${collapsedMonthly ? '-rotate-90' : ''}`}
            />
          </div>
          <AnimatePresence>
            {!collapsedMonthly && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-2 p-4 pt-0">
                  {monthlyObligations.length === 0 && installmentAll.length === 0 ? (
                    <p className="text-sm text-neutral-500">{t('noMonthly')}</p>
                  ) : (
                    <>
                      {regularMonthlyUnpaid.map((o) => renderObligationWithChildren(o))}

                      {/* Installments subgroup */}
                      <div className="overflow-hidden rounded-lg border border-pink-800/40 bg-pink-950/10">
                        <div className="flex items-center justify-between px-3 py-2">
                          <div
                            className="flex flex-1 cursor-pointer items-center gap-2"
                            onClick={() => setCollapsedInstallments(!collapsedInstallments)}
                          >
                            <span className="text-xs font-medium text-pink-300">
                              {t('sectionInstallments')}
                            </span>
                            <span className="rounded-full bg-pink-900/40 px-1.5 py-0.5 text-[10px] text-pink-400">
                              {installmentAll.length}
                            </span>
                            <span className="text-xs text-pink-400/60">
                              {fmt(
                                installmentAll
                                  .filter(
                                    (o) => !isInstallmentCompleted(o) && isNativeActive(o, year, month)
                                  )
                                  .reduce((s, o) => s + (effectiveAmount(o, year, month) ?? 0), 0)
                              )}
                              {t('perMonth')}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleOpenAdd('manual_payment', 'monthly', true)
                              }}
                              className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-pink-400/70 transition-colors hover:bg-pink-900/30 hover:text-pink-300"
                              title={t('installmentPlan')}
                            >
                              <Plus className="h-3 w-3" />
                              {t('addInstallment')}
                            </button>
                            <ChevronDown
                              className={`h-3.5 w-3.5 cursor-pointer text-pink-400/60 transition-transform ${collapsedInstallments ? '-rotate-90' : ''}`}
                              onClick={() => setCollapsedInstallments(!collapsedInstallments)}
                            />
                          </div>
                        </div>
                        <AnimatePresence>
                          {!collapsedInstallments && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="space-y-2 px-3 pb-3">
                                {installmentAll.length === 0 && (
                                  <p className="py-1 text-xs text-pink-400/40">
                                    {t('noInstallments')} · {t('sectionInstallmentsExample')}
                                  </p>
                                )}
                                {installmentAll.map((o) => renderObligationWithChildren(o))}
                                <button
                                  onClick={() => handleOpenAdd('manual_payment', 'monthly', true)}
                                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-pink-800/50 py-2 text-xs text-pink-400/70 transition-colors hover:border-pink-600 hover:text-pink-300"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                  {t('addInstallmentFull')}
                                </button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Paid regular obligations at the bottom */}
                      {regularMonthlyPaid.map((o) => renderObligationWithChildren(o))}
                    </>
                  )}
                  <button
                    onClick={() => handleOpenAdd('subscription', 'monthly')}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-700 py-2 text-sm text-neutral-500 transition-colors hover:border-neutral-500 hover:text-neutral-300"
                  >
                    <Plus className="h-4 w-4" />
                    {t('addObligation')}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Yearly */}
        <div
          className={`rounded-xl border bg-neutral-900/30 transition-colors ${
            dragOverSection === 'yearly' ? 'border-blue-600 bg-blue-950/10' : 'border-neutral-800'
          }`}
          onDragOver={(e) => handleDragOver(e, 'yearly')}
          onDragLeave={handleDragLeave}
          onDrop={(e) => void handleDrop(e, 'yearly')}
        >
          <div
            className="flex cursor-pointer items-center justify-between px-4 py-3"
            onClick={() => setCollapsedYearly(!collapsedYearly)}
          >
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-neutral-300">{t('sectionYearly')}</h3>
              <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
                {yearlyObligations.length}
              </span>
              <span className="text-xs text-neutral-500">
                {fmt(yearlyTotal)}
                {t('perYear')}
              </span>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-neutral-500 transition-transform ${collapsedYearly ? '-rotate-90' : ''}`}
            />
          </div>
          <AnimatePresence>
            {!collapsedYearly && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-2 p-4 pt-0">
                  {yearlyObligations.length === 0 ? (
                    <p className="text-sm text-neutral-500">{t('noYearly')}</p>
                  ) : (
                    yearlyObligations.map((o) => renderObligationWithChildren(o))
                  )}
                  <button
                    onClick={() => handleOpenAdd('manual_payment', 'yearly')}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-700 py-2 text-sm text-neutral-500 transition-colors hover:border-neutral-500 hover:text-neutral-300"
                  >
                    <Plus className="h-4 w-4" />
                    {t('addYearly')}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* One-time */}
        <div
          className={`rounded-xl border bg-neutral-900/30 transition-colors ${
            dragOverSection === 'once' ? 'border-blue-600 bg-blue-950/10' : 'border-neutral-800'
          }`}
          onDragOver={(e) => handleDragOver(e, 'once')}
          onDragLeave={handleDragLeave}
          onDrop={(e) => void handleDrop(e, 'once')}
        >
          <div
            className="flex cursor-pointer items-center justify-between px-4 py-3"
            onClick={() => setCollapsedOnce(!collapsedOnce)}
          >
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-neutral-300">{t('sectionOnce')}</h3>
              <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
                {onceObligations.length}
              </span>
              <span className="text-xs text-neutral-500">
                {fmt(
                  onceObligations.reduce(
                    (s, o) =>
                      s + (isNativeActive(o, year, month) ? (effectiveAmount(o, year, month) ?? 0) : 0),
                    0
                  )
                )}
              </span>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-neutral-500 transition-transform ${collapsedOnce ? '-rotate-90' : ''}`}
            />
          </div>
          <AnimatePresence>
            {!collapsedOnce && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-2 p-4 pt-0">
                  {onceObligations.length === 0 ? (
                    <p className="text-sm text-neutral-500">{t('noOnce')}</p>
                  ) : (
                    onceObligations.map((o) => renderObligationWithChildren(o))
                  )}
                  <button
                    onClick={() => handleOpenAdd('manual_payment', 'once')}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-700 py-2 text-sm text-neutral-500 transition-colors hover:border-neutral-500 hover:text-neutral-300"
                  >
                    <Plus className="h-4 w-4" />
                    {t('addOnce')}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Custom sections */}
        {customSections.map((section) => {
          const sectionObs = sectionObligations.get(section.id) ?? []
          const sectionTotal = sectionObs.reduce(
            (s, o) =>
              s + (isNativeActive(o, year, month) ? (effectiveAmount(o, year, month) ?? 0) : 0),
            0
          )
          const isCollapsed = collapsedSections.has(section.id)
          const isRenaming = renamingSectionId === section.id

          return (
            <div
              key={section.id}
              className={`rounded-xl border bg-neutral-900/30 transition-colors ${
                dragOverSection === section.id
                  ? 'border-purple-600 bg-purple-950/10'
                  : 'border-neutral-800'
              }`}
              onDragOver={(e) => handleDragOver(e, section.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => void handleDrop(e, section.id)}
            >
              <div className="flex items-center justify-between px-4 py-3">
                <div
                  className="flex flex-1 cursor-pointer items-center gap-2"
                  onClick={() => toggleSectionCollapse(section.id)}
                >
                  {isRenaming ? (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        autoFocus
                        value={renamingSectionName}
                        onChange={(e) => setRenamingSectionName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void handleRenameSection(section.id)
                          if (e.key === 'Escape') {
                            setRenamingSectionId(null)
                            setRenamingSectionName('')
                          }
                        }}
                        title={t('renameSection')}
                        placeholder={t('sectionNamePlaceholder')}
                        className="rounded border border-neutral-600 bg-neutral-800 px-2 py-0.5 text-sm text-neutral-200 focus:border-purple-600 focus:outline-none"
                      />
                      <button
                        onClick={() => void handleRenameSection(section.id)}
                        title={t('renameSection')}
                        className="p-0.5 text-green-400 hover:text-green-300"
                      >
                        <CheckIcon className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <h3 className="text-sm font-medium text-purple-300">{section.name}</h3>
                      <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
                        {sectionObs.length}
                      </span>
                      <span className="text-xs text-neutral-500">{fmt(sectionTotal)}</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setRenamingSectionId(section.id)
                      setRenamingSectionName(section.name)
                    }}
                    className="p-1 text-neutral-500 hover:text-neutral-300"
                    title={t('renameSection')}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => void onDeleteSection(section.id)}
                    className="p-1 text-neutral-500 hover:text-red-400"
                    title={t('deleteSection')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <ChevronDown
                    className={`h-4 w-4 text-neutral-500 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                  />
                </div>
              </div>
              <AnimatePresence>
                {!isCollapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-2 p-4 pt-0">
                      {sectionObs.length === 0 ? (
                        <p className="text-sm text-neutral-500">{t('dragHere')}</p>
                      ) : (
                        sectionObs.map((o) => renderObligationWithChildren(o))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}

        {/* Add custom section */}
        {showAddSection ? (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-purple-700/50 bg-purple-950/10 px-4 py-3">
            <input
              autoFocus
              value={newSectionName}
              onChange={(e) => setNewSectionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleAddSection()
                if (e.key === 'Escape') {
                  setShowAddSection(false)
                  setNewSectionName('')
                }
              }}
              placeholder={t('sectionNamePlaceholder')}
              className="flex-1 rounded border border-neutral-600 bg-neutral-800 px-3 py-1.5 text-sm text-neutral-200 placeholder:text-neutral-500 focus:border-purple-600 focus:outline-none"
            />
            <button
              onClick={() => void handleAddSection()}
              disabled={!newSectionName.trim()}
              className="rounded bg-purple-800 px-3 py-1.5 text-xs text-purple-200 hover:bg-purple-700 disabled:opacity-30"
            >
              {t('create')}
            </button>
            <button
              onClick={() => {
                setShowAddSection(false)
                setNewSectionName('')
              }}
              title={t('cancel')}
              className="text-neutral-500 hover:text-neutral-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAddSection(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-700 py-2.5 text-sm text-neutral-500 transition-colors hover:border-purple-600/50 hover:text-purple-300"
          >
            <FolderPlus className="h-4 w-4" />
            {t('addSection')}
          </button>
        )}
      </div>

      {/* Delete confirm dialog */}
      {deleteConfirm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        >
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            className="rounded-xl border border-neutral-800 bg-neutral-900 p-6"
          >
            <p className="mb-1 text-sm font-medium text-neutral-200">{t('deleteDialogTitle')}</p>
            <p className="mb-4 text-xs text-neutral-500">{t('deleteDialogHint')}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="rounded-md px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200"
              >
                {t('cancel')}
              </button>
              <button
                onClick={() => void handleSkipMonth()}
                className="rounded-md bg-neutral-800 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-700"
              >
                {t('hideThisMonth')}
              </button>
              <button
                onClick={() => void confirmDelete()}
                className="rounded-md bg-red-900/50 px-4 py-2 text-sm text-red-300 hover:bg-red-900"
              >
                {t('deleteFromThisMonth')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Add/Edit modal */}
      <ObligationModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={(o, paid, priceFrom) => void handleSave(o, paid, priceFrom)}
        banks={banks}
        currency={currency}
        editObligation={editTarget}
        editEffectiveAmount={editTarget ? effectiveAmount(editTarget, year, month) : undefined}
        preselectedType={preselectedType}
        preselectedFrequency={preselectedFrequency}
        preselectedInstallment={preselectedInstallment}
        installmentPaidCount={editTarget ? installmentPaidCountMap.get(editTarget.id) : undefined}
      />

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} store={store} />
      <HistoryModal
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        changeLog={store.changeLog}
      />
    </div>
  )
}
