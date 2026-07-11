import { useState, useEffect, useCallback } from 'react'
import type { AppData, AppSettings, Language, PinStatus } from './types'
import { I18nProvider } from './i18n'
import { useStore } from './store/useStore'
import { Onboarding } from './components/Onboarding'
import { PinGate } from './components/PinGate'
import { ObligationsPage } from './components/ObligationsPage'

interface BootState {
  settings: AppSettings
  pin: PinStatus
}

function Main(): React.JSX.Element {
  const store = useStore()
  if (store.loading) {
    return <div className="h-screen w-screen bg-neutral-950" />
  }
  return (
    <I18nProvider language={store.settings.language}>
      <ObligationsPage store={store} />
    </I18nProvider>
  )
}

function App(): React.JSX.Element {
  const [boot, setBoot] = useState<BootState | null>(null)
  const [unlocked, setUnlocked] = useState(false)

  const loadBoot = useCallback(async () => {
    const data = (await window.api.store.getAll()) as AppData
    const pin = (await window.api.pin.status()) as PinStatus
    setBoot({ settings: data.settings, pin })
  }, [])

  useEffect(() => {
    void loadBoot()
  }, [loadBoot])

  if (!boot) {
    return <div className="h-screen w-screen bg-neutral-950" />
  }

  // First run: language selection + optional PIN setup.
  if (!boot.settings.onboarded) {
    return (
      <Onboarding
        onComplete={async (language: Language) => {
          await window.api.store.saveSettings({
            ...boot.settings,
            language,
            // Choosing Russian at first run defaults the currency to the ruble.
            currency: language === 'ru' ? 'RUB' : boot.settings.currency,
            onboarded: true,
          })
          // The user just typed (or skipped) the PIN — don't ask again right away.
          setUnlocked(true)
          await loadBoot()
        }}
      />
    )
  }

  if (boot.pin.enabled && !unlocked) {
    return (
      <I18nProvider language={boot.settings.language}>
        <PinGate status={boot.pin} onUnlock={() => setUnlocked(true)} onRefresh={loadBoot} />
      </I18nProvider>
    )
  }

  return <Main />
}

export default App
