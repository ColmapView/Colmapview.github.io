import { useState, useEffect, useRef, useCallback } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { inputStyles, getButtonClass } from '../../theme';
import { ChevronDownIcon, ChevronRightIcon } from '../../icons';

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
  const [showHelp, setShowHelp] = useState(false);
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
      <div className="bg-ds-tertiary border border-ds rounded-lg shadow-ds-lg p-5 min-w-[400px] max-w-[520px]" data-testid="url-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-ds-primary font-medium mb-3">Load from URL</h3>
        <p className="text-ds-muted text-sm mb-4">
          Enter a manifest URL (.json), a ZIP file URL (.zip), or a direct path to a COLMAP folder
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

        {/* Expandable help section */}
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setShowHelp(!showHelp)}
            className="flex items-center gap-1 text-ds-muted text-xs hover:text-ds-primary transition-colors"
          >
            {showHelp ? (
              <ChevronDownIcon className="w-3 h-3" />
            ) : (
              <ChevronRightIcon className="w-3 h-3" />
            )}
            Supported URL formats
          </button>
          {showHelp && (
            <div className="mt-2 p-3 bg-ds-secondary rounded border border-ds text-xs text-ds-muted">
              <div className="font-medium text-ds-primary mb-2">ZIP Files</div>
              <ul className="space-y-1 mb-3">
                <li><code className="text-ds-accent">https://example.com/reconstruction.zip</code></li>
                <li className="text-ds-muted/70">ZIP should contain cameras.bin, images.bin, points3D.bin</li>
                <li className="text-ds-muted/70">Images in ZIP are loaded lazily on-demand</li>
                <li className="text-ds-muted/70">Maximum ZIP size: 2GB</li>
              </ul>
              <div className="font-medium text-ds-primary mb-2">Cloud Storage URLs</div>
              <ul className="space-y-1 mb-3">
                <li><code className="text-ds-accent">s3://bucket/path</code> — AWS S3</li>
                <li><code className="text-ds-accent">gs://bucket/path</code> — Google Cloud Storage</li>
                <li><code className="text-ds-accent">https://bucket.s3.amazonaws.com/path</code></li>
                <li><code className="text-ds-accent">https://storage.googleapis.com/bucket/path</code></li>
                <li><code className="text-ds-accent">https://account.r2.cloudflarestorage.com/bucket/path</code></li>
              </ul>
              <div className="font-medium text-ds-primary mb-2">Dropbox</div>
              <ul className="space-y-1 mb-3">
                <li><code className="text-ds-accent">https://www.dropbox.com/s/.../file.txt?dl=0</code></li>
                <li><code className="text-ds-accent">https://www.dropbox.com/scl/fi/.../file.txt?rlkey=...</code></li>
                <li className="text-ds-muted/70">Share links auto-converted to direct downloads</li>
              </ul>
              <div className="font-medium text-ds-primary mb-2">Git Hosting URLs</div>
              <ul className="space-y-1 mb-3">
                <li><code className="text-ds-accent">https://huggingface.co/.../resolve/main/...</code></li>
                <li><code className="text-ds-accent">https://github.com/.../blob/main/...</code></li>
                <li><code className="text-ds-accent">https://gitlab.com/.../-/blob/main/...</code></li>
              </ul>
              <div className="font-medium text-ds-primary mb-2">Local / Self-hosted Server</div>
              <ul className="space-y-1 mb-3">
                <li><code className="text-ds-accent">http://localhost:8080/</code></li>
                <li className="text-ds-muted/70">Start with: <code className="text-ds-accent">npx http-server --cors -p 8080</code></li>
              </ul>
              <div className="font-medium text-amber-400 mb-1">CORS Requirements</div>
              <p className="text-ds-muted/80">
                Cloud buckets must have CORS configured. Dropbox, pre-signed URLs, and same-origin servers work automatically.
              </p>
            </div>
          )}
        </div>

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
