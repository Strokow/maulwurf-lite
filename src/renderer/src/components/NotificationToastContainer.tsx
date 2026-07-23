import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, CalendarClock, CalendarDays, AlertCircle, Bell } from 'lucide-react'
import { onNotificationToast } from '../services/notificationToastBus'
import type { AppNotification, NotificationType } from '../services/notificationEngine'
import { useI18n } from '../i18n'

interface Toast extends AppNotification {
  id: string
  createdAt: number
}

const MAX_VISIBLE = 3
const AUTO_DISMISS_MS = 12000

const typeConfig: Record<NotificationType, { icon: React.ReactNode; color: string }> = {
  upcoming: { icon: <CalendarClock className="h-4 w-4" />, color: 'border-orange-800/60 bg-orange-950/85' },
  firstOfMonth: { icon: <CalendarDays className="h-4 w-4" />, color: 'border-blue-800/60 bg-blue-950/85' },
  mostlyUnpaid: { icon: <AlertCircle className="h-4 w-4" />, color: 'border-red-800/60 bg-red-950/85' },
}
const fallback = { icon: <Bell className="h-4 w-4" />, color: 'border-neutral-700 bg-neutral-900/90' }

// In-app notifications (Phase 8): bottom-left, app-styled, × + auto-dismiss.
// Mounted in Main → lives only after unlock. Structured notifications are localized
// here via useI18n (the engine stays language-agnostic).
export function NotificationToastContainer({ currency }: { currency: string }): React.JSX.Element {
  const { t, monthName, formatCurrency } = useI18n()
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((x) => x.id !== id))
  }, [])

  useEffect(() => {
    const unsub = onNotificationToast((n) => {
      setToasts((prev) => [
        ...prev.slice(-(MAX_VISIBLE - 1)),
        { ...n, id: crypto.randomUUID(), createdAt: Date.now() },
      ])
    })
    return unsub
  }, [])

  useEffect(() => {
    if (toasts.length === 0) return
    const interval = setInterval(() => {
      const now = Date.now()
      setToasts((prev) => prev.filter((x) => now - x.createdAt < AUTO_DISMISS_MS))
    }, 1000)
    return () => clearInterval(interval)
  }, [toasts.length])

  const render = (n: Toast): { title: string; body: string } => {
    if (n.type === 'upcoming') {
      const parts = (n.items ?? []).map((i) =>
        i.amount != null ? `${i.name} ${formatCurrency(i.amount, currency)}` : i.name
      )
      let items = parts.join(' · ')
      if (n.extraCount && n.extraCount > 0) items += ` ${t('notifAndMore', { n: n.extraCount })}`
      return { title: t('notifUpcomingTitle'), body: t('notifUpcomingBody', { items }) }
    }
    if (n.type === 'firstOfMonth') {
      return { title: t('notifFirstTitle'), body: t('notifFirstBody', { month: monthName(n.month ?? 1) }) }
    }
    return {
      title: t('notifUnpaidTitle'),
      body: t('notifUnpaidBody', {
        month: monthName(n.month ?? 1),
        unpaid: n.unpaid ?? 0,
        total: n.total ?? 0,
      }),
    }
  }

  return (
    <div className="fixed bottom-4 left-4 z-[100] flex max-w-sm flex-col-reverse gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => {
          const cfg = typeConfig[toast.type] ?? fallback
          const { title, body } = render(toast)
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: -80, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -80, scale: 0.95 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              className={`pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3 py-2.5 shadow-lg backdrop-blur-sm ${cfg.color}`}
            >
              <span className="mt-0.5 shrink-0 text-neutral-300">{cfg.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-neutral-100">{title}</p>
                <p className="mt-0.5 text-xs leading-snug text-neutral-300 line-clamp-3">{body}</p>
              </div>
              <button
                onClick={() => dismiss(toast.id)}
                className="shrink-0 rounded p-0.5 text-neutral-500 transition-colors hover:text-neutral-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
