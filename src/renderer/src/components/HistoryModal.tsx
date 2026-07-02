import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import type { ChangeLogEntry } from '../types'
import { useI18n } from '../i18n'

interface HistoryModalProps {
  isOpen: boolean
  onClose: () => void
  changeLog: ChangeLogEntry[]
}

export function HistoryModal({ isOpen, onClose, changeLog }: HistoryModalProps): React.JSX.Element {
  const { t, formatDateTime } = useI18n()

  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

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
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-900 p-6"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-100">{t('historyTitle')}</h2>
              <button
                onClick={onClose}
                title={t('cancel')}
                className="rounded-md p-1 text-neutral-500 hover:text-neutral-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {changeLog.length === 0 ? (
              <p className="text-sm text-neutral-500">{t('historyEmpty')}</p>
            ) : (
              <div className="space-y-1.5">
                {changeLog.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-baseline gap-3 rounded-md border border-neutral-800 bg-neutral-900/60 px-3 py-2"
                  >
                    <span className="shrink-0 font-mono text-[11px] text-neutral-600">
                      {formatDateTime(new Date(entry.timestamp))}
                    </span>
                    <span className="text-sm text-neutral-300">{entry.description}</span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
