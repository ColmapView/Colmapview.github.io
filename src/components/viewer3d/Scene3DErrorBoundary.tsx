import { Component, type ReactNode, createRef } from 'react';
import { emptyStateStyles, buttonStyles } from '../../theme';
import { classifyError, type AppErrorType } from '../../utils/errorUtils';
import { getErrorMessage } from '../../constants/errorMessages';

interface Scene3DErrorBoundaryProps {
  children: ReactNode;
  backgroundColor?: string;
}

interface Scene3DErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorType: AppErrorType | null;
  retryCount: number;
}

/**
 * Error boundary specifically for the 3D scene/canvas.
 * Handles WebGL context loss and render errors with appropriate recovery options.
 *
 * Features:
 * - Listens for WebGL context lost/restored events
 * - Provides retry and reload buttons
 * - Tracks retry attempts to suggest reload after multiple failures
 */
export class Scene3DErrorBoundary extends Component<Scene3DErrorBoundaryProps, Scene3DErrorBoundaryState> {
  private canvasRef = createRef<HTMLDivElement>();
  private contextLostHandler: ((event: Event) => void) | null = null;
  private contextRestoredHandler: ((event: Event) => void) | null = null;

  constructor(props: Scene3DErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorType: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<Scene3DErrorBoundaryState> {
    const errorType = classifyError(error);
    return { hasError: true, error, errorType };
  }

  componentDidMount(): void {
    this.setupWebGLContextListeners();
  }

  componentDidUpdate(prevProps: Scene3DErrorBoundaryProps): void {
    // Re-setup listeners if children changed (canvas remounted)
    if (prevProps.children !== this.props.children) {
      this.setupWebGLContextListeners();
    }
  }

  componentWillUnmount(): void {
    this.cleanupWebGLContextListeners();
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('Scene3DErrorBoundary caught an error:', error, errorInfo);
  }

  private setupWebGLContextListeners(): void {
    // Clean up any existing listeners first
    this.cleanupWebGLContextListeners();

    // Find canvas elements within the container
    const container = this.canvasRef.current;
    if (!container) return;

    const canvases = container.querySelectorAll('canvas');
    if (canvases.length === 0) return;

    // Create handlers once (they don't need canvas-specific data)
    this.contextLostHandler = (event: Event) => {
      event.preventDefault();
      console.warn('WebGL context lost');
      this.setState({
        hasError: true,
        error: new Error('WebGL context lost'),
        errorType: 'webgl_context_lost',
      });
    };

    this.contextRestoredHandler = () => {
      console.info('WebGL context restored');
      this.handleRetry();
    };

    // Add the same handlers to all canvases
    canvases.forEach((canvas) => {
      canvas.addEventListener('webglcontextlost', this.contextLostHandler!);
      canvas.addEventListener('webglcontextrestored', this.contextRestoredHandler!);
    });
  }

  private cleanupWebGLContextListeners(): void {
    const container = this.canvasRef.current;
    if (!container) return;

    const canvases = container.querySelectorAll('canvas');
    canvases.forEach((canvas) => {
      if (this.contextLostHandler) {
        canvas.removeEventListener('webglcontextlost', this.contextLostHandler);
      }
      if (this.contextRestoredHandler) {
        canvas.removeEventListener('webglcontextrestored', this.contextRestoredHandler);
      }
    });
  }

  private handleRetry = (): void => {
    this.setState((prevState) => ({
      hasError: false,
      error: null,
      errorType: null,
      retryCount: prevState.retryCount + 1,
    }));
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    const { children, backgroundColor } = this.props;
    const { hasError, error, errorType, retryCount } = this.state;

    if (hasError) {
      const errorMessage = errorType ? getErrorMessage(errorType) : getErrorMessage('webgl_render_error');
      const showReloadHint = retryCount >= 2;

      return (
        <div
          className="w-full h-full flex flex-col items-center justify-center"
          style={{ backgroundColor: backgroundColor ?? 'var(--ds-secondary)' }}
        >
          <div className="text-center max-w-md px-4">
            <div className={emptyStateStyles.icon}>!</div>
            <h2 className={emptyStateStyles.title}>{errorMessage.title}</h2>
            <p className={emptyStateStyles.message}>
              {error?.message ?? errorMessage.message}
            </p>
            {showReloadHint && (
              <p className="text-ds-warning text-sm mb-4">
                Multiple retry attempts failed. Consider reloading the page.
              </p>
            )}
            <div className="flex gap-3 justify-center mt-4">
              <button
                onClick={this.handleRetry}
                className={emptyStateStyles.button}
              >
                {errorMessage.retryLabel ?? 'Retry'}
              </button>
              <button
                onClick={this.handleReload}
                className={`${buttonStyles.base} ${buttonStyles.sizes.md} ${buttonStyles.variants.ghost}`}
              >
                {errorMessage.reloadLabel ?? 'Reload Page'}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div ref={this.canvasRef} className="w-full h-full">
        {children}
      </div>
    );
  }
}
