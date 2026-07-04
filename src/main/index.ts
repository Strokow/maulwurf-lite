import { app, shell, safeStorage, BrowserWindow, ipcMain, Menu, dialog } from 'electron'
import { basename, join } from 'path'
import { readFileSync } from 'fs'
import { writeFile, readFile, readdir, mkdir, unlink, stat } from 'fs/promises'
import { optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.ico?asset'
import Store from 'electron-store'
import { hashPin, verifyPin } from './pinService'

const MAX_ATTEMPTS = 3

// ── Encryption at rest (safeStorage / DPAPI on Windows) ─────
// config.json and internal backups are encrypted, tied to the OS user account.
// Manual export-to-file stays plaintext JSON on purpose (portable). If the OS
// keychain is unavailable we transparently fall back to plaintext so the app
// never becomes unusable.
const ENC_TAG = '__mlwEnc'

function encryptString(plain: string): string {
  if (!safeStorage.isEncryptionAvailable()) return plain
  const payload = safeStorage.encryptString(plain).toString('base64')
  return JSON.stringify({ [ENC_TAG]: 1, data: payload })
}

// Reads either an encrypted wrapper or legacy plaintext (auto-migration path).
function decryptString(raw: string): string {
  const trimmed = raw.trimStart()
  if (trimmed.startsWith(`{"${ENC_TAG}"`)) {
    try {
      const parsed = JSON.parse(raw) as { [ENC_TAG]?: number; data?: string }
      if (parsed[ENC_TAG] === 1 && typeof parsed.data === 'string') {
        return safeStorage.decryptString(Buffer.from(parsed.data, 'base64'))
      }
    } catch {
      // fall through to returning the raw content
    }
  }
  return raw
}

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

interface Income {
  id: string
  date: string
  amount: number
  label: string
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
  incomes: Income[]
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

// Constructed inside app.whenReady() — safeStorage is only usable after the
// app is ready, and serialize/deserialize below depend on it.
function createStore(): Store<StoreSchema> {
  const store = new Store<StoreSchema>({
    // @ts-ignore - projectName is valid at runtime but missing from electron-store typedefs
    projectName: 'maulwurf-lite',
    // Whole-file encryption via safeStorage; legacy plaintext files are read
    // transparently and re-encrypted on the next write (see migration below).
    serialize: (value): string => encryptString(JSON.stringify(value, null, 2)),
    deserialize: (raw): StoreSchema => JSON.parse(decryptString(raw)),
    defaults: {
      obligations: [],
      obligationMonths: [],
      banks: [],
      incomes: [],
      customSections: [],
      undoHistory: [],
      redoStack: [],
      changeLog: [],
      pinSettings: DEFAULT_PIN,
      settings: DEFAULT_SETTINGS,
    },
  })
  // One-time migration: if the on-disk file is still plaintext, force a full
  // rewrite (conf writes the whole file) so it goes through `serialize` and
  // gets encrypted. Skipped when the file is already encrypted or absent.
  if (safeStorage.isEncryptionAvailable()) {
    try {
      const onDisk = readFileSync(store.path, 'utf-8')
      if (!onDisk.trimStart().startsWith(`{"${ENC_TAG}"`)) {
        store.set('settings', store.get('settings', DEFAULT_SETTINGS))
      }
    } catch {
      // No file yet (fresh install) — the first real write will be encrypted.
    }
  }
  return store
}

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

  // Ctrl+Shift+I toggles DevTools — dev builds only. In a packaged app the
  // console would let anyone read the store or reset the PIN, so it is disabled.
  if (is.dev) {
    mainWindow.webContents.on('before-input-event', (_event, input) => {
      if (input.control && input.shift && input.key.toLowerCase() === 'i') {
        mainWindow.webContents.toggleDevTools()
      }
    })
  }

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Block in-page navigation: a link dropped onto the window must not steer the
  // app (which has the preload attached) to an arbitrary origin. Only the dev
  // server URL is allowed; in production nothing navigates.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (devUrl && url.startsWith(devUrl)) return
    event.preventDefault()
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

  const store = createStore()

  // Renderer lock state, enforced in the main process (defence in depth): when
  // a PIN is enabled the sensitive store channels stay closed until pin:verify
  // (or pin:set/disable) proves the PIN — an open DevTools console can't read
  // or write data at the lock screen. Starts unlocked when no PIN is set.
  let unlocked = !store.get('pinSettings', DEFAULT_PIN).enabled

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

  // Sensitive mutations refuse to run until the PIN gate is passed — an open
  // console can't alter data at the lock screen.
  const guardWrite = (): void => {
    if (!unlocked) throw new Error('locked')
  }

  // ── Store IPC ───────────────────────────────────────────
  // While locked, getAll returns ONLY what the boot screen legitimately needs
  // (language + onboarded flag) — never the financial data behind the PIN.
  ipcMain.handle('store:getAll', () => {
    const settings = store.get('settings', DEFAULT_SETTINGS)
    const pinSettings = store.get('pinSettings', DEFAULT_PIN)
    if (!unlocked) {
      return {
        obligations: [],
        obligationMonths: [],
        banks: [],
        incomes: [],
        customSections: [],
        undoHistory: [],
        redoStack: [],
        changeLog: [],
        pinSettings,
        settings,
      }
    }
    return {
      obligations: store.get('obligations', []),
      obligationMonths: store.get('obligationMonths', []),
      banks: store.get('banks', []),
      incomes: store.get('incomes', []),
      customSections: store.get('customSections', []),
      undoHistory: store.get('undoHistory', []),
      redoStack: store.get('redoStack', []),
      changeLog: store.get('changeLog', []),
      pinSettings,
      settings,
    }
  })

  ipcMain.handle('store:addObligation', (_event, obligation: Obligation) => {
    guardWrite()
    const obligations = store.get('obligations', [])
    obligations.push(obligation)
    store.set('obligations', obligations)
  })

  ipcMain.handle('store:updateObligation', (_event, id: string, updates: Partial<Obligation>) => {
    guardWrite()
    const obligations = store.get('obligations', [])
    const idx = obligations.findIndex((o) => o.id === id)
    if (idx !== -1) {
      obligations[idx] = { ...obligations[idx], ...updates }
      store.set('obligations', obligations)
    }
  })

  ipcMain.handle('store:deleteObligation', (_event, id: string) => {
    guardWrite()
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
    guardWrite()
    store.set('obligations', obligations)
  })

  ipcMain.handle('store:setObligationMonth', (_event, record: ObligationMonth) => {
    guardWrite()
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
    guardWrite()
    store.set('obligationMonths', months)
  })

  ipcMain.handle('store:setBanks', (_event, banks: Bank[]) => {
    guardWrite()
    store.set('banks', banks)
  })

  ipcMain.handle('store:setIncomes', (_event, incomes: Income[]) => {
    guardWrite()
    store.set('incomes', incomes)
  })

  ipcMain.handle('store:saveCustomSections', (_event, sections: unknown[]) => {
    guardWrite()
    store.set('customSections', sections)
  })

  ipcMain.handle('store:saveUndoHistory', (_event, history: unknown[]) => {
    guardWrite()
    store.set('undoHistory', history)
  })

  ipcMain.handle('store:saveRedoStack', (_event, stack: unknown[]) => {
    guardWrite()
    store.set('redoStack', stack)
  })

  ipcMain.handle('store:addChangeLog', (_event, entry: ChangeLogEntry) => {
    guardWrite()
    const log = store.get('changeLog', [])
    log.unshift(entry)
    store.set('changeLog', log.slice(0, 500))
  })

  ipcMain.handle('store:saveSettings', (_event, settings: AppSettings) => {
    guardWrite()
    store.set('settings', settings)
  })

  // ── PIN IPC ─────────────────────────────────────────────
  ipcMain.handle('pin:verify', (_event, input: string) => {
    const pinSettings = store.get('pinSettings', DEFAULT_PIN)
    const result = verifyPin(input, pinSettings)
    if (result.success) {
      unlocked = true // correct PIN — open the sensitive channels for this session
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
    // Changing an existing PIN requires being past the gate — this blocks a
    // silent PIN reset from an open console at the lock screen. First-time
    // setup (no PIN yet) is allowed: `unlocked` is true when none is enabled.
    if (store.get('pinSettings', DEFAULT_PIN).enabled && !unlocked) {
      return { success: false, error: 'locked' }
    }
    store.set('pinSettings', {
      enabled: true,
      pinHash: hashPin(pin),
      lockoutUntil: null,
      failedAttempts: 0,
    })
    unlocked = true
    return { success: true }
  })

  ipcMain.handle('pin:disable', (_event, input: string) => {
    const pinSettings = store.get('pinSettings', DEFAULT_PIN)
    if (!pinSettings.enabled) return { success: false, error: 'PIN not enabled' }
    const result = verifyPin(input, pinSettings)
    if (!result.success) return { success: false, error: 'Invalid PIN' }
    store.set('pinSettings', { ...DEFAULT_PIN })
    unlocked = true // PIN proven and now removed
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
    // Dev builds only — see the DevTools note in createWindow.
    if (!is.dev) return
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
      incomes: store.get('incomes', []),
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
    'incomes',
    'customSections',
    'undoHistory',
    'redoStack',
    'changeLog',
    'pinSettings',
    'settings',
  ]

  // Internal backups live in %APPDATA% next to config.json, so they are
  // encrypted the same way. Manual export-to-file stays plaintext (portable).
  async function createBackup(): Promise<void> {
    await mkdir(backupDir, { recursive: true })
    const data = getFullStoreData()
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `backup-${timestamp}.json`
    await writeFile(
      join(backupDir, filename),
      encryptString(JSON.stringify(data, null, 2)),
      'utf-8'
    )
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
        const raw = JSON.parse(decryptString(await readFile(filePath, 'utf-8')))
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
    guardWrite()
    await createBackup()
  })

  ipcMain.handle('backup:restore', async (_event, filename: string) => {
    guardWrite()
    // Harden against path traversal: strip any directory part and accept only a
    // real backup file name — a crafted `../../foo` can't escape the backup dir.
    const safe = basename(String(filename))
    if (!/^backup-[\d-]+T[\d-]+Z\.json$/.test(safe)) {
      return { success: false, error: 'invalid filename' }
    }
    const parsed = JSON.parse(
      decryptString(await readFile(join(backupDir, safe), 'utf-8'))
    ) as Record<string, unknown>
    if (typeof parsed !== 'object' || parsed === null) {
      return { success: false, error: 'invalid backup' }
    }
    for (const key of RESTORE_KEYS) {
      if (key in parsed) store.set(key, parsed[key] as never)
    }
    return { success: true }
  })

  ipcMain.handle('backup:exportToFile', async () => {
    guardWrite() // exporting reads all data — never allow it at the lock screen
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: `maulwurf-lite-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (canceled || !filePath) return { success: false }
    // Plaintext on purpose: a manual export is meant to be portable/shareable.
    await writeFile(filePath, JSON.stringify(getFullStoreData(), null, 2), 'utf-8')
    return { success: true }
  })

  ipcMain.handle('backup:importFromFile', async () => {
    guardWrite()
    const { canceled, filePaths } = await dialog.showOpenDialog({
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    })
    if (canceled || !filePaths[0]) return { success: false }
    // Tolerates both a plaintext export and an encrypted backup file.
    const raw = JSON.parse(decryptString(await readFile(filePaths[0], 'utf-8'))) as Record<
      string,
      unknown
    >
    if (typeof raw !== 'object' || raw === null) return { success: false, error: 'invalid file' }
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
