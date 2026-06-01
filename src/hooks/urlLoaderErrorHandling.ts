import type { UrlLoadError, UrlLoadErrorType } from '../types/manifest';
import { appLogger } from '../utils/logger';
import { classifyFetchErrorWithCloudContext } from '../utils/urlUtils';

type ClassifyUrlLoadError = (error: unknown, url?: string) => UrlLoadError;
type ClearCaches = () => void;
type SetUrlError = (error: UrlLoadError) => void;
type SetError = (error: string) => void;
type ErrorLog = (message: string, error: unknown) => void;

export interface HandleUrlLoadFailureDeps {
  classifyError?: ClassifyUrlLoadError;
  clearCaches: ClearCaches;
  contextUrl?: string;
  errorLog?: ErrorLog;
  setError: SetError;
  setUrlError: SetUrlError;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUrlLoadErrorType(value: unknown): value is UrlLoadErrorType {
  switch (value) {
    case 'network':
    case 'cors':
    case 'not_found':
    case 'invalid_manifest':
    case 'timeout':
    case 'unknown':
      return true;
    default:
      return false;
  }
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

export function isUrlLoadError(error: unknown): error is UrlLoadError {
  if (!isRecord(error)) {
    return false;
  }

  return (
    isUrlLoadErrorType(error.type) &&
    typeof error.message === 'string' &&
    isOptionalString(error.details) &&
    isOptionalString(error.failedFile)
  );
}

export function formatUrlLoadError(error: UrlLoadError): string {
  return error.message + (error.details ? `: ${error.details}` : '');
}

export function resolveUrlLoadError(
  error: unknown,
  contextUrl?: string,
  classifyError: ClassifyUrlLoadError = classifyFetchErrorWithCloudContext
): UrlLoadError {
  return isUrlLoadError(error)
    ? error
    : classifyError(error, contextUrl);
}

export function handleUrlLoadFailure(error: unknown, deps: HandleUrlLoadFailureDeps): UrlLoadError {
  const errorLog = deps.errorLog ?? appLogger.error;
  errorLog('[URL Loader] Error:', error);

  deps.clearCaches();

  const urlError = resolveUrlLoadError(error, deps.contextUrl, deps.classifyError);
  deps.setUrlError(urlError);
  deps.setError(formatUrlLoadError(urlError));

  return urlError;
}
