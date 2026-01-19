import { useMemo, useState, useEffect, useRef, memo, startTransition, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useReconstructionStore, useUIStore, useCameraStore } from '../../store';
import { getImageFile } from '../../utils/imageFileUtils';
import { useThumbnail, pauseThumbnailCache, resumeThumbnailCache } from '../../hooks/useThumbnail';
import { COLUMNS, GAP, SIZE, TIMING, buttonStyles, getTooltipProps, galleryStyles, listStyles, inputStyles, emptyStateStyles, toolbarStyles, hoverCardStyles, ICON_SIZES } from '../../theme';

type ViewMode = 'gallery' | 'list';
type SortField = 'name' | 'imageId' | 'avgError' | 'covisibleCount' | 'numPoints3D' | 'numPoints2D';
type SortDirection = 'asc' | 'desc';

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

function SortAscIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12l7-7 7 7" />
    </svg>
  );
}

function SortDescIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12l7 7 7-7" />
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
  onRightClick: (id: number) => void;
  isScrolling: boolean;
  skipImages: boolean;
  isSettling: boolean;
  isResizing: boolean;
}

const GalleryItem = memo(function GalleryItem({ img, isSelected, onClick, onDoubleClick, onRightClick, isScrolling, skipImages, isSettling, isResizing }: GalleryItemProps) {
  // Load thumbnail lazily when visible and not scrolling/settling/resizing (disabled in skip mode)
  const src = useThumbnail(img.file, img.name, !isScrolling && !skipImages && !isSettling && !isResizing);
  const [hovered, setHovered] = useState(false);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // Clear hover state when scrolling starts
  useEffect(() => {
    if (isScrolling && hovered) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional pattern to clear hover during scroll
      setHovered(false);
       
      setMousePos(null);
      document.body.style.cursor = '';
    }
  }, [isScrolling, hovered]);

  // Click to select, click again on selected to show info
  const handleClick = () => {
    if (isSelected) {
      onDoubleClick(img.imageId);
    } else {
      onClick(img.imageId);
    }
  };

  return (
    <div
      className={`${galleryStyles.itemAspect} group ${galleryStyles.item} ${isSelected ? galleryStyles.itemSelected : galleryStyles.itemHover}`}
      style={{ position: 'relative' }}
      onClick={handleClick}
      onContextMenu={(e) => { e.preventDefault(); onRightClick(img.imageId); }}
      onPointerOver={(e) => {
        setHovered(true);
        setMousePos({ x: e.clientX, y: e.clientY });
        document.body.style.cursor = 'pointer';
      }}
      onPointerMove={(e) => {
        if (hovered) setMousePos({ x: e.clientX, y: e.clientY });
      }}
      onPointerOut={() => {
        setHovered(false);
        setMousePos(null);
        document.body.style.cursor = '';
      }}
    >
      {/* Inner wrapper clips image content without clipping tooltip */}
      <div className={galleryStyles.itemInner}>
        {src ? (
          <img src={src} alt={img.name} className={galleryStyles.itemImage} draggable={false} />
        ) : (
          <div className={galleryStyles.placeholder}>
            {isScrolling ? '...' : img.name}
          </div>
        )}
        {/* Realistic lens vignette overlay - elliptical with smooth falloff (hidden when selected) */}
        {!isSelected && (
          <div
            className="absolute inset-0 pointer-events-none z-10"
            style={{
              background: `
                radial-gradient(
                  ellipse 100% 100% at center,
                  transparent 20%,
                  rgba(0,0,0,0.15) 40%,
                  rgba(0,0,0,0.4) 60%,
                  rgba(0,0,0,0.7) 80%,
                  rgba(0,0,0,0.9) 100%
                )
              `,
            }}
          />
        )}
      </div>
      {/* Image name overlay */}
      <div className={`${galleryStyles.overlay} z-20`}>
        <div className={galleryStyles.overlayText}>{img.name}</div>
      </div>
      {/* Hover card - rendered via portal to body */}
      {hovered && mousePos && createPortal(
        <div
          style={{
            position: 'fixed',
            left: mousePos.x + 12,
            top: mousePos.y + 12,
            pointerEvents: 'none',
            zIndex: 9999,
          }}
        >
          <div className={hoverCardStyles.container}>
            <div className={hoverCardStyles.title}>{img.name}</div>
            <div className={hoverCardStyles.subtitle}>#{img.imageId}</div>
            <div className={hoverCardStyles.subtitle}>{img.numPoints3D} 3D points</div>
            <div className={hoverCardStyles.subtitle}>{img.numPoints2D} 2D points</div>
            <div className={hoverCardStyles.subtitle}>{img.covisibleCount} covisible</div>
            <div className={hoverCardStyles.subtitle}>{img.avgError.toFixed(2)} avg error</div>
            <div className={hoverCardStyles.hint}>
              <div className={hoverCardStyles.hintRow}>
                <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="6"/>
                  <path d="M12 2v8"/>
                  <rect x="6" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
                </svg>
                {isSelected ? 'Left: details' : 'Left: select'}
              </div>
              <div className={hoverCardStyles.hintRow}>
                <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="6"/>
                  <path d="M12 2v8"/>
                  <rect x="12" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
                </svg>
                Right: fly to
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
});

type ListItemProps = GalleryItemProps;

const ListItem = memo(function ListItem({ img, isSelected, onClick, onDoubleClick, onRightClick, isScrolling, skipImages, isSettling, isResizing }: ListItemProps) {
  // Load thumbnail lazily when visible and not scrolling/settling/resizing (disabled in skip mode)
  const src = useThumbnail(img.file, img.name, !isScrolling && !skipImages && !isSettling && !isResizing);
  const [hovered, setHovered] = useState(false);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // Clear hover state when scrolling starts
  useEffect(() => {
    if (isScrolling && hovered) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional pattern to clear hover during scroll
      setHovered(false);
       
      setMousePos(null);
      document.body.style.cursor = '';
    }
  }, [isScrolling, hovered]);

  // Click to select, click again on selected to show info
  const handleClick = () => {
    if (isSelected) {
      onDoubleClick(img.imageId);
    } else {
      onClick(img.imageId);
    }
  };

  return (
    <div
      onClick={handleClick}
      onContextMenu={(e) => { e.preventDefault(); onRightClick(img.imageId); }}
      onPointerOver={(e) => {
        setHovered(true);
        setMousePos({ x: e.clientX, y: e.clientY });
        document.body.style.cursor = 'pointer';
      }}
      onPointerMove={(e) => {
        if (hovered) setMousePos({ x: e.clientX, y: e.clientY });
      }}
      onPointerOut={() => {
        setHovered(false);
        setMousePos(null);
        document.body.style.cursor = '';
      }}
      style={{ height: SIZE.listRowHeight }}
      className={`${listStyles.item} px-3 list-stats-container ${isSelected ? listStyles.itemSelected : listStyles.itemHover}`}
    >
      <div className={`${listStyles.thumbnail} ${listStyles.thumbnailSize}`}>
        {src ? (
          <img src={src} alt={img.name} className="w-full h-full object-cover" draggable={false} />
        ) : (
          <div className={listStyles.thumbnailPlaceholder}>{img.imageId}</div>
        )}
      </div>
      <div className={listStyles.content}>
        <div className={listStyles.title}>{img.name}</div>
        <div className={listStyles.subtitle}>ID {img.imageId} · Camera {img.cameraId} ({img.cameraWidth}×{img.cameraHeight})</div>
      </div>
      {/* Compact format for narrow panels - single column, 2 lines */}
      <div className="flex-shrink-0 text-right list-stats-compact">
        <div className="text-ds-primary text-xs whitespace-nowrap">{img.numPoints3D}<span className="text-ds-muted">/{img.numPoints2D}</span> · {img.covisibleCount} · {img.avgError.toFixed(2)}</div>
        <div className="text-ds-muted text-xs whitespace-nowrap">pts · covis · err</div>
      </div>
      {/* Full format for wider panels */}
      <div className="flex-shrink-0 text-right list-stats-full">
        <div className="text-ds-primary text-sm">{img.numPoints3D}<span className="text-ds-muted">/{img.numPoints2D}</span></div>
        <div className="text-ds-muted text-xs">3D/2D pts</div>
      </div>
      <div className="flex-shrink-0 text-right w-16 list-stats-full">
        <div className="text-ds-primary text-sm">{img.covisibleCount}</div>
        <div className="text-ds-muted text-xs">covisible</div>
      </div>
      <div className="flex-shrink-0 text-right w-16 list-stats-full">
        <div className="text-ds-primary text-sm">{img.avgError.toFixed(2)}</div>
        <div className="text-ds-muted text-xs">avg err</div>
      </div>
      {/* Hover card - simplified for list view (stats already visible in row) */}
      {hovered && mousePos && createPortal(
        <div
          style={{
            position: 'fixed',
            left: mousePos.x + 12,
            top: mousePos.y + 12,
            pointerEvents: 'none',
            zIndex: 9999,
          }}
        >
          <div className={hoverCardStyles.container}>
            <div className={hoverCardStyles.hint}>
              <div className={hoverCardStyles.hintRow}>
                <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="6"/>
                  <path d="M12 2v8"/>
                  <rect x="6" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
                </svg>
                {isSelected ? 'Left: details' : 'Left: select'}
              </div>
              <div className={hoverCardStyles.hintRow}>
                <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="6"/>
                  <path d="M12 2v8"/>
                  <rect x="12" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
                </svg>
                Right: fly to
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
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

interface ImageGalleryProps {
  isResizing?: boolean;
}

export function ImageGallery({ isResizing = false }: ImageGalleryProps) {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const loadedFiles = useReconstructionStore((s) => s.loadedFiles);
  const imageLoadMode = useUIStore((s) => s.imageLoadMode);
  const openImageDetail = useUIStore((s) => s.openImageDetail);
  const selectedImageId = useCameraStore((s) => s.selectedImageId);
  const setSelectedImageId = useCameraStore((s) => s.setSelectedImageId);
  const flyToImage = useCameraStore((s) => s.flyToImage);
  const [viewMode, setViewMode] = useState<ViewMode>('gallery');
  const [galleryColumns, setGalleryColumns] = useState<number>(COLUMNS.default);
  const [cameraFilter, setCameraFilter] = useState<number | 'all'>('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const containerRef = useRef<HTMLDivElement>(null);

  // Click handlers
  const handleClick = useCallback((imageId: number) => {
    setSelectedImageId(imageId);
  }, [setSelectedImageId]);

  const handleDoubleClick = useCallback((imageId: number) => {
    openImageDetail(imageId);
  }, [openImageDetail]);

  // Right-click selects and goes to image in 3D viewer
  const handleRightClick = useCallback((imageId: number) => {
    setSelectedImageId(imageId);
    flyToImage(imageId);
  }, [setSelectedImageId, flyToImage]);

  // Reset camera filter when reconstruction changes
  useEffect(() => {
    setCameraFilter('all');
  }, [reconstruction]);

  // Debounce loading after filter/sort/selection changes to let virtual list settle
  const [isSettling, setIsSettling] = useState(false);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Pause loading when filter, sort, or selection changes (selection triggers scroll)
    setIsSettling(true);
    pauseThumbnailCache();

    if (settleRef.current !== null) {
      clearTimeout(settleRef.current);
    }

    settleRef.current = setTimeout(() => {
      setIsSettling(false);
      resumeThumbnailCache();
      settleRef.current = null;
    }, 50); // Short delay to let virtual list settle

    return () => {
      if (settleRef.current !== null) {
        clearTimeout(settleRef.current);
      }
    };
  }, [cameraFilter, sortField, sortDirection, selectedImageId]);

  const cameras = useMemo(() => {
    if (!reconstruction) return [];
    return Array.from(reconstruction.cameras.values()).sort((a, b) => a.cameraId - b.cameraId);
  }, [reconstruction]);

  const imageFiles = loadedFiles?.imageFiles;

  const images = useMemo(() => {
    if (!reconstruction) return [];

    const mapped = Array.from(reconstruction.images.values())
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

    // Sort images
    const sortMultiplier = sortDirection === 'asc' ? 1 : -1;
    mapped.sort((a, b) => {
      if (sortField === 'name') {
        return sortMultiplier * a.name.localeCompare(b.name);
      }
      return sortMultiplier * (a[sortField] - b[sortField]);
    });

    return mapped;
  }, [reconstruction, imageFiles, cameraFilter, sortField, sortDirection]);

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

  // Grid layout: organize images into rows
  const rows = useMemo(() => chunkArray(images, galleryColumns), [images, galleryColumns]);
  const listRows = useMemo(() => images.map(img => [img]), [images]); // 1 item per row for list view

  // Row virtualizer for gallery grid - uses measureElement for actual row heights
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual library is compatible despite compiler warning
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

  // Debounced scroll state: immediately block loads when scrolling, debounce re-enabling after stop
  const [debouncedIsScrolling, setDebouncedIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentIsScrolling = viewMode === 'gallery' ? rowVirtualizer.isScrolling : listVirtualizer.isScrolling;

  useEffect(() => {
    if (currentIsScrolling) {
      // Immediately block thumbnail loads when scrolling starts
      if (scrollTimeoutRef.current !== null) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
      setDebouncedIsScrolling(true);
      pauseThumbnailCache(); // Pause idle processing during scroll
    } else {
      // Debounce re-enabling loads after scrolling stops (wait for scroll to settle)
      if (scrollTimeoutRef.current === null) {
        scrollTimeoutRef.current = setTimeout(() => {
          setDebouncedIsScrolling(false);
          resumeThumbnailCache(); // Resume idle processing
          scrollTimeoutRef.current = null;
        }, TIMING.transitionBase); // 150ms delay after scroll stops
      }
    }

    return () => {
      if (scrollTimeoutRef.current !== null) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [currentIsScrolling]);

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

  // Arrow key navigation for gallery/list
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if typing in input/textarea or no images
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (images.length === 0) return;

      const key = e.key;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) return;

      e.preventDefault();

      // Find current index, default to -1 if nothing selected
      const currentIndex = selectedImageId !== null
        ? images.findIndex((img) => img.imageId === selectedImageId)
        : -1;

      let newIndex: number;

      if (viewMode === 'gallery') {
        // Gallery mode: up/down move by row, left/right move by 1
        switch (key) {
          case 'ArrowLeft':
            newIndex = currentIndex <= 0 ? images.length - 1 : currentIndex - 1;
            break;
          case 'ArrowRight':
            newIndex = currentIndex >= images.length - 1 ? 0 : currentIndex + 1;
            break;
          case 'ArrowUp':
            newIndex = currentIndex - galleryColumns;
            if (newIndex < 0) newIndex = currentIndex; // Stay at current if can't go up
            break;
          case 'ArrowDown':
            newIndex = currentIndex + galleryColumns;
            if (newIndex >= images.length) newIndex = currentIndex; // Stay at current if can't go down
            break;
          default:
            return;
        }
      } else {
        // List mode: up/down and left/right both navigate sequentially
        switch (key) {
          case 'ArrowLeft':
          case 'ArrowUp':
            newIndex = currentIndex <= 0 ? images.length - 1 : currentIndex - 1;
            break;
          case 'ArrowRight':
          case 'ArrowDown':
            newIndex = currentIndex >= images.length - 1 ? 0 : currentIndex + 1;
            break;
          default:
            return;
        }
      }

      // Handle nothing selected - start from first or last
      if (currentIndex === -1) {
        newIndex = (key === 'ArrowLeft' || key === 'ArrowUp') ? images.length - 1 : 0;
      }

      const newImageId = images[newIndex].imageId;

      if (e.shiftKey) {
        // Shift + arrow = right-click behavior (select and fly to)
        handleRightClick(newImageId);
      } else {
        // Arrow only = left-click behavior (just select)
        handleClick(newImageId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [images, selectedImageId, viewMode, galleryColumns, handleClick, handleRightClick]);

  if (!reconstruction) {
    return (
      <div className={emptyStateStyles.container}>
        Load COLMAP data to view images
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className={emptyStateStyles.container}>
        No images found
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-ds-secondary">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-1 py-1 pl-0.5 pr-1 bg-ds-tertiary">
        <div className={toolbarStyles.group}>
          <select
            value={cameraFilter}
            onChange={(e) => setCameraFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
            className={`${inputStyles.select} ${inputStyles.sizes.sm}`}
          >
            <option value="all">All Cameras ({cameras.length})</option>
            {cameras.map((cam) => (
              <option key={cam.cameraId} value={cam.cameraId}>
                Camera {cam.cameraId} ({cam.width}×{cam.height})
              </option>
            ))}
          </select>
        </div>
        <div className={`${toolbarStyles.group} flex-nowrap`}>
          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value as SortField)}
            className={`${inputStyles.select} ${inputStyles.sizes.sm}`}
          >
            <option value="name">Sort: Name</option>
            <option value="imageId">Sort: Image ID</option>
            <option value="avgError">Sort: Avg Error</option>
            <option value="covisibleCount">Sort: Covisible</option>
            <option value="numPoints3D">Sort: 3D Points</option>
            <option value="numPoints2D">Sort: 2D Points</option>
          </select>
          <button
            onClick={() => setSortDirection(d => d === 'asc' ? 'desc' : 'asc')}
            className={`${buttonStyles.base} ${buttonStyles.sizes.icon} ${buttonStyles.variants.toggle}`}
            {...getTooltipProps(sortDirection === 'asc' ? 'Ascending' : 'Descending', 'bottom')}
          >
            {sortDirection === 'asc' ? <SortAscIcon className="w-4 h-4" /> : <SortDescIcon className="w-4 h-4" />}
          </button>
        </div>
        <div className={`${toolbarStyles.group} ml-auto`}>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewMode('gallery')}
              className={getViewModeButtonClass(viewMode === 'gallery')}
              data-tooltip="Grid view (Shift+scroll to resize)"
            >
              <GridIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={getViewModeButtonClass(viewMode === 'list')}
              data-tooltip="List view with stats"
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
                      paddingBottom: GAP.gallery,
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
                        onRightClick={handleRightClick}
                        isScrolling={debouncedIsScrolling}
                        skipImages={imageLoadMode === 'skip'}
                        isSettling={isSettling}
                        isResizing={isResizing}
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
                      onRightClick={handleRightClick}
                      isScrolling={debouncedIsScrolling}
                      skipImages={imageLoadMode === 'skip'}
                      isSettling={isSettling}
                      isResizing={isResizing}
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
