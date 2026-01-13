import { useMemo, useState, useEffect, useRef } from 'react';
import { useReconstructionStore, useViewerStore } from '../../store';

type ViewMode = 'gallery' | 'list';

function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

function ListIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="4" height="4" />
      <line x1="10" y1="6" x2="21" y2="6" />
      <rect x="3" y="10" width="4" height="4" />
      <line x1="10" y1="12" x2="21" y2="12" />
      <rect x="3" y="16" width="4" height="4" />
      <line x1="10" y1="18" x2="21" y2="18" />
    </svg>
  );
}

interface ImageItemProps {
  imageId: number;
  name: string;
  file?: File;
  numPoints2D: number;
  numPoints3D: number;
  cameraId: number;
  cameraWidth: number;
  cameraHeight: number;
  covisibleCount: number;
  avgError: number;
  onClick: () => void;
  onDoubleClick: () => void;
  onContextMenu: () => void;
  isSelected: boolean;
  itemRef?: React.RefObject<HTMLDivElement>;
  viewMode: ViewMode;
}

function ImageItem({ imageId, name, file, numPoints2D, numPoints3D, cameraId: _cameraId, cameraWidth, cameraHeight, covisibleCount, avgError, onClick, onDoubleClick, onContextMenu, isSelected, itemRef, viewMode }: ImageItemProps) {
  void _cameraId; // Reserved for future use
  const [src, setSrc] = useState<string | null>(null);
  const localRef = useRef<HTMLDivElement>(null);

  const setRef = (el: HTMLDivElement | null) => {
    (localRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    if (itemRef) {
      (itemRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    }
  };

  useEffect(() => {
    if (!file || !localRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          const url = URL.createObjectURL(file);
          setSrc(url);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' }
    );

    observer.observe(localRef.current);

    return () => {
      observer.disconnect();
      if (src) {
        URL.revokeObjectURL(src);
      }
    };
  }, [file]);

  if (viewMode === 'list') {
    return (
      <div
        ref={setRef}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu(); }}
        className={`
          flex items-start gap-2 px-2 py-1 rounded cursor-pointer group
          border transition-colors
          ${isSelected ? 'border-ds-frustum-selected bg-ds-tertiary' : 'border-transparent hover:bg-ds-tertiary'}
        `}
      >
        {/* Thumbnail */}
        <div className="w-14 h-14 flex-shrink-0 bg-ds-hover rounded overflow-hidden">
          {src ? (
            <img src={src} alt={name} className="w-full h-full object-cover" draggable={false} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-ds-muted text-base">
              {imageId}
            </div>
          )}
        </div>
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-ds-primary text-base truncate flex-1" title={name}>{name}</div>
            {/* Expand button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDoubleClick();
              }}
              className="flex-shrink-0 w-6 h-6 rounded bg-ds-hover hover:bg-ds-elevated text-ds-secondary hover:text-ds-primary flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              data-tooltip="View details"
              data-tooltip-pos="bottom"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              </svg>
            </button>
          </div>
          <div className="text-ds-muted text-base leading-tight whitespace-nowrap">
            #{imageId} · {cameraWidth}×{cameraHeight} · <span className="text-ds-success">{numPoints3D}</span>/<span className="text-ds-secondary">{numPoints2D}</span> · <span className="text-ds-warning">{covisibleCount}</span> img · <span className="text-ds-warning">{avgError.toFixed(2)}px</span>
          </div>
        </div>
      </div>
    );
  }

  // Gallery view (default)
  return (
    <div
      ref={setRef}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(); }}
      className={`
        aspect-square bg-ds-tertiary rounded cursor-pointer overflow-hidden relative group
        border-2 transition-colors
        ${isSelected ? 'border-ds-frustum-selected' : 'border-transparent hover:border-ds-light'}
      `}
      title={`${name} (ID: ${imageId})`}
    >
      {src ? (
        <img
          src={src}
          alt={name}
          className="w-full h-full object-cover"
          loading="lazy"
          draggable={false}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-ds-muted text-base p-1 text-center">
          {name}
        </div>
      )}
      {/* Expand button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDoubleClick();
        }}
        className="absolute top-1.5 right-1.5 z-10 w-6 h-6 rounded bg-ds-hover hover:bg-ds-elevated text-ds-secondary hover:text-ds-primary flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        data-tooltip="View details"
        data-tooltip-pos="left"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
        </svg>
      </button>
      {/* Shadow gradient overlay */}
      <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black/70 via-black/30 to-transparent pointer-events-none" />
      {/* Info overlay */}
      <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1.5">
        <div className="text-ds-primary text-base truncate" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.6)' }}>{name}</div>
        <div className="text-ds-secondary text-base" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.6)' }}>
          ID: {imageId} · <span className="text-ds-success">{numPoints3D}</span>/{numPoints2D}
        </div>
      </div>
    </div>
  );
}

const MIN_COLUMNS = 1;
const MAX_COLUMNS = 10;
const DEFAULT_LIST_MIN_WIDTH = 420;

