import { ElectronAPI } from '@electron-toolkit/preload'

interface LiteApi {
  store: {
    getAll: () => Promise<unknown>
    addObligation: (obligation: unknown) => Promise<void>
    updateObligation: (id: string, updates: unknown) => Promise<void>
    deleteObligation: (id: string) => Promise<void>
    setObligations: (obligations: unknown[]) => Promise<void>
    setObligationMonth: (record: unknown) => Promise<void>
    setAllObligationMonths: (months: unknown[]) => Promise<void>
    setBanks: (banks: unknown[]) => Promise<void>
    setIncomes: (incomes: unknown[]) => Promise<void>
    saveCustomSections: (sections: unknown[]) => Promise<void>
    saveUndoHistory: (history: unknown[]) => Promise<void>
    saveRedoStack: (stack: unknown[]) => Promise<void>
    addChangeLog: (entry: unknown) => Promise<void>
    saveSettings: (settings: unknown) => Promise<void>
    savePriorityObligationIds: (ids: string[]) => Promise<void>
    saveNotificationsState: (state: unknown) => Promise<void>
  }
  backup: {
    list: () => Promise<unknown[]>
    create: () => Promise<void>
    restore: (filename: string) => Promise<{ success: boolean }>
    exportToFile: () => Promise<{ success: boolean }>
    importFromFile: () => Promise<{ success: boolean }>
  }
  exportPdf: (html: string, defaultName: string) => Promise<{ success: boolean; filePath?: string }>
  exportMd: (content: string, defaultName: string) => Promise<{ success: boolean; filePath?: string }>
  pin: {
    verify: (pin: string) => Promise<unknown>
    set: (pin: string) => Promise<unknown>
    disable: (pin: string) => Promise<unknown>
    status: () => Promise<unknown>
  }
  openDevTools: () => Promise<void>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: LiteApi
  }
}
