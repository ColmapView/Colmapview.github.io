import { useEffect, useState, useCallback } from 'react';
import { CloseIcon, InfoIcon, WarningIcon } from '../../icons';
import { notificationStyles } from '../../theme/componentStyles';
import type { Notification } from '../../store/stores/notificationStore';

interface NotificationToastProps {
  notification: Notification;
  onClose: (id: string) => void;
}

export function NotificationToast({ notification, onClose }: NotificationToastProps) {
  const [isExiting, setIsExiting] = useState(false);

  const handleClose = useCallback(() => {
    setIsExiting(true);
    // Wait for fade-out animation to complete before removing
    setTimeout(() => {
      onClose(notification.id);
    }, 200);
  }, [notification.id, onClose]);

  // Auto-dismiss for info notifications
  useEffect(() => {
    if (notification.type === 'info' && notification.duration) {
      const timer = setTimeout(() => {
        handleClose();
      }, notification.duration);
      return () => clearTimeout(timer);
    }
  }, [notification.type, notification.duration, handleClose]);

  const isInfo = notification.type === 'info';
  const Icon = isInfo ? InfoIcon : WarningIcon;
  const iconContainerClass = isInfo ? notificationStyles.iconContainerInfo : notificationStyles.iconContainerWarning;
  const animationClass = isExiting ? notificationStyles.exiting : notificationStyles.entering;

  return (
    <div className={`${notificationStyles.toast} ${animationClass}`}>
      <div className={`${notificationStyles.iconContainer} ${iconContainerClass}`}>
        <Icon className={notificationStyles.icon} />
      </div>
      <div className={notificationStyles.content}>
        <span className={notificationStyles.message}>{notification.message}</span>
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
