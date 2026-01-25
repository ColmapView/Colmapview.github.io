/**
 * Error classification and recovery utilities for granular error boundaries.
 */

export type AppErrorType =
  | 'webgl_context_lost'
  | 'webgl_render_error'
  | 'image_load_error'
  | 'network_error'
  | 'unknown';

export type RecoveryStrategy = 'retry' | 'reload' | 'dismiss';

/**
 * Classifies an error into a known type for appropriate handling.
 */
export function classifyError(error: Error): AppErrorType {
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  // WebGL context lost
  if (
    message.includes('context lost') ||
    message.includes('webgl') ||
    message.includes('gl_')
  ) {
    return 'webgl_context_lost';
  }

  // WebGL render errors (shader compilation, buffer issues, etc.)
  if (
    message.includes('shader') ||
    message.includes('render') ||
    message.includes('draw') ||
    message.includes('buffer') ||
    message.includes('three')
  ) {
    return 'webgl_render_error';
  }

  // Image loading errors
  if (
    message.includes('image') ||
    message.includes('load') ||
    message.includes('decode') ||
    message.includes('blob')
  ) {
    return 'image_load_error';
  }

  // Network errors
  if (
    name.includes('networkerror') ||
    message.includes('fetch') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('cors')
  ) {
    return 'network_error';
  }

  return 'unknown';
}

/**
 * Determines the appropriate recovery strategy for an error type.
 */
export function getRecoveryStrategy(type: AppErrorType): RecoveryStrategy {
  switch (type) {
    case 'webgl_context_lost':
      // WebGL context loss is often recoverable by waiting and retrying
      return 'retry';
    case 'webgl_render_error':
      // Render errors may require a full reload
      return 'reload';
    case 'image_load_error':
      // Image errors can often be retried
      return 'retry';
    case 'network_error':
      // Network errors are usually temporary
      return 'retry';
    case 'unknown':
    default:
      // Unknown errors should be dismissible
      return 'dismiss';
  }
}

/**
 * Checks if an error is likely a WebGL context loss event.
 */
export function isWebGLContextLostError(error: Error): boolean {
  return classifyError(error) === 'webgl_context_lost';
}

/**
 * Checks if an error is recoverable without a full page reload.
 */
export function isRecoverableError(error: Error): boolean {
  const strategy = getRecoveryStrategy(classifyError(error));
  return strategy === 'retry' || strategy === 'dismiss';
}
