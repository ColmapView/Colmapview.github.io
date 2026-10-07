import { useNotificationStore } from '../store/stores/notificationStore';

export const OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MESSAGE =
  "This dataset's saved view settings (colmapview.yaml) did not load in time, so default settings are shown. Load the dataset again to retry.";

// The warning describes the dataset on screen, so the next load or clearing the scene takes it down.
let warningId: string | null = null;

/** Say that a dataset's saved settings timed out, replacing an earlier such warning. */
export function showOptionalSettingsTimeoutWarning(): void {
  dismissOptionalSettingsTimeoutWarning();
  warningId = useNotificationStore.getState().addNotification('warning', OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MESSAGE);
}

export function dismissOptionalSettingsTimeoutWarning(): void {
  if (warningId) useNotificationStore.getState().removeNotification(warningId);
  warningId = null;
}
