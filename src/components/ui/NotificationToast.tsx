import { useEffect, useState, useCallback } from 'react';
import { CloseIcon, InfoIcon, WarningIcon } from '../../icons';
import { notificationStyles } from '../../theme/componentStyles';
import type { Notification } from '../../store/stores/notificationStore';
import {
  getNotificationToastVisualState,
  NOTIFICATION_EXIT_DELAY_MS,
  shouldAutoDismissNotification,
} from './notificationToastPolicy';

interface NotificationToastProps {
  notification: Notification;
  onClose: (id: string) => void;
  /** Touch: narrow toast whose long message is clamped until tapped. */
  compact?: boolean;
}

export function NotificationToast({ notification, onClose, compact = false }: NotificationToastProps) {
  const [isExiting, setIsExiting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleClose = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      onClose(notification.id);
    }, NOTIFICATION_EXIT_DELAY_MS);
  }, [notification.id, onClose]);

  useEffect(() => {
    if (shouldAutoDismissNotification({
      type: notification.type,
      duration: notification.duration,
    })) {
      const timer = setTimeout(() => {
        handleClose();
      }, notification.duration);
      return () => clearTimeout(timer);
    }
  }, [notification.type, notification.duration, handleClose]);

  const visualState = getNotificationToastVisualState(notification.type, isExiting);
  const Icon = visualState.iconKind === 'info' ? InfoIcon : WarningIcon;

  return (
    <div className={`${compact ? notificationStyles.touchToast : notificationStyles.toast} ${visualState.animationClass}`}>
      <div className={`${notificationStyles.iconContainer} ${visualState.iconContainerClass}`}>
        <Icon className={notificationStyles.icon} />
      </div>
      <div className={compact ? notificationStyles.touchContent : notificationStyles.content}>
        {compact ? (
          <span
            className={`${notificationStyles.touchMessage}${expanded ? '' : ` ${notificationStyles.touchMessageClamp}`}`}
            onClick={() => setExpanded(value => !value)}
          >
            {notification.message}
          </span>
        ) : (
          <span className={notificationStyles.message}>{notification.message}</span>
        )}
      </div>
      <button
        className={notificationStyles.closeButton}
        onClick={handleClose}
        aria-label="Close notification"
      >
        <CloseIcon className="w-4 h-4" />
      </button>
    </div>
  );
}
