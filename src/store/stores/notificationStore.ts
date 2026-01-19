import { create } from 'zustand';

export type NotificationType = 'info' | 'warning';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  duration?: number; // ms, only for 'info' type (auto-dismiss)
}

export interface NotificationState {
  notifications: Notification[];
  addNotification: (type: NotificationType, message: string, duration?: number) => string;
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

let notificationIdCounter = 0;

function generateId(): string {
  return `notification-${Date.now()}-${++notificationIdCounter}`;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],

  addNotification: (type, message, duration) => {
    const id = generateId();
    const notification: Notification = {
      id,
      type,
      message,
      // Info notifications auto-dismiss (default 3000ms), warnings persist
      duration: type === 'info' ? (duration ?? 3000) : undefined,
    };
    set((state) => ({
      notifications: [...state.notifications, notification],
    }));
    return id;
  },

  removeNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },

  clearAll: () => {
    set({ notifications: [] });
  },
}));