export function ImageGallery() {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const loadedFiles = useReconstructionStore((s) => s.loadedFiles);
  const selectedImageId = useViewerStore((s) => s.selectedImageId);
  const setSelectedImageId = useViewerStore((s) => s.setSelectedImageId);
  const openImageDetail = useViewerStore((s) => s.openImageDetail);
  const flyToImage = useViewerStore((s) => s.flyToImage);
  const itemRefs = useRef<Map<number, React.RefObject<HTMLDivElement>>>(new Map());
  const [viewMode, setViewMode] = useState<ViewMode>('gallery');
  const [galleryColumns, setGalleryColumns] = useState(4);
  const [cameraFilter, setCameraFilter] = useState<number | 'all'>('all');
  const containerRef = useRef<HTMLDivElement>(null);

  // Get list of available cameras
  const cameras = useMemo(() => {
    if (!reconstruction) return [];
    return Array.from(reconstruction.cameras.values()).sort((a, b) => a.cameraId - b.cameraId);
  }, [reconstruction]);

  const images = useMemo(() => {
    if (!reconstruction) return [];

    return Array.from(reconstruction.images.values())
      .filter((img) => cameraFilter === 'all' || img.cameraId === cameraFilter)
      .map((img) => {
        let numPoints3D = 0;
        let totalError = 0;
        let errorCount = 0;
        const covisibleSet = new Set<number>();

        for (const p of img.points2D) {
          if (p.point3DId !== BigInt(-1)) {
            numPoints3D++;
            const point3D = reconstruction.points3D.get(p.point3DId);
            if (point3D) {
              if (point3D.error >= 0) {
                totalError += point3D.error;
                errorCount++;
              }
              // Count covisible images
              for (const track of point3D.track) {
                if (track.imageId !== img.imageId) {
                  covisibleSet.add(track.imageId);
                }
              }
            }
          }
        }

        const camera = reconstruction.cameras.get(img.cameraId);
        return {
          imageId: img.imageId,
          name: img.name,
          file: loadedFiles?.imageFiles.get(img.name),
          numPoints2D: img.points2D.length,
          numPoints3D,
          cameraId: img.cameraId,
          cameraWidth: camera?.width ?? 0,
          cameraHeight: camera?.height ?? 0,
          covisibleCount: covisibleSet.size,
          avgError: errorCount > 0 ? totalError / errorCount : 0,
        };
      });
  }, [reconstruction, loadedFiles, cameraFilter]);

  // Create refs for each image
  const getRef = (imageId: number) => {
    if (!itemRefs.current.has(imageId)) {
      itemRefs.current.set(imageId, { current: null } as unknown as React.RefObject<HTMLDivElement>);
    }
    return itemRefs.current.get(imageId)!;
  };

  // Scroll to selected image when it changes
  useEffect(() => {
    if (selectedImageId !== null) {
      const ref = itemRefs.current.get(selectedImageId);
      if (ref?.current) {
        ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [selectedImageId]);

  // Handle shift+scroll to zoom (gallery only)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || viewMode !== 'gallery') return;

    const handleWheel = (e: WheelEvent) => {
      if (e.shiftKey) {
        e.preventDefault();
        setGalleryColumns((prev) => {
          if (e.deltaY > 0) {
            // Scroll down = zoom out (more columns)
            return Math.min(MAX_COLUMNS, prev + 1);
          } else {
            // Scroll up = zoom in (fewer columns)
            return Math.max(MIN_COLUMNS, prev - 1);
          }
        });
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [viewMode]);

  if (!reconstruction) {
    return (
      <div className="h-full flex items-center justify-center text-ds-muted bg-ds-secondary">
        Load COLMAP data to view images
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-ds-muted bg-ds-secondary">
        No images found
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full flex flex-col bg-ds-secondary">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 p-2 border-b border-ds bg-ds-tertiary">
        <div className="flex items-center gap-2">
          {/* Camera filter */}
          <select
            value={cameraFilter}
            onChange={(e) => setCameraFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
            className="bg-ds-input text-ds-primary text-base rounded px-2 py-1.5 border border-ds"
          >
            <option value="all">All Cameras ({cameras.length})</option>
            {cameras.map((cam) => (
              <option key={cam.cameraId} value={cam.cameraId}>
                Camera {cam.cameraId} ({cam.width}×{cam.height})
              </option>
            ))}
          </select>
          <span className="text-ds-muted text-base">{images.length} images</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-ds-muted text-base">{viewMode === 'gallery' ? 'Shift+Scroll to zoom' : ''}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewMode('gallery')}
              className={`p-1.5 rounded transition-colors ${
                viewMode === 'gallery' ? 'bg-ds-accent text-ds-void' : 'text-ds-secondary hover:text-ds-primary hover:bg-ds-hover'
              }`}
              title="Gallery view"
            >
              <GridIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded transition-colors ${
                viewMode === 'list' ? 'bg-ds-accent text-ds-void' : 'text-ds-secondary hover:text-ds-primary hover:bg-ds-hover'
              }`}
              title="List view"
            >
              <ListIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-2">
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: viewMode === 'gallery'
              ? `repeat(${galleryColumns}, 1fr)`
              : `repeat(auto-fill, minmax(${DEFAULT_LIST_MIN_WIDTH}px, 1fr))`
          }}
        >
          {images.map((img) => (
            <ImageItem
              key={img.imageId}
              imageId={img.imageId}
              name={img.name}
              file={img.file}
              numPoints2D={img.numPoints2D}
              numPoints3D={img.numPoints3D}
              cameraId={img.cameraId}
              cameraWidth={img.cameraWidth}
              cameraHeight={img.cameraHeight}
              covisibleCount={img.covisibleCount}
              avgError={img.avgError}
              onClick={() => setSelectedImageId(img.imageId)}
              onDoubleClick={() => openImageDetail(img.imageId)}
              onContextMenu={() => flyToImage(img.imageId)}
              isSelected={selectedImageId === img.imageId}
              itemRef={getRef(img.imageId)}
              viewMode={viewMode}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
