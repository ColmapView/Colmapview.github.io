import { useMemo, useState, useEffect, useRef, memo, startTransition } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useReconstructionStore } from '../../store';
import { getImageFile } from '../../utils/imageFileUtils';
import { useThumbnail } from '../../hooks/useThumbnail';
import { useImageSelection } from '../../hooks/useImageSelection';
import { COLUMNS, GAP, SIZE, TIMING, ASPECT_RATIO, buttonStyles, getTooltipProps, galleryStyles, listStyles, inputStyles } from '../../theme';

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

interface ImageData {
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
}

interface GalleryItemProps {
  img: ImageData;
  isSelected: boolean;
  onClick: (id: number) => void;
  onDoubleClick: (id: number) => void;
  onContextMenu: (id: number) => void;
  aspectRatio: number;
  isScrolling: boolean;
}

const GalleryItem = memo(function GalleryItem({ img, isSelected, onClick, onDoubleClick, onContextMenu, aspectRatio, isScrolling }: GalleryItemProps) {
  // Use async thumbnail loading - decodes off-main-thread to avoid blocking orbit controls
  const src = useThumbnail(img.file, img.name, !isScrolling);

  return (
    <div
      style={{ aspectRatio }}
      onClick={() => onClick(img.imageId)}
      onDoubleClick={() => onDoubleClick(img.imageId)}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(img.imageId); }}
      className={`${galleryStyles.item} ${isSelected ? galleryStyles.itemSelected : galleryStyles.itemHover}`}
      title={`${img.name} (ID: ${img.imageId})\nDouble-click: image info`}
    >
      {src ? (
        <img src={src} alt={img.name} className="absolute inset-0 w-full h-full object-contain" draggable={false} />
      ) : (
        <div className={galleryStyles.placeholder}>
          {isScrolling ? '...' : img.name}
        </div>
      )}
      {/* Info overlay */}
      <div className={galleryStyles.overlay}>
        <div className="text-white text-sm truncate">{img.name}</div>
      </div>
    </div>
  );
});

type ListItemProps = Omit<GalleryItemProps, 'aspectRatio'>;

const ListItem = memo(function ListItem({ img, isSelected, onClick, onDoubleClick, onContextMenu, isScrolling }: ListItemProps) {
  const src = useThumbnail(img.file, img.name, !isScrolling);

  return (
    <div
      onClick={() => onClick(img.imageId)}
      onDoubleClick={() => onDoubleClick(img.imageId)}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(img.imageId); }}
      style={{ height: SIZE.listRowHeight }}
      className={`${listStyles.item} px-3 ${isSelected ? listStyles.itemSelected : listStyles.itemHover}`}
      title="Double-click: image info"
    >
      <div className={`${listStyles.thumbnail} w-14 h-14`}>
        {src ? (
          <img src={src} alt={img.name} className="w-full h-full object-cover" draggable={false} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-ds-muted text-xs">{img.imageId}</div>
        )}
      </div>
      <div className={listStyles.content}>
        <div className={`${listStyles.title} font-medium`}>{img.name}</div>
        <div className={listStyles.subtitle}>ID {img.imageId} · Camera {img.cameraId} ({img.cameraWidth}×{img.cameraHeight})</div>
      </div>
      <div className="flex-shrink-0 text-right">
        <div className="text-ds-primary text-sm">{img.numPoints3D}<span className="text-ds-muted">/{img.numPoints2D}</span></div>
        <div className="text-ds-muted text-xs">3D/2D pts</div>
      </div>
      <div className="flex-shrink-0 text-right w-16">
        <div className="text-ds-primary text-sm">{img.covisibleCount}</div>
        <div className="text-ds-muted text-xs">covisible</div>
      </div>
      <div className="flex-shrink-0 text-right w-16">
        <div className="text-ds-primary text-sm">{img.avgError.toFixed(2)}</div>
        <div className="text-ds-muted text-xs">avg err</div>
      </div>
    </div>
  );
});

