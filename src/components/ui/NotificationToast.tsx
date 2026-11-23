import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [isHovered, setIsHovered] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsedDismissTime = useRef(0);
  const isPaused = isHovered || hasFocus;
  const { type, duration = 0 } = notification;

  const handleClose = useCallback(() => {
    if (exitTimer.current !== null) return;

    setIsExiting(true);
    exitTimer.current = setTimeout(() => {
      onClose(notification.id);
    }, NOTIFICATION_EXIT_DELAY_MS);
  }, [notification.id, onClose]);

  useEffect(() => () => {
    if (exitTimer.current !== null) {
      clearTimeout(exitTimer.current);
      exitTimer.current = null;
    }
  }, []);

  useEffect(() => {
    if (isPaused || isExiting || !shouldAutoDismissNotification({ type, duration })) return;

    const startedAt = performance.now();
    const timer = setTimeout(handleClose, Math.max(0, duration - elapsedDismissTime.current));
    return () => {
      clearTimeout(timer);
      elapsedDismissTime.current += performance.now() - startedAt;
    };
  }, [type, duration, isPaused, isExiting, handleClose]);

  const visualState = getNotificationToastVisualState(type, isExiting);
  const Icon = visualState.iconKind === 'info' ? InfoIcon : WarningIcon;
  const messageClamp = expanded ? undefined : notificationStyles.touchMessageClamp;

  return (
    <div
      className={`${compact ? notificationStyles.touchToast : notificationStyles.toast} ${visualState.animationClass}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setHasFocus(true)}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setHasFocus(false);
        }
      }}
    >
      <div className={`${notificationStyles.iconContainer} ${visualState.iconContainerClass}`}>
        <Icon className={notificationStyles.icon} aria-hidden="true" />
      </div>
      <div
        className={compact ? notificationStyles.touchContent : notificationStyles.content}
        role={type === 'warning' ? 'alert' : 'status'}
      >
        {compact ? (
          <button
            type="button"
            className={`${notificationStyles.touchMessage} text-left${messageClamp ? ` ${messageClamp}` : ''}`}
            aria-expanded={expanded}
            onClick={() => setExpanded(value => !value)}
          >
            <span className={messageClamp}>{notification.message}</span>
          </button>
        ) : (
          <span className={notificationStyles.message}>{notification.message}</span>
        )}
      </div>
      <button
        type="button"
        className={notificationStyles.closeButton}
        onClick={handleClose}
        aria-label="Close notification"
      >
        <CloseIcon className="w-4 h-4" />
      </button>
    </div>
  );
}
