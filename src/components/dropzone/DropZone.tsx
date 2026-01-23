import { useState, useCallback, useEffect, useRef } from 'react';
import { useFileDropzone } from '../../hooks/useFileDropzone';
import { useUrlLoader } from '../../hooks/useUrlLoader';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useReconstructionStore, hasUrlToLoad } from '../../store';
import { STORAGE_KEYS } from '../../store/migration';
import { parseConfigYaml, applyConfigurationToStores } from '../../config/configuration';
import { ColmapManifestSchema } from '../../types/manifest';
import { getRandomDataset, getDatasetUrl } from '../../constants/exampleDatasets';
import { TIMING, buttonStyles, loadingStyles, toastStyles, dragOverlayStyles, emptyStateStyles, hoverCardStyles, ICON_SIZES } from '../../theme';
import { ResetIcon, UploadIcon, LinkIcon, FileJsonIcon, MouseLeftIcon, MouseRightIcon } from '../../icons';
import { UrlInputModal } from '../modals/UrlInputModal';
import { publicAsset } from '../../utils/paths';

interface DropZoneProps {
  children: React.ReactNode;
}

export function DropZone({ children }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isPanelDismissed, setIsPanelDismissed] = useState(false);
  const [isUrlModalOpen, setIsUrlModalOpen] = useState(false);
  const [hoveredButton, setHoveredButton] = useState<'url' | 'json' | 'toy' | null>(null);
  const { handleDrop, handleDragOver, handleBrowse } = useFileDropzone();
  const { loadFromUrl, loadFromManifest, urlLoading, urlProgress, setUrlLoading, setUrlProgress } = useUrlLoader();
  const { error, setError, reconstruction } = useReconstructionStore();
  const configInputRef = useRef<HTMLInputElement>(null);
  const manifestInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  // Handle URL loading from modal
  const handleUrlLoad = useCallback(async (url: string) => {
    // Set loading state IMMEDIATELY so UI responds instantly
    setUrlLoading(true);
    setUrlProgress({ percent: 0, message: 'Starting...' });
    setIsUrlModalOpen(false);
    // Yield to React to paint loading UI before starting heavy work
    await new Promise(resolve => setTimeout(resolve, 0));
    await loadFromUrl(url);
  }, [loadFromUrl, setUrlLoading, setUrlProgress]);

  // Handle manifest JSON file selection
  const handleManifestFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Set loading state IMMEDIATELY so UI responds instantly
    setUrlLoading(true);
    setUrlProgress({ percent: 0, message: 'Loading manifest...' });
    // Yield to React to paint loading UI before starting heavy work
    await new Promise(resolve => setTimeout(resolve, 0));

    try {
      const content = await file.text();
      const data = JSON.parse(content);

      // Validate with Zod
      const result = ColmapManifestSchema.safeParse(data);
      if (!result.success) {
        const errors = result.error.issues.map((err) => `${err.path.join('.')}: ${err.message}`).join('; ');
        setError(`Invalid manifest: ${errors}`);
        setUrlLoading(false);
        return;
      }

      await loadFromManifest(result.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to load manifest: ${message}`);
      setUrlLoading(false);
    }

    // Reset input so same file can be selected again
    e.target.value = '';
  }, [loadFromManifest, setError, setUrlLoading, setUrlProgress]);

  // Handle Try a Toy! button - load random example
  const handleLucky = useCallback(async () => {
    // Early return if already loading (urlLoading state may be stale due to React batching)
    if (urlLoading) return;

    // Set loading state IMMEDIATELY so UI responds instantly
    setUrlLoading(true);
    setUrlProgress({ percent: 0, message: 'Starting...' });
    // Yield to React to paint loading UI before starting heavy work
    await new Promise(resolve => setTimeout(resolve, 0));

    const dataset = getRandomDataset();
    console.log(`[Try a Toy] Loading random dataset: ${dataset.name}`);
    await loadFromUrl(getDatasetUrl(dataset.scanId));
  }, [loadFromUrl, urlLoading, setUrlLoading, setUrlProgress]);

  // Download example manifest.json
  const handleDownloadExampleJson = useCallback(() => {
    const exampleManifest = {
      version: 1,
      name: "Example Dataset",
      baseUrl: "https://example.com/colmap-data",
      files: {
        cameras: "sparse/0/cameras.bin",
        images: "sparse/0/images.bin",
        points3D: "sparse/0/points3D.bin"
      },
      imagesPath: "images/",
      masksPath: "masks/"
    };
    const blob = new Blob([JSON.stringify(exampleManifest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'manifest.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  // Reset all persisted configuration to defaults
  const handleResetConfig = useCallback(() => {
    if (confirm('Reset all settings to defaults? This will clear your saved preferences.')) {
      Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
      window.location.reload();
    }
  }, []);

  // Upload and apply configuration from YAML file
  const handleConfigUpload = useCallback(() => {
    configInputRef.current?.click();
  }, []);

  const handleConfigFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const result = parseConfigYaml(content);

      if (result.valid && result.config) {
        applyConfigurationToStores(result.config);
        console.log(`[Config] Applied settings from ${file.name}`);
      } else {
        const errorMessages = result.errors
          .map(err => err.path ? `${err.path}: ${err.message}` : err.message)
          .join(', ');
        setError(`Config error: ${errorMessages}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Config error: ${message}`);
    }

    // Reset input so same file can be selected again
    e.target.value = '';
  }, [setError]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null);
      }, TIMING.errorToastDuration);
      return () => clearTimeout(timer);
    }
  }, [error, setError]);

  const onDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Only respond to file drags, not internal UI drags (e.g., dragging in popup panels)
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true);
    }
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const onDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    setIsDragOver(false);
    await handleDrop(e);
  }, [handleDrop]);

  return (
    <div
      className="relative w-full h-full"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={handleDragOver}
      onDrop={onDrop}
    >
      {children}

      {isDragOver && (
        <div className={dragOverlayStyles.container}>
          <div className={dragOverlayStyles.content}>
            <div className={dragOverlayStyles.icon}>+</div>
            <div className={dragOverlayStyles.title}>
              Drop COLMAP folder or ZIP here
            </div>
            <div className={dragOverlayStyles.subtitle}>
              Expected: cameras.bin, images.bin, points3D.bin (or .zip containing them)
            </div>
          </div>
        </div>
      )}

      {!reconstruction && !urlLoading && !hasUrlToLoad() && !isDragOver && !isPanelDismissed && !isMobile && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="flex flex-col bg-ds-secondary rounded-lg border border-ds p-6 min-w-[420px]">
            {/* Header row: action buttons */}
            <div className="flex justify-between -mt-4 -mx-4 mb-2">
              <div className="flex gap-1">
                <button
                  type="button"
                  className={`${buttonStyles.base} w-8 h-8 ${buttonStyles.variants.ghost}`}
                  onClick={handleResetConfig}
                  data-tooltip="Reset all settings to defaults"
                >
                  <ResetIcon className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  className={`${buttonStyles.base} w-8 h-8 ${buttonStyles.variants.ghost}`}
                  onClick={handleConfigUpload}
                  data-tooltip="Upload configuration file (.yaml)"
                >
                  <UploadIcon className="w-4 h-4" />
                </button>
              </div>
              <button
                type="button"
                className={`${buttonStyles.base} w-8 h-8 ${buttonStyles.variants.ghost}`}
                onClick={() => setIsPanelDismissed(true)}
                data-tooltip="Dismiss this panel"
              >
                ×
              </button>
            </div>

            {/* Hidden file input for config upload */}
            <input
              ref={configInputRef}
              type="file"
              accept=".yaml,.yml"
              className="hidden"
              onChange={handleConfigFileChange}
            />

            {/* Hidden file input for manifest.json upload */}
            <input
              ref={manifestInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleManifestFileChange}
            />

            {/* Main content area */}
            <div className="flex flex-col items-center">
              {/* Drop zone button with dotted border */}
              <div
                className="w-32 h-32 mb-6 flex items-center justify-center border-2 border-dashed border-ds-muted rounded-lg cursor-pointer hover-border-ds-primary transition-colors"
                onClick={handleBrowse}
              >
                <span className="text-ds-muted font-light leading-none" style={{ fontSize: '72px' }}>+</span>
              </div>
              <h2 className={emptyStateStyles.title}>Load COLMAP Data</h2>
              <p className={emptyStateStyles.message}>
                Drag and drop a COLMAP dataset folder here.<br />Or click the box above to browse.
              </p>
              <style>{`.info-line:hover { color: rgba(255,255,255,0.9); }`}</style>
              <div className="text-ds-muted text-sm text-left max-w-md mt-6 mb-4">
                <div className="info-line px-2 rounded"><strong>Drop folder or ZIP file</strong> — subfolders are scanned automatically</div>
                <div className="info-line px-2 rounded"><strong>Required:</strong> cameras, images, points3D (.bin or .txt preferred)</div>
                <div className="info-line px-2 rounded"><strong>Auto-detected:</strong> sparse/0/, sparse/, or any subfolder</div>
                <div className="info-line px-2 rounded"><strong>Optional:</strong> source images (jpg, png, webp, tiff), config (.yaml), masks/</div>
                <div className="info-line px-2 rounded text-ds-muted/70">ZIP: max 2GB, images loaded lazily on-demand</div>
              </div>

              {/* Action buttons row */}
              <div className="flex gap-2 mt-2">
                {/* Load URL button */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsUrlModalOpen(true)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      window.open('https://huggingface.co/datasets/OpsiClear/NGS', '_blank');
                    }}
                    onMouseEnter={() => setHoveredButton('url')}
                    onMouseLeave={() => setHoveredButton(null)}
                    disabled={urlLoading}
                    className={`${buttonStyles.base} ${buttonStyles.sizes.action} ${buttonStyles.variants.secondary} ${urlLoading ? buttonStyles.disabled : ''}`}
                  >
                    <LinkIcon className="w-3.5 h-3.5" />
                    Load URL
                  </button>
                  {hoveredButton === 'url' && (
                    <div className={`absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 ${hoverCardStyles.container}`}>
                      <div className={hoverCardStyles.title}>Load from URL</div>
                      <div className={`${hoverCardStyles.subtitle} whitespace-pre mt-1`}>{`Direct URL expects:
  <baseUrl>/sparse/0/cameras.bin
  <baseUrl>/sparse/0/images.bin
  <baseUrl>/sparse/0/points3D.bin
  <baseUrl>/images/  (optional)
  <baseUrl>/masks/   (optional)`}</div>
                      <div className={`${hoverCardStyles.subtitle} mt-2`}>Or provide a .zip or manifest.json URL</div>
                      <div className={`${hoverCardStyles.subtitle} mt-1 text-ds-muted/70`}>Supports: S3, GCS, R2, Dropbox, HuggingFace, GitHub</div>
                      <div className={`${hoverCardStyles.subtitle} mt-1 text-ds-muted/70`}>Local server: npx http-server --cors -p 8080</div>
                      <div className={hoverCardStyles.hint}>
                        <div className={hoverCardStyles.hintRow}>
                          <MouseLeftIcon className={ICON_SIZES.hoverCard} />
                          Left: open URL dialog
                        </div>
                        <div className={hoverCardStyles.hintRow}>
                          <MouseRightIcon className={ICON_SIZES.hoverCard} />
                          Right: open NGS dataset
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Load JSON button */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => manifestInputRef.current?.click()}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      handleDownloadExampleJson();
                    }}
                    onMouseEnter={() => setHoveredButton('json')}
                    onMouseLeave={() => setHoveredButton(null)}
                    disabled={urlLoading}
                    className={`${buttonStyles.base} ${buttonStyles.sizes.action} ${buttonStyles.variants.secondary} ${urlLoading ? buttonStyles.disabled : ''}`}
                  >
                    <FileJsonIcon className="w-3.5 h-3.5" />
                    Load JSON
                  </button>
                  {hoveredButton === 'json' && (
                    <div className={`absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 ${hoverCardStyles.container}`}>
                      <div className={hoverCardStyles.title}>Load manifest.json</div>
                      <div className={`${hoverCardStyles.subtitle} whitespace-pre mt-1 font-mono text-xs`}>{`{
  "version": 1,
  "baseUrl": "https://...",
  "files": {
    "cameras": "sparse/0/cameras.bin",
    "images": "sparse/0/images.bin",
    "points3D": "sparse/0/points3D.bin"
  },
  "imagesPath": "images/",
  "masksPath": "masks/"
}`}</div>
                      <div className={hoverCardStyles.hint}>
                        <div className={hoverCardStyles.hintRow}>
                          <MouseLeftIcon className={ICON_SIZES.hoverCard} />
                          Left: browse manifest file
                        </div>
                        <div className={hoverCardStyles.hintRow}>
                          <MouseRightIcon className={ICON_SIZES.hoverCard} />
                          Right: download example
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Try a Toy button */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={handleLucky}
                    onMouseEnter={() => setHoveredButton('toy')}
                    onMouseLeave={() => setHoveredButton(null)}
                    disabled={urlLoading}
                    className={`${buttonStyles.base} ${buttonStyles.sizes.action} ${buttonStyles.variants.secondary} ${urlLoading ? buttonStyles.disabled : ''}`}
                  >
                    <img src={publicAsset('LOGO.png')} alt="" className="w-3.5 h-3.5" />
                    Try a Toy!
                  </button>
                  {hoveredButton === 'toy' && (
                    <div className={`absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 ${hoverCardStyles.container}`}>
                      <div className={hoverCardStyles.title}>Load random 3D scan</div>
                      <div className={hoverCardStyles.subtitle}>Multiview data from OpsiClear NGS dataset</div>
                      <div className={`${hoverCardStyles.subtitle} text-ds-muted/70`}>huggingface.co/datasets/OpsiClear/NGS</div>
                      <div className={`${hoverCardStyles.subtitle} mt-1`}>Includes: images, masks, sparse reconstruction</div>
                      <div className={hoverCardStyles.hint}>
                        <div className={hoverCardStyles.hintRow}>
                          <MouseLeftIcon className={ICON_SIZES.hoverCard} />
                          Left: load random scan
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {urlLoading && urlProgress && (
        <div className={loadingStyles.overlay}>
          <div className={loadingStyles.container}>
            <div className="flex justify-center mb-4">
              <img
                src={publicAsset('LOGO.png')}
                alt="Loading"
                className="w-12 h-12 animate-bounce"
              />
            </div>
            <div className={loadingStyles.text}>{urlProgress.message}</div>
            <div className={loadingStyles.progressBar}>
              <div
                className={loadingStyles.progressFill}
                style={{ width: `${Math.round(urlProgress.percent)}%` }}
              />
            </div>
            <div className={loadingStyles.percentage}>{Math.round(urlProgress.percent)}%</div>
            {urlProgress.currentFile && (
              <div className="text-white/70 text-xs mt-2 max-w-xs truncate">
                {urlProgress.currentFile}
              </div>
            )}
            {urlProgress.filesDownloaded !== undefined && urlProgress.totalFiles !== undefined && (
              <div className="text-white/70 text-xs mt-1">
                {urlProgress.filesDownloaded} / {urlProgress.totalFiles} files
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className={`${toastStyles.containerWithLayout} ${toastStyles.error}`}>
          <div className={toastStyles.content}>
            <div className={toastStyles.titleError}>Error loading data</div>
            <div className={toastStyles.message}>{error}</div>
          </div>
          <button
            onClick={() => setError(null)}
            className={buttonStyles.close}
          >
            ×
          </button>
        </div>
      )}

      {/* URL Input Modal */}
      <UrlInputModal
        isOpen={isUrlModalOpen}
        onClose={() => setIsUrlModalOpen(false)}
        onLoad={handleUrlLoad}
        loading={urlLoading}
      />

    </div>
  );
}
