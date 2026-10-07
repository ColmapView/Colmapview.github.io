import { afterEach, describe, expect, it } from 'vitest';
import { useNotificationStore } from '../store/stores/notificationStore';
import { dismissOptionalSettingsTimeoutWarning, OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MESSAGE, showOptionalSettingsTimeoutWarning } from './optionalSettingsWarning';

const warnings = () => useNotificationStore.getState().notifications
  .filter(notification => notification.message === OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MESSAGE);

describe('optional settings timeout warning', () => {
  afterEach(() => {
    dismissOptionalSettingsTimeoutWarning();
    useNotificationStore.setState(useNotificationStore.getInitialState(), true);
  });

  it('shows one persistent warning', () => {
    showOptionalSettingsTimeoutWarning();
    expect(warnings()).toEqual([expect.objectContaining({ type: 'warning', duration: undefined })]);
  });

  it('replaces the earlier warning instead of stacking another', () => {
    showOptionalSettingsTimeoutWarning();
    showOptionalSettingsTimeoutWarning();
    expect(warnings()).toHaveLength(1);
  });

  it('removes only its own warning', () => {
    useNotificationStore.getState().addNotification('warning', 'Unrelated warning');
    showOptionalSettingsTimeoutWarning();
    dismissOptionalSettingsTimeoutWarning();
    expect(warnings()).toEqual([]);
    expect(useNotificationStore.getState().notifications).toEqual([
      expect.objectContaining({ message: 'Unrelated warning' })]);
  });
});
