import { afterEach, describe, expect, it } from 'vitest';
import { useNotificationStore } from '../store/stores/notificationStore';
import { notificationsWithMessage } from '../test/notifications';
import {
  dismissDatasetTimeoutWarnings,
  OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MESSAGE,
  optionalSettingsTimeoutWarning,
  SPLAT_LIST_TIMEOUT_MESSAGE,
  splatListTimeoutWarning,
} from './datasetTimeoutWarnings';

const optionalSettings = { warning: optionalSettingsTimeoutWarning, message: OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MESSAGE };
const splatList = { warning: splatListTimeoutWarning, message: SPLAT_LIST_TIMEOUT_MESSAGE };

afterEach(() => {
  dismissDatasetTimeoutWarnings();
  useNotificationStore.setState(useNotificationStore.getInitialState(), true);
});

describe.each([
  ['optional settings', optionalSettings, splatList,
    "This dataset's saved view settings (colmapview.yaml) did not load in time, so default settings are shown. Load the dataset again to retry."],
  ['splat list', splatList, optionalSettings,
    "This dataset's splat list did not load in time, so its splats are not shown. Open the dataset link again to retry."],
])('%s timeout warning', (_name, { warning, message }, other, text) => {
  const warnings = () => notificationsWithMessage(message);

  it('shows one persistent warning with the retry advice', () => {
    warning.show();
    expect(message).toBe(text);
    expect(warnings()).toEqual([expect.objectContaining({ type: 'warning', duration: undefined })]);
  });

  it('replaces the earlier warning instead of stacking another', () => {
    warning.show();
    warning.show();
    expect(warnings()).toHaveLength(1);
  });

  it('removes only its own warning', () => {
    useNotificationStore.getState().addNotification('warning', 'Unrelated warning');
    other.warning.show();
    warning.show();
    warning.dismiss();
    expect(warnings()).toEqual([]);
    expect(useNotificationStore.getState().notifications).toEqual([
      expect.objectContaining({ message: 'Unrelated warning' }), expect.objectContaining({ message: other.message })]);
  });
});

describe('dataset timeout warnings', () => {
  it('are taken down together, leaving every other notification', () => {
    useNotificationStore.getState().addNotification('warning', 'Unrelated warning');
    optionalSettingsTimeoutWarning.show();
    splatListTimeoutWarning.show();
    dismissDatasetTimeoutWarnings();
    expect(useNotificationStore.getState().notifications).toEqual([
      expect.objectContaining({ message: 'Unrelated warning' })]);
  });
});
