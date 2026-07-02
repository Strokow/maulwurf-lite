import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import type { PinStatus } from '../types'
import { useI18n } from '../i18n'

interface PinGateProps {
  status: PinStatus
  onUnlock: () => void
  onRefresh: () => Promise<void>
}

export function PinGate({ status, onUnlock, onRefresh }: PinGateProps): React.JSX.Element {
  const { t } = useI18n()
  const [inputPin, setInputPin] = useState('')
  const [error, setError] = useState('')
  const [countdown, setCountdown] = useState('')
  // The "Log in" button appears only after a wrong attempt; on the first try
  // verification fires automatically once 6 digits are entered.
  const [showLoginBtn, setShowLoginBtn] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!status.locked) inputRef.current?.focus()
  }, [status.locked])

  useEffect(() => {
    if (status.locked && status.lockoutUntil) {
      const updateCountdown = (): void => {
        const diff = new Date(status.lockoutUntil!).getTime() - Date.now()
        if (diff <= 0) {
          setCountdown('')
          void onRefresh()
          return
        }
        const mins = Math.floor(diff / 60000)
        const secs = Math.floor((diff % 60000) / 1000)
        setCountdown(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`)
      }
      updateCountdown()
      const interval = setInterval(updateCountdown, 1000)
      return () => clearInterval(interval)
    }
    return undefined
  }, [status.locked, status.lockoutUntil, onRefresh])

  const handleVerify = async (pin?: string): Promise<void> => {
    const pinToVerify = pin ?? inputPin
    if (pinToVerify.length !== 6) {
      setError(t('pin6digits'))
      return
    }
    try {
      const result = (await window.api.pin.verify(pinToVerify)) as {
        success: boolean
        locked: boolean
        attemptsLeft: number
        lockoutUntil?: string
      }
      if (result.success) {
        onUnlock()
      } else if (result.locked) {
        setShowLoginBtn(true)
        setError(t('tooManyAttempts'))
        await onRefresh()
      } else {
        setShowLoginBtn(true)
        setError(`${t('wrongPin')} · ${t('attemptsLeft', { n: result.attemptsLeft })}`)
      }
    } catch (e) {
      setError(`${t('error')}: ${e instanceof Error ? e.message : String(e)}`)
    }
    setInputPin('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 p-8"
      >
        {status.locked && countdown ? (
          <div className="py-4 text-center">
            <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-orange-500" />
            <p className="mb-2 text-neutral-300">{t('tooManyAttempts')}</p>
            <p className="font-mono text-3xl text-orange-400">{countdown}</p>
            <p className="mt-2 text-xs text-neutral-500">{t('tryAgainLater')}</p>
          </div>
        ) : (
          <>
            <h2 className="mb-6 text-center text-lg font-medium text-neutral-200">
              {t('enterPin')}
            </h2>
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              autoFocus
              maxLength={6}
              value={inputPin}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 6)
                setInputPin(val)
                setError('')
                if (val.length === 6) void handleVerify(val)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && inputPin.length === 6) void handleVerify()
              }}
              className="mb-4 w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-3 text-center text-2xl tracking-[0.5em] text-neutral-200 focus:border-green-600 focus:outline-none"
              placeholder="••••••"
            />
            {showLoginBtn && (
              <button
                type="button"
                onClick={() => void handleVerify()}
                disabled={inputPin.length !== 6}
                className="w-full rounded bg-green-900/50 py-2.5 text-sm font-medium text-green-300 transition-colors hover:bg-green-900 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t('logIn')}
              </button>
            )}
            {error && (
              <p className="mt-4 flex items-center justify-center gap-2 text-center text-sm text-red-400">
                <AlertTriangle className="h-4 w-4" />
                {error}
              </p>
            )}
          </>
        )}
      </motion.div>
    </div>
  )
}
