import { useNotificationStore } from '../store/stores/notificationStore';

export const SPLAT_LIST_TIMEOUT_MESSAGE =
  "This dataset's splat list did not load in time, so its splats are not shown. Open the dataset link again to retry.";

// The warning describes the dataset on screen, so the next load or clearing the scene takes it down.
let warningId: string | null = null;

/** Say that a dataset's splat list timed out, replacing an earlier such warning. */
export function showSplatListTimeoutWarning(): void {
  dismissSplatListTimeoutWarning();
  warningId = useNotificationStore.getState().addNotification('warning', SPLAT_LIST_TIMEOUT_MESSAGE);
}

export function dismissSplatListTimeoutWarning(): void {
  if (warningId) useNotificationStore.getState().removeNotification(warningId);
  warningId = null;
}
