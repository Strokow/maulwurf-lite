// In-app notification bus (Phase 8). Main runs notificationEngine and emits
// structured AppNotification; NotificationToastContainer subscribes and localizes.
import type { AppNotification } from './notificationEngine'

type Listener = (notification: AppNotification) => void

const listeners = new Set<Listener>()

export function onNotificationToast(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function emitNotificationToast(notification: AppNotification): void {
  for (const fn of listeners) fn(notification)
}
