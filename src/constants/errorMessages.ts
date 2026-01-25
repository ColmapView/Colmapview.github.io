/**
 * User-friendly error messages for error boundaries.
 * Provides consistent titles and messages for each error type.
 */

import type { AppErrorType } from '../utils/errorUtils';

export interface ErrorMessage {
  title: string;
  message: string;
  retryLabel?: string;
  reloadLabel?: string;
}

export const ERROR_MESSAGES: Record<AppErrorType, ErrorMessage> = {
  webgl_context_lost: {
    title: '3D View Error',
    message: 'The graphics context was lost. This can happen when the system is under heavy load or the browser tab was inactive for a while.',
    retryLabel: 'Retry',
    reloadLabel: 'Reload Page',
  },
  webgl_render_error: {
    title: '3D Rendering Error',
    message: 'Failed to render the 3D scene. This may be due to an unsupported graphics feature or driver issue.',
    retryLabel: 'Retry',
    reloadLabel: 'Reload Page',
  },
  image_load_error: {
    title: 'Image Loading Error',
    message: 'Failed to load one or more images. Please check that the image files are accessible.',
    retryLabel: 'Retry Loading',
  },
  network_error: {
    title: 'Network Error',
    message: 'Failed to connect to the server. Please check your internet connection and try again.',
    retryLabel: 'Retry',
  },
  unknown: {
    title: 'Something went wrong',
    message: 'An unexpected error occurred. Please try again or reload the page.',
    retryLabel: 'Retry',
    reloadLabel: 'Reload Page',
  },
};

/**
 * Gets the error message configuration for a given error type.
 */
export function getErrorMessage(type: AppErrorType): ErrorMessage {
  return ERROR_MESSAGES[type] ?? ERROR_MESSAGES.unknown;
}

/**
 * Short notification messages for silent error boundaries (modal).
 */
export const NOTIFICATION_MESSAGES = {
  modalError: 'Modal closed due to an error. Click to reopen.',
  galleryError: 'Failed to load gallery. Click retry to try again.',
  scene3DError: 'Failed to render 3D view. Click retry to restore.',
} as const;
