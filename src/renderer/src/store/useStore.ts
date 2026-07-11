import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  AppData,
  AppSettings,
  Bank,
  ChangeLogEntry,
  HistoryEntry,
  Income,
  Obligation,
  ObligationMonth,
  ObligationSection,
  ObligationStatus,
} from '../types'
import { effectiveAmount, formatLocalDate } from '../utils/obligationEngine'
import { pushHistory } from '../services/historyService'
import { buildI18n } from '../i18n'

const DEFAULT_SETTINGS: AppSettings = {
  language: 'en',
  currency: 'EUR',
  onboarded: false,
}

export interface UseStoreReturn {
  obligations: Obligation[]
  obligationMonths: ObligationMonth[]
  banks: Bank[]
  incomes: Income[]
  customSections: ObligationSection[]
  undoHistory: HistoryEntry[]
  redoStack: HistoryEntry[]
  changeLog: ChangeLogEntry[]
  settings: AppSettings
  loading: boolean
  refresh: () => Promise<void>
  addObligation: (o: Omit<Obligation, 'id' | 'createdAt'>, createdAt?: string) => Promise<Obligation>
  updateObligation: (id: string, updates: Partial<Obligation>) => Promise<void>
  deleteObligation: (id: string) => Promise<void>
  setObligationStatus: (
    obligationId: string,
    year: number,
    month: number,
    status: ObligationStatus,
    skipUndo?: boolean
  ) => Promise<void>
  getObligationMonth: (obligationId: string, year: number, month: number) => ObligationMonth | null
  carryObligationDebt: (
    obligationId: string,
    fromYear: number,
    fromMonth: number,
    toYear: number,
    toMonth: number
  ) => Promise<void>
  setCarriedPaid: (obligationId: string, year: number, month: number, paid: boolean) => Promise<void>
  returnCarriedObligation: (obligationId: string, year: number, month: number) => Promise<void>
  pushUndo: (action: string, before: Partial<AppData>, after: Partial<AppData>) => void
  undo: () => Promise<void>
  redo: () => Promise<void>
  addCustomSection: (name: string) => Promise<ObligationSection>
  deleteCustomSection: (id: string) => Promise<void>
  renameCustomSection: (id: string, name: string) => Promise<void>
  addBank: (name: string, color: string) => Promise<Bank>
  updateBank: (id: string, updates: Partial<Bank>) => Promise<void>
  deleteBank: (id: string) => Promise<void>
  addIncome: (income: Omit<Income, 'id' | 'createdAt'>) => Promise<Income>
  updateIncome: (id: string, updates: Partial<Omit<Income, 'id' | 'createdAt'>>) => Promise<void>
  deleteIncome: (id: string) => Promise<void>
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
}

