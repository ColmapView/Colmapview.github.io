import { Component, type ReactNode } from 'react';
import { emptyStateStyles, buttonStyles } from '../theme';
import { classifyError, getRecoveryStrategy, type AppErrorType } from '../utils/errorUtils';
import { getErrorMessage } from '../constants/errorMessages';

export type ErrorBoundaryVariant = 'full' | 'inline' | 'silent';

export interface ErrorBoundaryConfig {
  /** Display variant: 'full' (page), 'inline' (within container), 'silent' (no UI, just callback) */
  variant?: ErrorBoundaryVariant;
  /** Custom title for the error display */
  title?: string;
  /** Whether to show a reload button */
  showReload?: boolean;
  /** Whether to show a retry button */
  showRetry?: boolean;
  /** Callback when an error is caught */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** Callback when retry is clicked */
  onRetry?: () => void;
  /** Custom fallback - either a node or render function */
  fallback?: ReactNode | ((error: Error | null, retry: () => void) => ReactNode);
}

interface ErrorBoundaryProps extends ErrorBoundaryConfig {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorType: AppErrorType | null;
}

/**
 * ErrorBoundary catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI.
 *
 * Supports multiple display variants:
 * - 'full': Full-page error display (default, for root boundary)
 * - 'inline': Compact inline display (for panels/components)
 * - 'silent': No UI, just calls onError callback (for modals)
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorType: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    const errorType = classifyError(error);
    return { hasError: true, error, errorType };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorType: null });
    this.props.onRetry?.();
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  private renderFallback(): ReactNode {
    const { variant = 'full', title, showReload, showRetry, fallback } = this.props;
    const { error, errorType } = this.state;

    // Custom fallback
    if (fallback) {
      if (typeof fallback === 'function') {
        return fallback(error, this.handleRetry);
      }
      return fallback;
    }

    // Silent variant - no UI
    if (variant === 'silent') {
      return null;
    }

    // Get error message based on type
    const errorMessage = errorType ? getErrorMessage(errorType) : getErrorMessage('unknown');
    const displayTitle = title ?? errorMessage.title;
    const recoveryStrategy = errorType ? getRecoveryStrategy(errorType) : 'reload';

    // Determine which buttons to show
    const shouldShowRetry = showRetry ?? (recoveryStrategy === 'retry' || recoveryStrategy === 'dismiss');
    const shouldShowReload = showReload ?? (recoveryStrategy === 'reload');

    // Inline variant - compact display
    if (variant === 'inline') {
      return (
        <div className="flex flex-col items-center justify-center h-full p-4 text-center bg-ds-secondary">
          <div className="text-ds-error text-2xl mb-2">!</div>
          <h3 className="text-sm font-medium text-ds-primary mb-1">{displayTitle}</h3>
          <p className="text-xs text-ds-secondary mb-3 max-w-xs">
            {error?.message ?? errorMessage.message}
          </p>
          <div className="flex gap-2">
            {shouldShowRetry && (
              <button
                onClick={this.handleRetry}
                className={`${buttonStyles.base} ${buttonStyles.sizes.sm} ${buttonStyles.variants.secondary}`}
              >
                {errorMessage.retryLabel ?? 'Retry'}
              </button>
            )}
            {shouldShowReload && (
              <button
                onClick={this.handleReload}
                className={`${buttonStyles.base} ${buttonStyles.sizes.sm} ${buttonStyles.variants.ghost}`}
              >
                {errorMessage.reloadLabel ?? 'Reload'}
              </button>
            )}
          </div>
        </div>
      );
    }

    // Full variant - page-level display (default)
    return (
      <div className={emptyStateStyles.containerFull}>
        <div className={emptyStateStyles.icon}>!</div>
        <h2 className={emptyStateStyles.title}>{displayTitle}</h2>
        <p className={emptyStateStyles.message}>
          {error?.message ?? errorMessage.message}
        </p>
        <div className="flex gap-3 mt-4">
          {shouldShowRetry && (
            <button
              onClick={this.handleRetry}
              className={emptyStateStyles.button}
            >
              {errorMessage.retryLabel ?? 'Retry'}
            </button>
          )}
          {shouldShowReload && (
            <button
              onClick={this.handleReload}
              className={`${buttonStyles.base} ${buttonStyles.sizes.md} ${buttonStyles.variants.ghost}`}
            >
              {errorMessage.reloadLabel ?? 'Reload Page'}
            </button>
          )}
        </div>
      </div>
    );
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.renderFallback();
    }

    return this.props.children;
  }
}
