import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useNotificationStore } from '../../store/stores/notificationStore';
import { useUIStore } from '../../store/stores/uiStore';
import { NotificationContainer } from './NotificationContainer';

const LONG_WARNING = 'Source feature links are inconsistent. Camera and point viewing remains available; feature matching and COLMAP export are disabled.';

function addNotifications() {
  act(() => {
    const { addNotification } = useNotificationStore.getState();
    addNotification('info', 'Loaded 10 points', 0);
    addNotification('warning', LONG_WARNING);
    addNotification('warning', 'Loaded camera geometry; 100/104 photos matched.');
  });
}

describe('NotificationContainer', () => {
  beforeEach(() => {
    useNotificationStore.setState(useNotificationStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  afterEach(cleanup);

  it('stacks every notification on desktop', () => {
    addNotifications();
    render(<NotificationContainer />);

    expect(screen.getAllByRole('button', { name: 'Close notification' })).toHaveLength(3);
  });

  it('shows only the two newest compact notifications in touch mode', () => {
    useUIStore.setState({ touchMode: true });
    addNotifications();
    render(<NotificationContainer />);

    expect(screen.getAllByRole('button', { name: 'Close notification' })).toHaveLength(2);
    expect(screen.queryByText('Loaded 10 points')).toBeNull();
    expect(screen.getByText(LONG_WARNING).closest('.notification-toast-touch')).not.toBeNull();
  });

  it('clamps long touch messages until tapped', () => {
    useUIStore.setState({ touchMode: true });
    addNotifications();
    render(<NotificationContainer />);

    const message = screen.getByText(LONG_WARNING);
    expect(message.className).toContain('notification-message-clamp');
    fireEvent.click(message);
    expect(message.className).not.toContain('notification-message-clamp');
  });
});