export function useStore(): UseStoreReturn {
  const [obligations, setObligations] = useState<Obligation[]>([])
  const [obligationMonths, setObligationMonths] = useState<ObligationMonth[]>([])
  // Mirror of obligationMonths in a ref: undo snapshots are taken from here so
  // they never depend on React updater timing. After an await, a state updater
  // may not have run yet — capturing snapshots inside it can produce an EMPTY
  // snapshot, and undo would then wipe every status record.
  const obligationMonthsRef = useRef<ObligationMonth[]>([])
  useEffect(() => {
    obligationMonthsRef.current = obligationMonths
  }, [obligationMonths])
  const [banks, setBanks] = useState<Bank[]>([])
  const [incomes, setIncomes] = useState<Income[]>([])
  const [customSections, setCustomSections] = useState<ObligationSection[]>([])
  const [undoHistory, setUndoHistory] = useState<HistoryEntry[]>([])
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([])
  const [changeLog, setChangeLog] = useState<ChangeLogEntry[]>([])
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const data = (await window.api.store.getAll()) as AppData
    setObligations(data.obligations ?? [])
    setObligationMonths(data.obligationMonths ?? [])
    obligationMonthsRef.current = data.obligationMonths ?? []
    setBanks(data.banks ?? [])
    setIncomes(data.incomes ?? [])
    setCustomSections(data.customSections ?? [])
    setUndoHistory(data.undoHistory ?? [])
    setRedoStack(data.redoStack ?? [])
    setChangeLog(data.changeLog ?? [])
    setSettings({ ...DEFAULT_SETTINGS, ...(data.settings ?? {}) })
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Change-log descriptions are resolved at write time in the current UI language.
  const logChange = useCallback(
    async (action: string, description: string) => {
      const entry: ChangeLogEntry = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        action,
        description,
      }
      setChangeLog((prev) => [entry, ...prev].slice(0, 500))
      await window.api.store.addChangeLog(entry)
    },
    []
  )

  const i18nRef = useRef(buildI18n(settings.language))
  useEffect(() => {
    i18nRef.current = buildI18n(settings.language)
  }, [settings.language])

  const pushUndo = useCallback(
    (action: string, before: Partial<AppData>, after: Partial<AppData>) => {
      setUndoHistory((current) => {
        const newHistory = pushHistory(current, action, before, after)
        void window.api.store.saveUndoHistory(newHistory)
        return newHistory
      })
      setRedoStack([]) // a new action clears the redo stack
      void window.api.store.saveRedoStack([])
    },
    []
  )

  const addObligation = useCallback(
    async (o: Omit<Obligation, 'id' | 'createdAt'>, createdAt?: string): Promise<Obligation> => {
      const obligation: Obligation = {
        ...o,
        id: crypto.randomUUID(),
        createdAt: createdAt ?? new Date().toISOString(),
      }
      await window.api.store.addObligation(obligation)
      await logChange('ADD_OBLIGATION', i18nRef.current.t('logObligationCreated', { name: o.name }))
      setObligations((current) => [...current, obligation])
      return obligation
    },
    [logChange]
  )

  const updateObligation = useCallback(
    async (id: string, updates: Partial<Obligation>) => {
      await window.api.store.updateObligation(id, updates)
      await logChange('UPDATE_OBLIGATION', i18nRef.current.t('logObligationUpdated'))
      setObligations((current) => current.map((o) => (o.id === id ? { ...o, ...updates } : o)))
    },
    [logChange]
  )

  const deleteObligation = useCallback(
    async (id: string) => {
      await window.api.store.deleteObligation(id)
      await logChange('DELETE_OBLIGATION', i18nRef.current.t('logObligationDeleted'))
      setObligations((current) => current.filter((o) => o.id !== id))
    },
    [logChange]
  )

  const setObligationStatus = useCallback(
    async (
      obligationId: string,
      year: number,
      month: number,
      status: ObligationStatus,
      skipUndo = false
    ) => {
      const snapshotBefore = obligationMonthsRef.current
      const existingIdx = snapshotBefore.findIndex(
        (m) => m.obligationId === obligationId && m.year === year && m.month === month
      )
      const existing = existingIdx !== -1 ? snapshotBefore[existingIdx] : undefined
      // Preserve carry-over fields of an existing record — a status change must
      // not silently drop a carried debt attached to the same month.
      const record: ObligationMonth = {
        ...(existing ?? {}),
        obligationId,
        year,
        month,
        status,
        actualAmount: existing?.actualAmount ?? null,
        paidDate: status === 'paid' ? formatLocalDate(new Date()) : undefined,
      }
      await window.api.store.setObligationMonth(record)
      await logChange('SET_STATUS', i18nRef.current.t('logStatusChanged', { status }))
      const snapshotAfter =
        existingIdx !== -1
          ? snapshotBefore.map((m, i) => (i === existingIdx ? record : m))
          : [...snapshotBefore, record]
      // Update the ref synchronously so sequences of calls (installment recalc,
      // children propagation) see the up-to-date list.
      obligationMonthsRef.current = snapshotAfter
      setObligationMonths(snapshotAfter)
      // skipUndo: the caller (status toggle) pushes ONE combined undo entry for
      // the whole operation (status + children + carry-over auto-resolve).
      if (!skipUndo) {
        pushUndo(
          i18nRef.current.t('actionStatusChange'),
          { obligationMonths: snapshotBefore },
          { obligationMonths: snapshotAfter }
        )
      }
    },
    [logChange, pushUndo]
  )

  const getObligationMonth = useCallback(
    (obligationId: string, year: number, month: number): ObligationMonth | null => {
      return (
        obligationMonths.find(
          (m) => m.obligationId === obligationId && m.year === year && m.month === month
        ) ?? null
      )
    },
    [obligationMonths]
  )

  const carryObligationDebt = useCallback(
    async (
      obligationId: string,
      fromYear: number,
      fromMonth: number,
      toYear: number,
      toMonth: number
    ) => {
      const current = obligationMonthsRef.current
      const obligation = obligations.find((o) => o.id === obligationId)
      // If the source month is already paid, the debt counts as settled (the
      // payment happened, just late).
      const sourceRecord = current.find(
        (m) => m.obligationId === obligationId && m.year === fromYear && m.month === fromMonth
      )
      const sourcePaid = sourceRecord?.status === 'paid'
      // For obligations with amount=null take the actual amount of the source
      // month, otherwise carriedAmount=undefined is treated as 0 downstream.
      const carriedAmount =
        (obligation ? effectiveAmount(obligation, fromYear, fromMonth) : null) ??
        sourceRecord?.actualAmount ??
        undefined
      // Merge with an existing target-month record (keep status/actualAmount/paidDate).
      const idx = current.findIndex(
        (m) => m.obligationId === obligationId && m.year === toYear && m.month === toMonth
      )
      const existing = idx !== -1 ? current[idx] : undefined
      const record: ObligationMonth = existing
        ? {
            ...existing,
            isCarriedOver: true,
            carriedFromYear: fromYear,
            carriedFromMonth: fromMonth,
            carriedAmount,
            carriedPaid: sourcePaid,
          }
        : {
            obligationId,
            year: toYear,
            month: toMonth,
            status: 'unpaid',
            actualAmount: null,
            isCarriedOver: true,
            carriedFromYear: fromYear,
            carriedFromMonth: fromMonth,
            carriedAmount,
            carriedPaid: sourcePaid,
          }
      await window.api.store.setObligationMonth(record)
      await logChange(
        'CARRY_DEBT',
        i18nRef.current.t('logDebtCarried', { month: i18nRef.current.monthYear(toYear, toMonth) })
      )
      const after =
        idx !== -1 ? current.map((m, i) => (i === idx ? record : m)) : [...current, record]
      obligationMonthsRef.current = after
      setObligationMonths(after)
      pushUndo(
        i18nRef.current.t('actionCarryDebt'),
        { obligationMonths: current },
        { obligationMonths: after }
      )
    },
    [obligations, logChange, pushUndo]
  )

  const setCarriedPaid = useCallback(
    async (obligationId: string, year: number, month: number, paid: boolean) => {
      const current = obligationMonthsRef.current
      const idx = current.findIndex(
        (m) => m.obligationId === obligationId && m.year === year && m.month === month
      )
      if (idx === -1) return
      const record: ObligationMonth = { ...current[idx], carriedPaid: paid }
      await window.api.store.setObligationMonth(record)
      await logChange(
        'SET_CARRIED_PAID',
        i18nRef.current.t(paid ? 'logCarriedSettled' : 'logCarriedUnsettled')
      )
      const after = current.map((m, i) => (i === idx ? record : m))
      obligationMonthsRef.current = after
      setObligationMonths(after)
      pushUndo(
        i18nRef.current.t('actionSettleCarried'),
        { obligationMonths: current },
        { obligationMonths: after }
      )
    },
    [logChange, pushUndo]
  )

  // Revert a carried-over obligation back to its source month (reverse of
  // carryObligationDebt). Smart revert: if the target-month record exists only
  // because of the carry (no independent payment fact) — remove it entirely;
  // otherwise only strip the carry markers and keep the status.
  const returnCarriedObligation = useCallback(
    async (obligationId: string, year: number, month: number) => {
      const current = obligationMonthsRef.current
      const idx = current.findIndex(
        (m) => m.obligationId === obligationId && m.year === year && m.month === month
      )
      if (idx === -1) return
      const target = current[idx]
      if (!target.isCarriedOver) return
      const isPureCarry =
        target.status !== 'paid' && target.actualAmount == null && target.carriedPaid !== true
      const after: ObligationMonth[] = isPureCarry
        ? current.filter((_, i) => i !== idx)
        : current.map((m, i) =>
            i === idx
              ? {
                  ...m,
                  isCarriedOver: false,
                  carriedFromYear: undefined,
                  carriedFromMonth: undefined,
                  carriedAmount: undefined,
                  carriedPaid: undefined,
                }
              : m
          )
      // Bulk replace — the smart revert may DELETE a record.
      await window.api.store.setAllObligationMonths(after)
      await logChange(
        'RETURN_CARRIED',
        i18nRef.current.t('logCarryReturned', { month: i18nRef.current.monthYear(year, month) })
      )
      obligationMonthsRef.current = after
      setObligationMonths(after)
      pushUndo(
        i18nRef.current.t('actionReturnCarried'),
        { obligationMonths: current },
        { obligationMonths: after }
      )
    },
    [logChange, pushUndo]
  )

  const applySnapshot = useCallback(async (snapshot: Partial<AppData>): Promise<void> => {
    if (snapshot.obligations !== undefined) {
      const obs = snapshot.obligations
      setObligations(obs)
      await window.api.store.setObligations(obs)
    }
    if (snapshot.obligationMonths !== undefined) {
      const months = snapshot.obligationMonths
      // Guard (data-wipe fix): no legitimate action clears ALL obligationMonths
      // at once. An empty snapshot against a non-empty state is a broken undo
      // entry — do not apply it.
      if (months.length === 0 && obligationMonthsRef.current.length > 0) {
        console.error('Undo/redo skipped: empty obligationMonths snapshot would wipe all statuses')
      } else {
        obligationMonthsRef.current = months
        setObligationMonths(months)
        await window.api.store.setAllObligationMonths(months)
      }
    }
  }, [])

  const undo = useCallback(async () => {
    if (undoHistory.length === 0) return
    const [entry, ...rest] = undoHistory
    setUndoHistory(rest)
    setRedoStack([entry, ...redoStack])
    await applySnapshot(entry.snapshotBefore)
    await window.api.store.saveUndoHistory(rest)
    await window.api.store.saveRedoStack([entry, ...redoStack])
  }, [undoHistory, redoStack, applySnapshot])

  const redo = useCallback(async () => {
    if (redoStack.length === 0) return
    const [entry, ...rest] = redoStack
    setRedoStack(rest)
    setUndoHistory([entry, ...undoHistory])
    await applySnapshot(entry.snapshotAfter)
    await window.api.store.saveUndoHistory([entry, ...undoHistory])
    await window.api.store.saveRedoStack(rest)
  }, [redoStack, undoHistory, applySnapshot])

  const addCustomSection = useCallback(
    async (name: string): Promise<ObligationSection> => {
      const section: ObligationSection = {
        id: crypto.randomUUID(),
        name,
        order: customSections.length,
        createdAt: new Date().toISOString(),
      }
      const updated = [...customSections, section]
      setCustomSections(updated)
      await window.api.store.saveCustomSections(updated)
      return section
    },
    [customSections]
  )

  const deleteCustomSection = useCallback(
    async (id: string) => {
      const updated = customSections.filter((s) => s.id !== id)
      setCustomSections(updated)
      await window.api.store.saveCustomSections(updated)
      // Obligations of the deleted section fall back to the Monthly group.
      const affected = obligations.filter((o) => o.sectionId === id)
      for (const o of affected) {
        await window.api.store.updateObligation(o.id, { sectionId: undefined, frequency: 'monthly' })
      }
      if (affected.length > 0) {
        setObligations((current) =>
          current.map((o) =>
            o.sectionId === id ? { ...o, sectionId: undefined, frequency: 'monthly' as const } : o
          )
        )
      }
    },
    [customSections, obligations]
  )

  const renameCustomSection = useCallback(
    async (id: string, name: string) => {
      const updated = customSections.map((s) => (s.id === id ? { ...s, name } : s))
      setCustomSections(updated)
      await window.api.store.saveCustomSections(updated)
    },
    [customSections]
  )

  const addBank = useCallback(
    async (name: string, color: string): Promise<Bank> => {
      const bank: Bank = {
        id: crypto.randomUUID(),
        name,
        color,
        createdAt: new Date().toISOString(),
      }
      const updated = [...banks, bank]
      setBanks(updated)
      await window.api.store.setBanks(updated)
      return bank
    },
    [banks]
  )

  const updateBank = useCallback(
    async (id: string, updates: Partial<Bank>) => {
      const updated = banks.map((b) => (b.id === id ? { ...b, ...updates } : b))
      setBanks(updated)
      await window.api.store.setBanks(updated)
    },
    [banks]
  )

  const deleteBank = useCallback(
    async (id: string) => {
      const updated = banks.filter((b) => b.id !== id)
      setBanks(updated)
      await window.api.store.setBanks(updated)
      // Obligations that referenced the deleted bank keep working without one.
      const affected = obligations.filter((o) => o.bankId === id)
      for (const o of affected) {
        await window.api.store.updateObligation(o.id, { bankId: null })
      }
      if (affected.length > 0) {
        setObligations((current) =>
          current.map((o) => (o.bankId === id ? { ...o, bankId: null } : o))
        )
      }
    },
    [banks, obligations]
  )

  // Income log — independent of obligations; whole-array persistence like banks.
  const addIncome = useCallback(
    async (income: Omit<Income, 'id' | 'createdAt'>): Promise<Income> => {
      const entry: Income = {
        ...income,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      }
      const updated = [...incomes, entry]
      setIncomes(updated)
      await window.api.store.setIncomes(updated)
      await logChange('ADD_INCOME', i18nRef.current.t('logIncomeAdded', { label: entry.label }))
      return entry
    },
    [incomes, logChange]
  )

  const updateIncome = useCallback(
    async (id: string, updates: Partial<Omit<Income, 'id' | 'createdAt'>>) => {
      const updated = incomes.map((i) => (i.id === id ? { ...i, ...updates } : i))
      setIncomes(updated)
      await window.api.store.setIncomes(updated)
      await logChange('UPDATE_INCOME', i18nRef.current.t('logIncomeUpdated'))
    },
    [incomes, logChange]
  )

  const deleteIncome = useCallback(
    async (id: string) => {
      const updated = incomes.filter((i) => i.id !== id)
      setIncomes(updated)
      await window.api.store.setIncomes(updated)
      await logChange('DELETE_INCOME', i18nRef.current.t('logIncomeDeleted'))
    },
    [incomes, logChange]
  )

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      const updated = { ...settings, ...patch }
      setSettings(updated)
      await window.api.store.saveSettings(updated)
    },
    [settings]
  )

  return {
    obligations,
    obligationMonths,
    banks,
    incomes,
    customSections,
    undoHistory,
    redoStack,
    changeLog,
    settings,
    loading,
    refresh,
    addObligation,
    updateObligation,
    deleteObligation,
    setObligationStatus,
    getObligationMonth,
    carryObligationDebt,
    setCarriedPaid,
    returnCarriedObligation,
    pushUndo,
    undo,
    redo,
    addCustomSection,
    deleteCustomSection,
    renameCustomSection,
    addBank,
    updateBank,
    deleteBank,
    addIncome,
    updateIncome,
    deleteIncome,
    updateSettings,
  }
}
