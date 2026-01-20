import { useState, useEffect, useRef, useCallback } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { inputStyles, getButtonClass } from '../../theme';

interface UrlInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoad: (url: string) => void;
  loading?: boolean;
}

/**
 * Simple popup modal for entering a URL to load a COLMAP reconstruction.
 * - Centered on screen with backdrop
 * - URL input field with placeholder
 * - Load and Cancel buttons
 * - Enter key to submit, Escape to close
 */
export function UrlInputModal({ isOpen, onClose, onLoad, loading = false }: UrlInputModalProps) {
  const [url, setUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Clear URL when modal closes
  useEffect(() => {
    if (!isOpen) {
      setUrl('');
    }
  }, [isOpen]);

  // Handle load action
  const handleLoad = useCallback(() => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl || loading) return;
    onLoad(trimmedUrl);
  }, [url, loading, onLoad]);

  // Handle key events
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      handleLoad();
    }
  }, [handleLoad, loading]);

  // Close with Escape
  useHotkeys(
    'escape',
    () => onClose(),
    { enabled: isOpen && !loading },
    [isOpen, loading, onClose]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-ds-void/50"
      onClick={(e) => {
        // Close when clicking backdrop (not when clicking modal content)
        if (e.target === e.currentTarget && !loading) {
          onClose();
        }
      }}
    >
      <div className="bg-ds-tertiary border border-ds rounded-lg shadow-ds-lg p-5 min-w-[400px] max-w-[500px]" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-ds-primary font-medium mb-3">Load from URL</h3>
        <p className="text-ds-muted text-sm mb-4">
          Enter a manifest URL (.json) or a direct path to a COLMAP folder
        </p>

        {/* URL input */}
        <input
          ref={inputRef}
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="https://huggingface.co/.../resolve/main/reconstruction"
          className={`${inputStyles.base} ${inputStyles.sizes.lg} w-full mb-4 text-sm placeholder-ds-muted`}
          disabled={loading}
        />

        {/* Buttons */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className={getButtonClass('ghost', 'lg', loading)}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleLoad}
            disabled={loading || !url.trim()}
            className={getButtonClass('primary', 'lg', loading || !url.trim())}
          >
            {loading ? 'Loading...' : 'Load'}
          </button>
        </div>
      </div>
    </div>
  );
}
