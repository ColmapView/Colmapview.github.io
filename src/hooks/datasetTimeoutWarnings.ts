import { useNotificationStore } from '../store/stores/notificationStore';

export const OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MESSAGE =
  "This dataset's saved view settings (colmapview.yaml) did not load in time, so default settings are shown. Load the dataset again to retry.";

export const SPLAT_LIST_TIMEOUT_MESSAGE =
  "This dataset's splat list did not load in time, so its splats are not shown. Open the dataset link again to retry.";

/** One persistent warning about the dataset on screen: showing it again replaces the earlier one. */
function datasetWarning(message: string) {
  let id: string | null = null;
  const dismiss = (): void => {
    if (id) useNotificationStore.getState().removeNotification(id);
    id = null;
  };
  return {
    show: (): void => {
      dismiss();
      id = useNotificationStore.getState().addNotification('warning', message);
    },
    dismiss,
  };
}

/** Says that a dataset's saved settings timed out. */
export const optionalSettingsTimeoutWarning = datasetWarning(OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MESSAGE);

/** Says that a dataset's splat list timed out. */
export const splatListTimeoutWarning = datasetWarning(SPLAT_LIST_TIMEOUT_MESSAGE);

/** The warnings describe the dataset on screen, so the next load or clearing the scene takes them down. */
export function dismissDatasetTimeoutWarnings(): void {
  optionalSettingsTimeoutWarning.dismiss();
  splatListTimeoutWarning.dismiss();
}
