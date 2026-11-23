import { useEffect, useRef } from 'react';
import { notificationStyles } from '../../theme/componentStyles';
import { NotificationToast } from './NotificationToast';
import { getVisibleNotifications } from './notificationToastPolicy';
import { useNotificationContainerStoreFacade } from './useNotificationContainerStoreFacade';

type AriaNotifyDocument = Document & {
  ariaNotify?: (text: string, options?: { priority?: 'normal' | 'high' }) => void;
};

export function NotificationContainer() {
  const {
    notifications,
    removeNotification,
    touchMode,
  } = useNotificationContainerStoreFacade();

  const seenNotificationIds = useRef<Set<string>>(new Set());
  const notificationDocument = typeof document === 'undefined' ? undefined : document as AriaNotifyDocument;
  const supportsAriaNotify = notificationDocument !== undefined
    && 'ariaNotify' in notificationDocument
    && typeof notificationDocument.ariaNotify === 'function';

  useEffect(() => {
    if (!supportsAriaNotify) return;

    for (const notification of notifications) {
      if (seenNotificationIds.current.has(notification.id)) continue;
      seenNotificationIds.current.add(notification.id);
      notificationDocument.ariaNotify?.(notification.message, {
        priority: notification.type === 'warning' ? 'high' : 'normal',
      });
    }
  }, [notificationDocument, notifications, supportsAriaNotify]);

  return (
    <div
      className={touchMode ? notificationStyles.touchContainer : notificationStyles.container}
      role="region"
      aria-label="Notifications"
      aria-live={supportsAriaNotify ? undefined : 'polite'}
      aria-relevant={supportsAriaNotify ? undefined : 'additions'}
    >
      {getVisibleNotifications(notifications, touchMode).map((notification) => (
        <NotificationToast
          key={notification.id}
          notification={notification}
          onClose={removeNotification}
          compact={touchMode}
        />
      ))}
    </div>
  );
}
