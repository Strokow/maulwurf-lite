import { useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Globe, Lock } from 'lucide-react'
import type { Language } from '../types'
import { buildI18n } from '../i18n'

interface OnboardingProps {
  onComplete: (language: Language) => Promise<void>
}

export function Onboarding({ onComplete }: OnboardingProps): React.JSX.Element {
  const [step, setStep] = useState<'language' | 'pin'>('language')
  const [language, setLanguage] = useState<Language>('en')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const i18n = buildI18n(language)
  const t = i18n.t

  const finish = async (withPin: boolean): Promise<void> => {
    if (saving) return
    setError('')
    if (withPin) {
      if (newPin.length !== 6) {
        setError(t('pin6digits'))
        return
      }
      if (newPin !== confirmPin) {
        setError(t('pinMismatch'))
        return
      }
    }
    setSaving(true)
    try {
      if (withPin) {
        await window.api.pin.set(newPin)
      }
      await onComplete(language)
    } catch (e) {
      setError(`${t('error')}: ${e instanceof Error ? e.message : String(e)}`)
      setSaving(false)
    }
  }

  if (step === 'language') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-neutral-950">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-8"
        >
          <div className="mb-6 text-center">
            <Globe className="mx-auto mb-3 h-10 w-10 text-neutral-400" />
            <h1 className="text-xl font-semibold text-neutral-100">Maulwurf Lite</h1>
            <p className="mt-2 text-sm text-neutral-400">
              Choose your language · Choisissez votre langue
            </p>
          </div>
          <div className="space-y-2">
            {(
              [
                { value: 'en', label: 'English' },
                { value: 'fr', label: 'Français' },
              ] as { value: Language; label: string }[]
            ).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setLanguage(opt.value)}
                className={`w-full rounded-xl border px-4 py-3 text-left text-base font-medium transition-colors ${
                  language === opt.value
                    ? 'border-green-600 bg-green-950/30 text-green-300'
                    : 'border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-500'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-neutral-500">{t('languageHint')}</p>
          <button
            onClick={() => setStep('pin')}
            className="mt-5 w-full rounded-lg bg-green-900/50 py-2.5 text-sm font-medium text-green-300 hover:bg-green-900"
          >
            {t('continue')}
          </button>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-neutral-950">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-8"
      >
        <div className="mb-6 text-center">
          <Lock className="mx-auto mb-3 h-10 w-10 text-neutral-400" />
          <h2 className="text-lg font-semibold text-neutral-100">{t('pinSetupTitle')}</h2>
          <p className="mt-2 text-sm text-neutral-400">{t('pinSetupDesc')}</p>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-neutral-500">{t('newPin')}</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              autoFocus
              value={newPin}
              onChange={(e) => {
                setNewPin(e.target.value.replace(/\D/g, ''))
                setError('')
              }}
              className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-center text-2xl tracking-widest text-neutral-200"
              placeholder="••••••"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500">{t('confirmPin')}</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={confirmPin}
              onChange={(e) => {
                setConfirmPin(e.target.value.replace(/\D/g, ''))
                setError('')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newPin.length === 6 && confirmPin.length === 6) {
                  void finish(true)
                }
              }}
              className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-center text-2xl tracking-widest text-neutral-200"
              placeholder="••••••"
            />
          </div>
          {error && (
            <p className="flex items-center gap-2 text-sm text-red-400">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </p>
          )}
          <button
            onClick={() => void finish(true)}
            disabled={newPin.length !== 6 || confirmPin.length !== 6 || saving}
            className="w-full rounded bg-green-900/50 py-2.5 text-sm font-medium text-green-300 hover:bg-green-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('setPin')}
          </button>
          <button
            onClick={() => void finish(false)}
            disabled={saving}
            className="w-full rounded py-2 text-sm text-neutral-500 hover:text-neutral-300"
          >
            {t('skipPin')}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
