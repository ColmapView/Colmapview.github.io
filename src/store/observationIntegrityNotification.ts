import { observationIntegrityWarning, type ObservationIntegrity } from '../parsers/observationIntegrity';
import { useNotificationStore } from './stores/notificationStore';

let notificationId: string | null = null;
let currentMessage: string | null = null;

/** Publish only when a scene commits; failed loads leave the current warning alone. */
export function updateObservationIntegrityNotification(integrity?: ObservationIntegrity, newScene = true): void {
  const message = integrity ? observationIntegrityWarning(integrity) : null;
  if (!newScene && message === currentMessage) return;
  if (notificationId) useNotificationStore.getState().removeNotification(notificationId);
  currentMessage = message;
  notificationId = message ? useNotificationStore.getState().addNotification('warning', message) : null;
}
