import { Component, type ReactNode } from 'react';
import { buttonStyles, errorStateStyles } from '../../theme';
import { classifyError, type AppErrorType } from '../../utils/errorUtils';
import { getErrorMessage } from '../../constants/errorMessages';
import { appLogger } from '../../utils/logger';

interface GalleryErrorBoundaryProps {
  children: ReactNode;
}

interface GalleryErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorType: AppErrorType | null;
}

/**
 * Error boundary for the image gallery panel.
 * Provides inline fallback within the gallery panel bounds.
 *
 * Features:
 * - Compact inline display that fits within the gallery panel
 * - Retry button to attempt recovery
 * - Does not affect the rest of the application
 */
export class GalleryErrorBoundary extends Component<GalleryErrorBoundaryProps, GalleryErrorBoundaryState> {
  constructor(props: GalleryErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorType: null,
    };
  }

  static getDerivedStateFromError(error: Error): GalleryErrorBoundaryState {
    const errorType = classifyError(error);
    return { hasError: true, error, errorType };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    appLogger.error('GalleryErrorBoundary caught an error:', error, errorInfo);
  }

  private handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorType: null,
    });
  };

  render(): ReactNode {
    const { children } = this.props;
    const { hasError, error, errorType } = this.state;

    if (hasError) {
      const errorMessage = errorType ? getErrorMessage(errorType) : getErrorMessage('image_load_error');

      return (
        <div className={errorStateStyles.container}>
          <div className={errorStateStyles.icon}>!</div>
          <h3 className={errorStateStyles.title}>
            Gallery Error
          </h3>
          <p className={errorStateStyles.message}>
            {error?.message ?? errorMessage.message}
          </p>
          <button
            onClick={this.handleRetry}
            className={`${buttonStyles.base} ${buttonStyles.sizes.sm} ${buttonStyles.variants.secondary}`}
          >
            Retry Loading Gallery
          </button>
        </div>
      );
    }

    return children;
  }
}