function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    result.push(array.slice(i, i + chunkSize));
  }
  return result;
}

function getViewModeButtonClass(isActive: boolean): string {
  const base = `${buttonStyles.base} ${buttonStyles.sizes.icon}`;
  return isActive
    ? `${base} ${buttonStyles.variants.toggleActive}`
    : `${base} ${buttonStyles.variants.toggle}`;
}

export function ImageGallery() {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const loadedFiles = useReconstructionStore((s) => s.loadedFiles);
  const { selectedImageId, handleClick, handleDoubleClick, handleContextMenu } = useImageSelection();
  const [viewMode, setViewMode] = useState<ViewMode>('gallery');
  const [galleryColumns, setGalleryColumns] = useState<number>(COLUMNS.default);
  const [cameraFilter, setCameraFilter] = useState<number | 'all'>('all');
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset camera filter when reconstruction changes
  useEffect(() => {
    setCameraFilter('all');
  }, [reconstruction]);

  const cameras = useMemo(() => {
    if (!reconstruction) return [];
    return Array.from(reconstruction.cameras.values()).sort((a, b) => a.cameraId - b.cameraId);
  }, [reconstruction]);

  const imageFiles = loadedFiles?.imageFiles;

  const images = useMemo(() => {
    if (!reconstruction) return [];

    return Array.from(reconstruction.images.values())
      .filter((img) => cameraFilter === 'all' || img.cameraId === cameraFilter)
      .map((img) => {
        const stats = reconstruction.imageStats.get(img.imageId);
        const camera = reconstruction.cameras.get(img.cameraId);

        return {
          imageId: img.imageId,
          name: img.name,
          file: getImageFile(imageFiles, img.name),
          numPoints2D: img.points2D.length,
          numPoints3D: stats?.numPoints3D ?? 0,
          cameraId: img.cameraId,
          cameraWidth: camera?.width ?? 0,
          cameraHeight: camera?.height ?? 0,
          covisibleCount: stats?.covisibleCount ?? 0,
          avgError: stats?.avgError ?? 0,
        };
      });
  }, [reconstruction, imageFiles, cameraFilter]);

  // Handle shift+scroll to zoom with debouncing for performance
  const pendingColumnChange = useRef<number | null>(null);
  const wheelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || viewMode !== 'gallery') return;

    const handleWheel = (e: WheelEvent) => {
      // Only intercept shift+scroll, let regular scroll be handled normally
      if (!e.shiftKey) return;
      e.preventDefault();

      // Calculate new column value
      const delta = e.deltaY > 0 ? 1 : -1;
      const currentColumns = pendingColumnChange.current ?? galleryColumns;
      const newColumns = Math.max(COLUMNS.min, Math.min(COLUMNS.max, currentColumns + delta));
      pendingColumnChange.current = newColumns;

      // Debounce with setTimeout for better batching
      if (wheelTimeoutRef.current !== null) {
        clearTimeout(wheelTimeoutRef.current);
      }

      wheelTimeoutRef.current = setTimeout(() => {
        const finalColumns = pendingColumnChange.current;
        pendingColumnChange.current = null;
        wheelTimeoutRef.current = null;

        if (finalColumns !== null && finalColumns !== galleryColumns) {
          startTransition(() => {
            setGalleryColumns(finalColumns);
          });
        }
      }, TIMING.wheelDebounce);
    };

    container.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => {
      container.removeEventListener('wheel', handleWheel, { capture: true });
      if (wheelTimeoutRef.current !== null) {
        clearTimeout(wheelTimeoutRef.current);
      }
    };
  }, [viewMode, galleryColumns]);

  // Aspect ratio from first image's camera (single source of truth for gallery item sizing)
  const aspectRatio = useMemo(() => {
    const firstImg = images[0];
    return firstImg && firstImg.cameraWidth > 0 && firstImg.cameraHeight > 0
      ? firstImg.cameraWidth / firstImg.cameraHeight
      : ASPECT_RATIO.landscape;
  }, [images]);

  // Grid layout: organize images into rows
  const rows = useMemo(() => chunkArray(images, galleryColumns), [images, galleryColumns]);
  const listRows = useMemo(() => images.map(img => [img]), [images]); // 1 item per row for list view

  // Row virtualizer for gallery grid - uses measureElement for actual row heights
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => SIZE.defaultCellHeight + GAP.gallery, // Estimate, actual size from measureElement
    overscan: TIMING.galleryOverscan,
  });

  // List virtualizer - fixed row height
  const listVirtualizer = useVirtualizer({
    count: listRows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => SIZE.listRowHeight + GAP.gallery,
    overscan: TIMING.listOverscan,
  });

  // Scroll to selected image when selection changes (e.g., from 3D viewer frustum click)
  useEffect(() => {
    if (selectedImageId === null) return;

    // Find the index of the selected image
    const imageIndex = images.findIndex((img) => img.imageId === selectedImageId);
    if (imageIndex === -1) return;

    if (viewMode === 'gallery') {
      const rowIndex = Math.floor(imageIndex / galleryColumns);
      rowVirtualizer.scrollToIndex(rowIndex, { align: 'center', behavior: 'smooth' });
    } else {
      // List view: 1 item per row, so rowIndex === imageIndex
      listVirtualizer.scrollToIndex(imageIndex, { align: 'center', behavior: 'smooth' });
    }
  }, [selectedImageId, images, viewMode, galleryColumns, rowVirtualizer, listVirtualizer]);

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
    <div className="h-full flex flex-col bg-ds-secondary">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 p-2 border-b border-ds bg-ds-tertiary">
        <div className="flex items-center gap-2">
          <select
            value={cameraFilter}
            onChange={(e) => setCameraFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
            className={`${inputStyles.select} ${inputStyles.sizes.md}`}
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
          {viewMode === 'gallery' && <span className="text-ds-muted text-base">Shift+Scroll to zoom</span>}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewMode('gallery')}
              className={getViewModeButtonClass(viewMode === 'gallery')}
              {...getTooltipProps('Gallery view', 'bottom')}
            >
              <GridIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={getViewModeButtonClass(viewMode === 'list')}
              {...getTooltipProps('List view', 'bottom')}
            >
              <ListIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Virtualized Content - flex-1 gets height from parent flex container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto min-h-0 relative p-2"
      >
        {viewMode === 'gallery' ? (
            // Gallery Grid View - virtualize rows
            <div
              style={{
                height: rowVirtualizer.getTotalSize(),
                width: '100%',
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const rowImages = rows[virtualRow.index];
                return (
                  <div
                    key={virtualRow.key}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                      display: 'grid',
                      gridTemplateColumns: `repeat(${galleryColumns}, 1fr)`,
                      gap: GAP.gallery,
                      willChange: 'transform',
                    }}
                  >
                    {rowImages.map((img) => (
                      <GalleryItem
                        key={img.imageId}
                        img={img}
                        isSelected={selectedImageId === img.imageId}
                        onClick={handleClick}
                        onDoubleClick={handleDoubleClick}
                        onContextMenu={handleContextMenu}
                        aspectRatio={aspectRatio}
                        isScrolling={rowVirtualizer.isScrolling}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          ) : (
            // List View - 1 item per row
            <div
              style={{
                height: listVirtualizer.getTotalSize(),
                width: '100%',
                position: 'relative',
              }}
            >
              {listVirtualizer.getVirtualItems().map((virtualRow) => {
                const img = listRows[virtualRow.index][0];
                return (
                  <div
                    key={virtualRow.key}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                      willChange: 'transform',
                    }}
                  >
                    <ListItem
                      img={img}
                      isSelected={selectedImageId === img.imageId}
                      onClick={handleClick}
                      onDoubleClick={handleDoubleClick}
                      onContextMenu={handleContextMenu}
                      isScrolling={listVirtualizer.isScrolling}
                    />
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}
