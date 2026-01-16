import { Component, type ReactNode } from 'react';
import { emptyStateStyles } from '../theme';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className={emptyStateStyles.containerFull}>
          <div className={emptyStateStyles.icon}>⚠</div>
          <h2 className={emptyStateStyles.title}>Something went wrong</h2>
          <p className={emptyStateStyles.message}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className={emptyStateStyles.button}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
