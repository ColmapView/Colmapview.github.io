import { describe, expect, it, vi } from 'vitest';
import type { UrlLoadError } from '../types/manifest';
import {
  formatUrlLoadError,
  handleUrlLoadFailure,
  isUrlLoadError,
  resolveUrlLoadError,
} from './urlLoaderErrorHandling';

describe('URL loader error handling', () => {
  it('formats URL load errors for the shared store error string', () => {
    expect(formatUrlLoadError({
      type: 'network',
      message: 'Failed to load',
    })).toBe('Failed to load');

    expect(formatUrlLoadError({
      type: 'network',
      message: 'Failed to load',
      details: 'server unavailable',
    })).toBe('Failed to load: server unavailable');
  });

  it('identifies only valid URL load error objects', () => {
    expect(isUrlLoadError({
      type: 'not_found',
      message: 'missing',
      failedFile: 'https://example.com/missing.bin',
    })).toBe(true);

    expect(isUrlLoadError({ type: 'other', message: 'bad' })).toBe(false);
    expect(isUrlLoadError({ type: 'network' })).toBe(false);
    expect(isUrlLoadError({ type: 'network', message: 'bad', details: 500 })).toBe(false);
    expect(isUrlLoadError({
      type: 'network',
      message: 'bad',
      failedFile: new URL('https://example.com/missing.bin'),
    })).toBe(false);
    expect(isUrlLoadError(new Error('plain'))).toBe(false);
    expect(isUrlLoadError(null)).toBe(false);
  });

  it('preserves existing URL load errors without reclassification', () => {
    const expectedError: UrlLoadError = {
      type: 'timeout',
      message: 'Request timed out',
      details: 'slow server',
    };
    const classifyError = vi.fn();

    expect(resolveUrlLoadError(expectedError, 'https://example.com', classifyError)).toBe(expectedError);
    expect(classifyError).not.toHaveBeenCalled();
  });

  it('classifies unknown errors with the supplied context URL', () => {
    const sourceError = new TypeError('Failed to fetch');
    const classified: UrlLoadError = {
      type: 'cors',
      message: 'Cross-origin request blocked',
      details: 'missing CORS headers',
      failedFile: 'https://example.com/data',
    };
    const classifyError = vi.fn(() => classified);

    expect(resolveUrlLoadError(sourceError, 'https://example.com/data', classifyError)).toBe(classified);
    expect(classifyError).toHaveBeenCalledWith(sourceError, 'https://example.com/data');
  });

  it('logs, clears partial cache state, and writes both error stores', () => {
    const urlError: UrlLoadError = {
      type: 'invalid_manifest',
      message: 'Invalid manifest format',
      details: 'files.cameras: Required',
      failedFile: 'https://example.com/manifest.json',
    };
    const deps = {
      clearCaches: vi.fn(),
      errorLog: vi.fn(),
      setError: vi.fn(),
      setUrlError: vi.fn(),
    };

    expect(handleUrlLoadFailure(urlError, deps)).toBe(urlError);

    expect(deps.errorLog).toHaveBeenCalledWith('[URL Loader] Error:', urlError);
    expect(deps.clearCaches).toHaveBeenCalledTimes(1);
    expect(deps.setUrlError).toHaveBeenCalledWith(urlError);
    expect(deps.setError).toHaveBeenCalledWith('Invalid manifest format: files.cameras: Required');
  });
});
