import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  store: {
    getAll: (): Promise<unknown> => ipcRenderer.invoke('store:getAll'),
    addObligation: (obligation: unknown): Promise<void> =>
      ipcRenderer.invoke('store:addObligation', obligation),
    updateObligation: (id: string, updates: unknown): Promise<void> =>
      ipcRenderer.invoke('store:updateObligation', id, updates),
    deleteObligation: (id: string): Promise<void> =>
      ipcRenderer.invoke('store:deleteObligation', id),
    setObligations: (obligations: unknown[]): Promise<void> =>
      ipcRenderer.invoke('store:setObligations', obligations),
    setObligationMonth: (record: unknown): Promise<void> =>
      ipcRenderer.invoke('store:setObligationMonth', record),
    setAllObligationMonths: (months: unknown[]): Promise<void> =>
      ipcRenderer.invoke('store:setAllObligationMonths', months),
    setBanks: (banks: unknown[]): Promise<void> => ipcRenderer.invoke('store:setBanks', banks),
    setIncomes: (incomes: unknown[]): Promise<void> =>
      ipcRenderer.invoke('store:setIncomes', incomes),
    saveCustomSections: (sections: unknown[]): Promise<void> =>
      ipcRenderer.invoke('store:saveCustomSections', sections),
    saveUndoHistory: (history: unknown[]): Promise<void> =>
      ipcRenderer.invoke('store:saveUndoHistory', history),
    saveRedoStack: (stack: unknown[]): Promise<void> =>
      ipcRenderer.invoke('store:saveRedoStack', stack),
    addChangeLog: (entry: unknown): Promise<void> =>
      ipcRenderer.invoke('store:addChangeLog', entry),
    saveSettings: (settings: unknown): Promise<void> =>
      ipcRenderer.invoke('store:saveSettings', settings),
  },
  backup: {
    list: (): Promise<unknown[]> => ipcRenderer.invoke('backup:list'),
    create: (): Promise<void> => ipcRenderer.invoke('backup:create'),
    restore: (filename: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('backup:restore', filename),
    exportToFile: (): Promise<{ success: boolean }> => ipcRenderer.invoke('backup:exportToFile'),
    importFromFile: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('backup:importFromFile'),
  },
  exportPdf: (html: string, defaultName: string): Promise<{ success: boolean; filePath?: string }> =>
    ipcRenderer.invoke('export:pdf', html, defaultName),
  exportMd: (content: string, defaultName: string): Promise<{ success: boolean; filePath?: string }> =>
    ipcRenderer.invoke('export:md', content, defaultName),
  pin: {
    verify: (pin: string): Promise<unknown> => ipcRenderer.invoke('pin:verify', pin),
    set: (pin: string): Promise<unknown> => ipcRenderer.invoke('pin:set', pin),
    disable: (pin: string): Promise<unknown> => ipcRenderer.invoke('pin:disable', pin),
    status: (): Promise<unknown> => ipcRenderer.invoke('pin:status'),
  },
  openDevTools: (): Promise<void> => ipcRenderer.invoke('openDevTools'),
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
