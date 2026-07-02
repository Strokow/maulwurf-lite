import { app, shell, BrowserWindow, ipcMain, Menu, dialog } from 'electron'
import { join } from 'path'
import { writeFile, readFile, readdir, mkdir, unlink, stat } from 'fs/promises'
import { optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.ico?asset'
import Store from 'electron-store'
import { hashPin, verifyPin } from './pinService'

const MAX_ATTEMPTS = 3

interface Obligation {
  id: string
  name: string
  type: string
  amount: number | null
  approximateDay: number | null
  bankId: string | null
  notes?: string
  isActive: boolean
  createdAt: string
}

interface ObligationMonth {
  obligationId: string
  year: number
  month: number
  status: string
  actualAmount: number | null
  paidDate?: string
}

interface Bank {
  id: string
  name: string
  color: string
  createdAt: string
}

interface ChangeLogEntry {
  id: string
  timestamp: string
  action: string
  description: string
}

interface AppSettings {
  language: string
  currency: string
  onboarded: boolean
}

interface PinSettings {
  enabled: boolean
  pinHash: string | null
  lockoutUntil: string | null
  failedAttempts: number
}

interface BackupMeta {
  filename: string
  timestamp: string
  size: number
  obligationCount: number
}

interface StoreSchema {
  obligations: Obligation[]
  obligationMonths: ObligationMonth[]
  banks: Bank[]
  customSections: unknown[]
  undoHistory: unknown[]
  redoStack: unknown[]
  changeLog: ChangeLogEntry[]
  pinSettings: PinSettings
  settings: AppSettings
}

const DEFAULT_PIN: PinSettings = {
  enabled: false,
  pinHash: null,
  lockoutUntil: null,
  failedAttempts: 0,
}

const DEFAULT_SETTINGS: AppSettings = {
  language: 'en',
  currency: 'EUR',
  onboarded: false,
}

const store = new Store<StoreSchema>({
  // @ts-ignore - projectName is valid at runtime but missing from electron-store typedefs
  projectName: 'maulwurf-lite',
  defaults: {
    obligations: [],
    obligationMonths: [],
    banks: [],
    customSections: [],
    undoHistory: [],
    redoStack: [],
    changeLog: [],
    pinSettings: DEFAULT_PIN,
    settings: DEFAULT_SETTINGS,
  },
})

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    title: 'Maulwurf Lite',
    backgroundColor: '#0f0f0f',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Ctrl+Shift+I toggles DevTools
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      mainWindow.webContents.toggleDevTools()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Right-click context menu for copy/paste with mouse
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const contextMenu = Menu.buildFromTemplate([
      { role: 'cut', enabled: params.editFlags.canCut },
      { role: 'copy', enabled: params.editFlags.canCopy },
      { role: 'paste', enabled: params.editFlags.canPaste },
      { type: 'separator' },
      { role: 'selectAll', enabled: params.editFlags.canSelectAll },
    ])
    contextMenu.popup()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.strokow.maulwurf-lite')

  // Enable copy/paste/cut/selectAll via menu (needed for Electron)
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // ── Store IPC ───────────────────────────────────────────
  ipcMain.handle('store:getAll', () => ({
    obligations: store.get('obligations', []),
    obligationMonths: store.get('obligationMonths', []),
    banks: store.get('banks', []),
    customSections: store.get('customSections', []),
    undoHistory: store.get('undoHistory', []),
    redoStack: store.get('redoStack', []),
    changeLog: store.get('changeLog', []),
    pinSettings: store.get('pinSettings', DEFAULT_PIN),
    settings: store.get('settings', DEFAULT_SETTINGS),
  }))

  ipcMain.handle('store:addObligation', (_event, obligation: Obligation) => {
    const obligations = store.get('obligations', [])
    obligations.push(obligation)
    store.set('obligations', obligations)
  })

  ipcMain.handle('store:updateObligation', (_event, id: string, updates: Partial<Obligation>) => {
    const obligations = store.get('obligations', [])
    const idx = obligations.findIndex((o) => o.id === id)
    if (idx !== -1) {
      obligations[idx] = { ...obligations[idx], ...updates }
      store.set('obligations', obligations)
    }
  })

  ipcMain.handle('store:deleteObligation', (_event, id: string) => {
    store.set(
      'obligations',
      store.get('obligations', []).filter((o) => o.id !== id)
    )
    store.set(
      'obligationMonths',
      store.get('obligationMonths', []).filter((m) => m.obligationId !== id)
    )
  })

  ipcMain.handle('store:setObligations', (_event, obligations: Obligation[]) => {
    store.set('obligations', obligations)
  })

  ipcMain.handle('store:setObligationMonth', (_event, record: ObligationMonth) => {
    const months = store.get('obligationMonths', [])
    const idx = months.findIndex(
      (m) =>
        m.obligationId === record.obligationId && m.year === record.year && m.month === record.month
    )
    if (idx !== -1) {
      months[idx] = record
    } else {
      months.push(record)
    }
    store.set('obligationMonths', months)
  })

  ipcMain.handle('store:setAllObligationMonths', (_event, months: ObligationMonth[]) => {
    store.set('obligationMonths', months)
  })

  ipcMain.handle('store:setBanks', (_event, banks: Bank[]) => {
    store.set('banks', banks)
  })

  ipcMain.handle('store:saveCustomSections', (_event, sections: unknown[]) => {
    store.set('customSections', sections)
  })

  ipcMain.handle('store:saveUndoHistory', (_event, history: unknown[]) => {
    store.set('undoHistory', history)
  })

  ipcMain.handle('store:saveRedoStack', (_event, stack: unknown[]) => {
    store.set('redoStack', stack)
  })

  ipcMain.handle('store:addChangeLog', (_event, entry: ChangeLogEntry) => {
    const log = store.get('changeLog', [])
    log.unshift(entry)
    store.set('changeLog', log.slice(0, 500))
  })

  ipcMain.handle('store:saveSettings', (_event, settings: AppSettings) => {
    store.set('settings', settings)
  })

  // ── PIN IPC ─────────────────────────────────────────────
  ipcMain.handle('pin:verify', (_event, input: string) => {
    const pinSettings = store.get('pinSettings', DEFAULT_PIN)
    const result = verifyPin(input, pinSettings)
    if (result.success) {
      store.set('pinSettings', { ...pinSettings, failedAttempts: 0, lockoutUntil: null })
    } else if (result.lockoutUntil) {
      store.set('pinSettings', {
        ...pinSettings,
        failedAttempts: MAX_ATTEMPTS,
        lockoutUntil: result.lockoutUntil,
      })
    } else {
      store.set('pinSettings', {
        ...pinSettings,
        failedAttempts: pinSettings.failedAttempts + 1,
      })
    }
    return result
  })

  ipcMain.handle('pin:set', (_event, pin: string) => {
    store.set('pinSettings', {
      enabled: true,
      pinHash: hashPin(pin),
      lockoutUntil: null,
      failedAttempts: 0,
    })
    return { success: true }
  })

  ipcMain.handle('pin:disable', (_event, input: string) => {
    const pinSettings = store.get('pinSettings', DEFAULT_PIN)
    if (!pinSettings.enabled) return { success: false, error: 'PIN not enabled' }
    const result = verifyPin(input, pinSettings)
    if (!result.success) return { success: false, error: 'Invalid PIN' }
    store.set('pinSettings', { ...DEFAULT_PIN })
    return { success: true }
  })

  ipcMain.handle('pin:status', () => {
    const pinSettings = store.get('pinSettings', DEFAULT_PIN)
    const locked = !!(pinSettings.lockoutUntil && new Date(pinSettings.lockoutUntil) > new Date())
    return {
      enabled: pinSettings.enabled,
      locked,
      lockoutUntil: pinSettings.lockoutUntil,
      attemptsLeft: locked ? 0 : MAX_ATTEMPTS - pinSettings.failedAttempts,
    }
  })

  ipcMain.handle('openDevTools', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      win.webContents.openDevTools()
    }
  })

  // ── Backups ─────────────────────────────────────────────
  const backupDir = join(app.getPath('userData'), 'backups')

  function getFullStoreData(): Record<string, unknown> {
    return {
      obligations: store.get('obligations', []),
      obligationMonths: store.get('obligationMonths', []),
      banks: store.get('banks', []),
      customSections: store.get('customSections', []),
      undoHistory: store.get('undoHistory', []),
      redoStack: store.get('redoStack', []),
      changeLog: store.get('changeLog', []),
      pinSettings: store.get('pinSettings', DEFAULT_PIN),
      settings: store.get('settings', DEFAULT_SETTINGS),
    }
  }

  const RESTORE_KEYS: (keyof StoreSchema)[] = [
    'obligations',
    'obligationMonths',
    'banks',
    'customSections',
    'undoHistory',
    'redoStack',
    'changeLog',
    'pinSettings',
    'settings',
  ]

  async function createBackup(): Promise<void> {
    await mkdir(backupDir, { recursive: true })
    const data = getFullStoreData()
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `backup-${timestamp}.json`
    await writeFile(join(backupDir, filename), JSON.stringify(data, null, 2), 'utf-8')
    // Keep only the last 10 backups
    const files = (await readdir(backupDir))
      .filter((f) => f.startsWith('backup-') && f.endsWith('.json'))
      .sort()
    if (files.length > 10) {
      for (const old of files.slice(0, files.length - 10)) {
        await unlink(join(backupDir, old)).catch(() => {})
      }
    }
  }

  ipcMain.handle('backup:list', async (): Promise<BackupMeta[]> => {
    await mkdir(backupDir, { recursive: true })
    const files = (await readdir(backupDir))
      .filter((f) => f.startsWith('backup-') && f.endsWith('.json'))
      .sort()
      .reverse()
    const metas: BackupMeta[] = []
    for (const filename of files) {
      const filePath = join(backupDir, filename)
      const info = await stat(filePath)
      let obligationCount = 0
      try {
        const raw = JSON.parse(await readFile(filePath, 'utf-8'))
        obligationCount = Array.isArray(raw.obligations) ? raw.obligations.length : 0
      } catch {}
      // Extract timestamp from filename: backup-2026-04-15T10-30-00-000Z.json
      const tsRaw = filename.replace('backup-', '').replace('.json', '')
      const timestamp = tsRaw.replace(
        /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-\d+Z$/,
        '$1T$2:$3:$4Z'
      )
      metas.push({ filename, timestamp, size: info.size, obligationCount })
    }
    return metas
  })

  ipcMain.handle('backup:create', async () => {
    await createBackup()
  })

  ipcMain.handle('backup:restore', async (_event, filename: string) => {
    const raw = JSON.parse(await readFile(join(backupDir, filename), 'utf-8')) as Record<
      string,
      unknown
    >
    for (const key of RESTORE_KEYS) {
      if (key in raw) store.set(key, raw[key] as never)
    }
    return { success: true }
  })

  ipcMain.handle('backup:exportToFile', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: `maulwurf-lite-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (canceled || !filePath) return { success: false }
    await writeFile(filePath, JSON.stringify(getFullStoreData(), null, 2), 'utf-8')
    return { success: true }
  })

  ipcMain.handle('backup:importFromFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    })
    if (canceled || !filePaths[0]) return { success: false }
    const raw = JSON.parse(await readFile(filePaths[0], 'utf-8')) as Record<string, unknown>
    for (const key of RESTORE_KEYS) {
      if (key in raw) store.set(key, raw[key] as never)
    }
    return { success: true }
  })

  // Auto-backup every 30 minutes
  setInterval(() => {
    createBackup().catch(console.error)
  }, 30 * 60 * 1000)

  // ── Export ──────────────────────────────────────────────
  ipcMain.handle('export:pdf', async (_event, html: string, defaultName: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (canceled || !filePath) return { success: false }

    const pdfWin = new BrowserWindow({
      show: false,
      width: 900,
      height: 600,
      webPreferences: { offscreen: true },
    })
    await pdfWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    // Small delay to let CSS render
    await new Promise((r) => setTimeout(r, 300))
    const pdfBuffer = await pdfWin.webContents.printToPDF({
      printBackground: true,
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
    })
    pdfWin.destroy()
    await writeFile(filePath, pdfBuffer)
    return { success: true, filePath }
  })

  ipcMain.handle('export:md', async (_event, content: string, defaultName: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })
    if (canceled || !filePath) return { success: false }
    await writeFile(filePath, content, 'utf-8')
    return { success: true, filePath }
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
