import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Trash2, Lock, Download, Upload, Save, RotateCcw, AlertTriangle, Bell } from 'lucide-react'
import type { BackupMeta, Language, PinStatus } from '../types'
import type { UseStoreReturn } from '../store/useStore'
import { useI18n } from '../i18n'

const BANK_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
  '#14b8a6', '#3b82f6', '#8b5cf6', '#d946ef', '#64748b',
]

// Supported currencies — display-only (no conversion). The symbol shown here is
// the real glyph; amounts everywhere are formatted with currencyDisplay:'narrowSymbol'.
const CURRENCIES: { code: string; symbol: string }[] = [
  { code: 'EUR', symbol: '€' },
  { code: 'USD', symbol: '$' },
  { code: 'GBP', symbol: '£' },
  { code: 'RUB', symbol: '₽' },
]

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  store: UseStoreReturn
}

export function SettingsModal({ isOpen, onClose, store }: SettingsModalProps): React.JSX.Element {
  const { t } = useI18n()
  const { settings, banks, updateSettings, addBank, deleteBank, refresh } = store

  const [newBankName, setNewBankName] = useState('')
  const [newBankColor, setNewBankColor] = useState(BANK_COLORS[6])
  const [pinStatus, setPinStatus] = useState<PinStatus | null>(null)
  const [pinMode, setPinMode] = useState<'none' | 'setup' | 'disable'>('none')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [currentPin, setCurrentPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [backups, setBackups] = useState<BackupMeta[]>([])
  const [restoreConfirm, setRestoreConfirm] = useState<string | null>(null)
  const [backupNotice, setBackupNotice] = useState('')

  const refreshPinStatus = useCallback(async () => {
    const s = (await window.api.pin.status()) as PinStatus
    setPinStatus(s)
  }, [])

  const refreshBackups = useCallback(async () => {
    const list = (await window.api.backup.list()) as BackupMeta[]
    setBackups(list)
  }, [])

  useEffect(() => {
    if (isOpen) {
      void refreshPinStatus()
      void refreshBackups()
      setPinMode('none')
      setNewPin('')
      setConfirmPin('')
      setCurrentPin('')
      setPinError('')
      setBackupNotice('')
      setRestoreConfirm(null)
    }
  }, [isOpen, refreshPinStatus, refreshBackups])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  const handleAddBank = async (): Promise<void> => {
    const name = newBankName.trim()
    if (!name) return
    await addBank(name, newBankColor)
    setNewBankName('')
  }

  const handleSetPin = async (): Promise<void> => {
    setPinError('')
    if (newPin.length !== 6) {
      setPinError(t('pin6digits'))
      return
    }
    if (newPin !== confirmPin) {
      setPinError(t('pinMismatch'))
      return
    }
    await window.api.pin.set(newPin)
    setNewPin('')
    setConfirmPin('')
    setPinMode('none')
    await refreshPinStatus()
  }

  const handleDisablePin = async (): Promise<void> => {
    setPinError('')
    const result = (await window.api.pin.disable(currentPin)) as { success: boolean }
    if (!result.success) {
      setPinError(t('pinDisableFailed'))
      return
    }
    setCurrentPin('')
    setPinMode('none')
    await refreshPinStatus()
  }

  const handleCreateBackup = async (): Promise<void> => {
    await window.api.backup.create()
    setBackupNotice(t('backupCreated'))
    await refreshBackups()
  }

  const handleRestore = async (filename: string): Promise<void> => {
    await window.api.backup.restore(filename)
    setRestoreConfirm(null)
    await refresh()
    await refreshPinStatus()
  }

  const handleImport = async (): Promise<void> => {
    const result = await window.api.backup.importFromFile()
    if (result.success) {
      await refresh()
      await refreshPinStatus()
    }
  }

  const inputCls =
    'w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none'
  const sectionCls = 'rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 space-y-3'
  const smallBtn =
    'flex items-center gap-1.5 rounded-md bg-neutral-800 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-700 transition-colors'

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-900 p-6"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-100">{t('settingsTitle')}</h2>
              <button
                onClick={onClose}
                title={t('cancel')}
                className="rounded-md p-1 text-neutral-500 hover:text-neutral-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Language */}
              <div className={sectionCls}>
                <h3 className="text-sm font-medium text-neutral-300">{t('settingsLanguage')}</h3>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { value: 'en', label: 'English' },
                      { value: 'fr', label: 'Français' },
                      { value: 'de', label: 'Deutsch' },
                      { value: 'ru', label: 'Русский' },
                    ] as { value: Language; label: string }[]
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() =>
                        // Picking Russian auto-switches the currency to the ruble
                        // (only at the moment of choosing — changeable afterwards).
                        void updateSettings(
                          opt.value === 'ru'
                            ? { language: 'ru', currency: 'RUB' }
                            : { language: opt.value }
                        )
                      }
                      className={`flex-1 rounded-md px-3 py-2 text-sm transition-colors ${
                        settings.language === opt.value
                          ? 'bg-green-950/40 text-green-300 ring-1 ring-green-700/50'
                          : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Currency */}
              <div className={sectionCls}>
                <h3 className="text-sm font-medium text-neutral-300">{t('settingsCurrency')}</h3>
                <select
                  value={settings.currency}
                  onChange={(e) => void updateSettings({ currency: e.target.value })}
                  title={t('settingsCurrency')}
                  className={inputCls}
                >
                  {/* Keep a previously-chosen currency selectable even if it is no
                      longer in the curated list (prepended once at the top). */}
                  {(CURRENCIES.some((c) => c.code === settings.currency)
                    ? CURRENCIES
                    : [{ code: settings.currency, symbol: settings.currency }, ...CURRENCIES]
                  ).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.symbol === c.code ? c.code : `${c.symbol}  ${c.code}`}
                    </option>
                  ))}
                </select>
              </div>

              {/* Banks */}
              <div className={sectionCls}>
                <h3 className="text-sm font-medium text-neutral-300">{t('settingsBanks')}</h3>
                <p className="text-xs text-neutral-500">{t('settingsBanksHint')}</p>
                {banks.length === 0 ? (
                  <p className="text-xs text-neutral-600">{t('noBanksYet')}</p>
                ) : (
                  <div className="space-y-1.5">
                    {banks.map((b) => (
                      <div
                        key={b.id}
                        className="flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5"
                      >
                        <span
                          className="inline-block h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: b.color }}
                        />
                        <span className="flex-1 text-sm text-neutral-200">{b.name}</span>
                        <button
                          onClick={() => void deleteBank(b.id)}
                          title={t('deleteBank')}
                          className="rounded p-1 text-neutral-600 hover:bg-red-950 hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    value={newBankName}
                    onChange={(e) => setNewBankName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleAddBank()
                    }}
                    placeholder={t('bankNamePlaceholder')}
                    className={inputCls}
                  />
                  <button
                    onClick={() => void handleAddBank()}
                    disabled={!newBankName.trim()}
                    className="flex shrink-0 items-center gap-1 rounded-md bg-neutral-800 px-3 py-2 text-xs text-neutral-300 transition-colors hover:bg-neutral-700 disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t('addBank')}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {BANK_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setNewBankColor(c)}
                      className={`h-6 w-6 rounded-full transition-transform ${
                        newBankColor === c ? 'scale-110 ring-2 ring-white/70' : 'hover:scale-105'
                      }`}
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>
              </div>

              {/* PIN */}
              <div className={sectionCls}>
                <h3 className="flex items-center gap-2 text-sm font-medium text-neutral-300">
                  <Lock className="h-4 w-4" />
                  {t('settingsPin')}
                </h3>
                <p className="text-xs text-neutral-500">
                  {pinStatus?.enabled ? t('pinEnabled') : t('pinDisabled')}
                </p>
                {pinMode === 'none' && (
                  <div className="flex flex-wrap gap-2">
                    {pinStatus?.enabled ? (
                      <>
                        <button onClick={() => setPinMode('setup')} className={smallBtn}>
                          {t('changePin')}
                        </button>
                        <button
                          onClick={() => setPinMode('disable')}
                          className="flex items-center gap-1.5 rounded-md bg-red-950/40 px-3 py-1.5 text-xs text-red-300 transition-colors hover:bg-red-900/50"
                        >
                          {t('disablePin')}
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setPinMode('setup')} className={smallBtn}>
                        {t('enablePin')}
                      </button>
                    )}
                  </div>
                )}
                {pinMode === 'setup' && (
                  <div className="space-y-2">
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      value={newPin}
                      onChange={(e) => {
                        setNewPin(e.target.value.replace(/\D/g, ''))
                        setPinError('')
                      }}
                      placeholder={t('newPin')}
                      className={inputCls}
                    />
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      value={confirmPin}
                      onChange={(e) => {
                        setConfirmPin(e.target.value.replace(/\D/g, ''))
                        setPinError('')
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleSetPin()
                      }}
                      placeholder={t('confirmPin')}
                      className={inputCls}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => void handleSetPin()}
                        disabled={newPin.length !== 6 || confirmPin.length !== 6}
                        className="rounded-md bg-green-900/50 px-3 py-1.5 text-xs font-medium text-green-300 hover:bg-green-900 disabled:opacity-40"
                      >
                        {t('setPin')}
                      </button>
                      <button
                        onClick={() => {
                          setPinMode('none')
                          setPinError('')
                          setNewPin('')
                          setConfirmPin('')
                        }}
                        className="rounded-md px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200"
                      >
                        {t('cancel')}
                      </button>
                    </div>
                  </div>
                )}
                {pinMode === 'disable' && (
                  <div className="space-y-2">
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      value={currentPin}
                      onChange={(e) => {
                        setCurrentPin(e.target.value.replace(/\D/g, ''))
                        setPinError('')
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleDisablePin()
                      }}
                      placeholder={t('currentPin')}
                      className={inputCls}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => void handleDisablePin()}
                        disabled={currentPin.length !== 6}
                        className="rounded-md bg-red-900/50 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-900 disabled:opacity-40"
                      >
                        {t('disablePin')}
                      </button>
                      <button
                        onClick={() => {
                          setPinMode('none')
                          setPinError('')
                          setCurrentPin('')
                        }}
                        className="rounded-md px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200"
                      >
                        {t('cancel')}
                      </button>
                    </div>
                  </div>
                )}
                {pinError && (
                  <p className="flex items-center gap-2 text-xs text-red-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {pinError}
                  </p>
                )}
              </div>

              {/* Backups */}
              <div className={sectionCls}>
                <h3 className="text-sm font-medium text-neutral-300">{t('settingsBackups')}</h3>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => void handleCreateBackup()} className={smallBtn}>
                    <Save className="h-3.5 w-3.5" />
                    {t('backupCreate')}
                  </button>
                  <button onClick={() => void window.api.backup.exportToFile()} className={smallBtn}>
                    <Download className="h-3.5 w-3.5" />
                    {t('backupExport')}
                  </button>
                  <button onClick={() => void handleImport()} className={smallBtn}>
                    <Upload className="h-3.5 w-3.5" />
                    {t('backupImport')}
                  </button>
                </div>
                {backupNotice && <p className="text-xs text-green-400">{backupNotice}</p>}
                {backups.length === 0 ? (
                  <p className="text-xs text-neutral-600">{t('backupEmpty')}</p>
                ) : (
                  <div className="max-h-48 space-y-1.5 overflow-y-auto">
                    {backups.map((b) => (
                      <div
                        key={b.filename}
                        className="flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs"
                      >
                        <span className="flex-1 text-neutral-300">
                          {new Date(b.timestamp).toLocaleString()}
                        </span>
                        <span className="text-neutral-600">
                          {t('backupObligations', { n: b.obligationCount })}
                        </span>
                        {restoreConfirm === b.filename ? (
                          <>
                            <span className="text-amber-400">{t('backupRestoreConfirm')}</span>
                            <button
                              onClick={() => void handleRestore(b.filename)}
                              className="rounded bg-amber-900/50 px-2 py-0.5 text-amber-300 hover:bg-amber-900"
                            >
                              OK
                            </button>
                            <button
                              onClick={() => setRestoreConfirm(null)}
                              title={t('cancel')}
                              className="text-neutral-500 hover:text-neutral-300"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setRestoreConfirm(b.filename)}
                            className="flex items-center gap-1 rounded bg-neutral-800 px-2 py-0.5 text-neutral-300 hover:bg-neutral-700"
                          >
                            <RotateCcw className="h-3 w-3" />
                            {t('backupRestore')}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notifications (Phase 8) */}
              <div className={sectionCls}>
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-medium text-neutral-300">
                    <Bell className="h-4 w-4" />
                    {t('notifSettingsTitle')}
                  </h3>
                  <button
                    onClick={() =>
                      void updateSettings({ notificationsEnabled: settings.notificationsEnabled === false })
                    }
                    title={
                      settings.notificationsEnabled !== false ? t('notifDisable') : t('notifEnable')
                    }
                    className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                      settings.notificationsEnabled !== false ? 'bg-amber-600' : 'bg-neutral-700'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                        settings.notificationsEnabled !== false ? 'left-[18px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>
                <p className="text-xs text-neutral-500">{t('notifSettingsDesc')}</p>
                <ul className="space-y-1.5 text-xs text-neutral-400">
                  <li>• {t('notifType1')}</li>
                  <li>• {t('notifType2')}</li>
                  <li>• {t('notifType3')}</li>
                </ul>
              </div>

              {/* About */}
              <div className={sectionCls}>
                <h3 className="text-sm font-medium text-neutral-300">{t('settingsAbout')}</h3>
                <p className="text-xs text-neutral-500">
                  Maulwurf Lite · v{__APP_VERSION__} · local-first, no cloud
                </p>
                <div className="flex items-center justify-between border-t border-neutral-800 pt-3 text-[11px] text-neutral-600">
                  <span>Apache-2.0 · © 2026 Strokow</span>
                  <a
                    href="https://github.com/Strokow/maulwurf-lite"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 transition-colors hover:text-neutral-300"
                  >
                    <svg
                      viewBox="0 0 16 16"
                      className="h-3.5 w-3.5"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
                    </svg>
                    GitHub
                  </a>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
