import { afterEach, describe, expect, it } from 'vitest';
import { useNotificationStore } from '../store/stores/notificationStore';
import { dismissSplatListTimeoutWarning, showSplatListTimeoutWarning, SPLAT_LIST_TIMEOUT_MESSAGE } from './splatListWarning';

const warnings = () => useNotificationStore.getState().notifications
  .filter(notification => notification.message === SPLAT_LIST_TIMEOUT_MESSAGE);

describe('splat list timeout warning', () => {
  afterEach(() => {
    dismissSplatListTimeoutWarning();
    useNotificationStore.setState(useNotificationStore.getInitialState(), true);
  });

  it('shows one persistent warning with the retry advice', () => {
    showSplatListTimeoutWarning();
    expect(SPLAT_LIST_TIMEOUT_MESSAGE).toBe(
      "This dataset's splat list did not load in time, so its splats are not shown. Open the dataset link again to retry.");
    expect(warnings()).toEqual([expect.objectContaining({ type: 'warning', duration: undefined })]);
  });

  it('replaces the earlier warning instead of stacking another', () => {
    showSplatListTimeoutWarning();
    showSplatListTimeoutWarning();
    expect(warnings()).toHaveLength(1);
  });

  it('removes only its own warning', () => {
    useNotificationStore.getState().addNotification('warning', 'Unrelated warning');
    showSplatListTimeoutWarning();
    dismissSplatListTimeoutWarning();
    expect(warnings()).toEqual([]);
    expect(useNotificationStore.getState().notifications).toEqual([
      expect.objectContaining({ message: 'Unrelated warning' })]);
  });
});
