import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNotificationStore } from '../../store/stores/notificationStore';
import { useUIStore } from '../../store/stores/uiStore';
import { NotificationContainer } from './NotificationContainer';
import { NOTIFICATION_EXIT_DELAY_MS } from './notificationToastPolicy';

const LONG_WARNING = 'Source feature links are inconsistent. Camera and point viewing remains available; feature matching and COLMAP export are disabled.';

function addNotifications() {
  act(() => {
    const { addNotification } = useNotificationStore.getState();
    addNotification('info', 'Loaded 10 points', 0);
    addNotification('warning', LONG_WARNING);
    addNotification('warning', 'Loaded camera geometry; 100/104 photos matched.');
  });
}

function advanceTime(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('NotificationContainer', () => {
  beforeEach(() => {
    useNotificationStore.setState(useNotificationStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

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

  it('keeps the live notification region mounted while empty', () => {
    render(<NotificationContainer />);

    const region = screen.getByRole('region', { name: 'Notifications' });
    expect(region).toBeEmptyDOMElement();
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('aria-relevant', 'additions');

    addNotifications();
    expect(screen.getByRole('region', { name: 'Notifications' })).toBe(region);
  });

  it('uses ariaNotify once per notification ID with the message and its priority', () => {
    const originalAriaNotify = Object.getOwnPropertyDescriptor(document, 'ariaNotify');
    const ariaNotify = vi.fn();
    Object.defineProperty(document, 'ariaNotify', { configurable: true, value: ariaNotify });

    try {
      addNotifications();
      render(<NotificationContainer />, { reactStrictMode: true });

      const region = screen.getByRole('region', { name: 'Notifications' });
      expect(region).not.toHaveAttribute('aria-live');
      expect(region).not.toHaveAttribute('aria-relevant');
      expect(ariaNotify.mock.calls).toEqual([
        ['Loaded 10 points', { priority: 'normal' }],
        [LONG_WARNING, { priority: 'high' }],
        ['Loaded camera geometry; 100/104 photos matched.', { priority: 'high' }],
      ]);

      act(() => {
        useNotificationStore.getState().addNotification('info', 'Loaded 10 points', 0);
      });
      expect(ariaNotify).toHaveBeenCalledTimes(4);
      expect(ariaNotify).toHaveBeenLastCalledWith('Loaded 10 points', { priority: 'normal' });
    } finally {
      if (originalAriaNotify) Object.defineProperty(document, 'ariaNotify', originalAriaNotify);
      else Reflect.deleteProperty(document, 'ariaNotify');
    }
  });

  it('gives close buttons an explicit type and applies live roles to the messages', () => {
    addNotifications();
    render(<NotificationContainer />);

    const infoMessage = screen.getByRole('status');
    const warningMessages = screen.getAllByRole('alert');
    expect(infoMessage).toHaveTextContent('Loaded 10 points');
    expect(warningMessages[0]).toHaveTextContent(LONG_WARNING);
    for (const closeButton of screen.getAllByRole('button', { name: 'Close notification' })) {
      expect(closeButton).toHaveAttribute('type', 'button');
      expect(closeButton.closest('[role="alert"], [role="status"]')).toBeNull();
    }
  });

  it('exposes the compact message as a button that toggles its expanded state', () => {
    useUIStore.setState({ touchMode: true });
    addNotifications();
    render(<NotificationContainer />);

    const messageButton = screen.getByRole('button', { name: LONG_WARNING });
    expect(messageButton.tagName).toBe('BUTTON');
    expect(messageButton).toHaveAttribute('type', 'button');
    expect(messageButton).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(messageButton);
    expect(messageButton).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(messageButton);
    expect(messageButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('pauses auto-dismiss on hover and resumes with the remaining time on mouse leave', () => {
    vi.useFakeTimers();
    useNotificationStore.getState().addNotification('info', 'Loaded 10 points', 1000);
    render(<NotificationContainer />);

    const message = screen.getByRole('status');
    advanceTime(400);
    fireEvent.mouseEnter(message);
    advanceTime(2000);
    expect(message).toBeInTheDocument();

    fireEvent.mouseLeave(message);
    advanceTime(600 + NOTIFICATION_EXIT_DELAY_MS - 1);
    expect(message).toBeInTheDocument();
    advanceTime(1);
    expect(message).not.toBeInTheDocument();
  });

  it('pauses auto-dismiss while focus moves within the toast and resumes on blur', () => {
    vi.useFakeTimers();
    useUIStore.setState({ touchMode: true });
    useNotificationStore.getState().addNotification('info', 'Loaded 10 points', 1000);
    render(<NotificationContainer />);

    const messageButton = screen.getByRole('button', { name: 'Loaded 10 points' });
    const closeButton = screen.getByRole('button', { name: 'Close notification' });
    act(() => messageButton.focus());
    advanceTime(2000);
    expect(closeButton).toBeInTheDocument();

    act(() => closeButton.focus());
    advanceTime(2000);
    expect(closeButton).toBeInTheDocument();

    act(() => closeButton.blur());
    advanceTime(1000 + NOTIFICATION_EXIT_DELAY_MS);
    expect(closeButton).not.toBeInTheDocument();
  });

  it('clears a pending exit timer on unmount', () => {
    vi.useFakeTimers();
    const removeNotification = vi.fn();
    useNotificationStore.setState({ removeNotification });
    useNotificationStore.getState().addNotification('warning', LONG_WARNING);
    const { unmount } = render(<NotificationContainer />);

    const closeButton = screen.getByRole('button', { name: 'Close notification' });
    fireEvent.click(closeButton);
    fireEvent.click(closeButton);
    unmount();
    advanceTime(NOTIFICATION_EXIT_DELAY_MS);

    expect(removeNotification).not.toHaveBeenCalled();
  });
});
