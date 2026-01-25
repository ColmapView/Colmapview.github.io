import { Component, type ReactNode } from 'react';
import { useNotificationStore } from '../../store/stores/notificationStore';
import { NOTIFICATION_MESSAGES } from '../../constants/errorMessages';

interface ModalErrorBoundaryProps {
  children: ReactNode;
  /** Called when an error occurs and the modal should be closed */
  onClose: () => void;
}

interface ModalErrorBoundaryState {
  hasError: boolean;
}

/**
 * Silent error boundary for modals.
 * When an error occurs, it closes the modal and shows a notification.
 *
 * Features:
 * - Silent handling - no visible error UI within the modal
 * - Closes the modal automatically on error
 * - Shows a notification toast so the user knows what happened
 * - User can reopen the modal to retry
 */
export class ModalErrorBoundary extends Component<ModalErrorBoundaryProps, ModalErrorBoundaryState> {
  constructor(props: ModalErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
    };
  }

  static getDerivedStateFromError(): ModalErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('ModalErrorBoundary caught an error:', error, errorInfo);

    // Show notification
    useNotificationStore.getState().addNotification(
      'warning',
      NOTIFICATION_MESSAGES.modalError
    );

    // Close the modal
    this.props.onClose();
  }

  componentDidUpdate(prevProps: ModalErrorBoundaryProps): void {
    // Reset error state when modal content changes (e.g., reopened with different content)
    // This setState in componentDidUpdate is intentional - needed to reset error state when children change
    if (this.state.hasError && prevProps.children !== this.props.children) {
      this.setState({ hasError: false });
    }
  }

  render(): ReactNode {
    // When there's an error, we return null because the modal will be closed
    if (this.state.hasError) {
      return null;
    }

    return this.props.children;
  }
}
