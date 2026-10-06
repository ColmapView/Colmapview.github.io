import { useNotificationStore } from '../store/stores/notificationStore';
import { OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MESSAGE } from './urlLoaderViewerState';

// The warning describes the dataset on screen, so the next load takes it down.
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
