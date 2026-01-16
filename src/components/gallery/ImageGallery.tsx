import { useMemo, useState, useEffect, useRef, memo, startTransition, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useReconstructionStore, useUIStore, useCameraStore } from '../../store';
import { getImageFile } from '../../utils/imageFileUtils';
import { useThumbnail, pauseThumbnailCache, resumeThumbnailCache } from '../../hooks/useThumbnail';
import { COLUMNS, GAP, SIZE, TIMING, SPACING, buttonStyles, getTooltipProps, galleryStyles, listStyles, inputStyles, emptyStateStyles, toolbarStyles, contextMenuStyles } from '../../theme';

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
  onContextMenu: (id: number, e: React.MouseEvent) => void;
  isScrolling: boolean;
  skipImages: boolean;
  isSettling: boolean;
}

const GalleryItem = memo(function GalleryItem({ img, isSelected, onClick, onDoubleClick, onContextMenu, isScrolling, skipImages, isSettling }: GalleryItemProps) {
  // Load thumbnail lazily when visible and not scrolling/settling (disabled in skip mode)
  const src = useThumbnail(img.file, img.name, !isScrolling && !skipImages && !isSettling);

  return (
    <div
      className={`${galleryStyles.itemAspect} group ${galleryStyles.item} ${isSelected ? galleryStyles.itemSelected : galleryStyles.itemHover}`}
      style={{ position: 'relative' }}
      onClick={() => onClick(img.imageId)}
      onDoubleClick={() => onDoubleClick(img.imageId)}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(img.imageId, e); }}
      {...getTooltipProps(`ID: ${img.imageId} · Double-click for info`, 'bottom')}
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
        {/* Circular vignette overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(circle at center, transparent 50%, rgba(0,0,0,0.7) 100%)' }}
        />
      </div>
      {/* Info button - shows on hover */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDoubleClick(img.imageId);
        }}
        style={{ position: 'absolute', top: SPACING.md, right: SPACING.md, left: 'auto' }}
        className={galleryStyles.itemInfoButton}
        data-tooltip="View details"
        data-tooltip-pos="left"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
        </svg>
      </button>
      {/* Image name overlay */}
      <div className={galleryStyles.overlay}>
        <div className={galleryStyles.overlayText}>{img.name}</div>
      </div>
    </div>
  );
});

type ListItemProps = GalleryItemProps;

const ListItem = memo(function ListItem({ img, isSelected, onClick, onDoubleClick, onContextMenu, isScrolling, skipImages, isSettling }: ListItemProps) {
  // Load thumbnail lazily when visible and not scrolling/settling (disabled in skip mode)
  const src = useThumbnail(img.file, img.name, !isScrolling && !skipImages && !isSettling);

  return (
    <div
      onClick={() => onClick(img.imageId)}
      onDoubleClick={() => onDoubleClick(img.imageId)}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(img.imageId, e); }}
      style={{ height: SIZE.listRowHeight }}
      className={`${listStyles.item} px-3 ${isSelected ? listStyles.itemSelected : listStyles.itemHover}`}
      {...getTooltipProps('Double-click for info', 'bottom')}
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

// Context menu for gallery/list right-click
interface GalleryContextMenuProps {
  x: number;
  y: number;
  onSelect: () => void;
  onGoto: () => void;
  onInfo: () => void;
  onClose: () => void;
}

function GalleryContextMenu({ x, y, onSelect, onGoto, onInfo, onClose }: GalleryContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Close on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className={`${contextMenuStyles.container} fixed z-50`}
      style={{ left: x, top: y }}
    >
      <button className={contextMenuStyles.button} onClick={onSelect}>
        <svg className={contextMenuStyles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <circle cx="12" cy="12" r="3" fill="currentColor"/>
        </svg>
        Select
      </button>
      <button className={contextMenuStyles.button} onClick={onGoto}>
        <svg className={contextMenuStyles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
        Go to
      </button>
      <button className={contextMenuStyles.button} onClick={onInfo}>
        <svg className={contextMenuStyles.icon} viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="2.5"/>
          <rect x="9.5" y="10" width="5" height="12" rx="1"/>
        </svg>
        Info
      </button>
    </div>
  );
}

// Context menu state type
interface ContextMenuState {
  imageId: number;
  x: number;
  y: number;
}

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
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Click handlers
  const handleClick = useCallback((imageId: number) => {
    setSelectedImageId(imageId);
    setContextMenu(null);
  }, [setSelectedImageId]);

  const handleDoubleClick = useCallback((imageId: number) => {
    openImageDetail(imageId);
    setContextMenu(null);
  }, [openImageDetail]);

  const handleContextMenu = useCallback((imageId: number, e: React.MouseEvent) => {
    setContextMenu({
      imageId,
      x: e.clientX,
      y: e.clientY,
    });
  }, []);

  // Context menu action handlers
  const handleContextMenuSelect = useCallback(() => {
    if (contextMenu) {
      setSelectedImageId(contextMenu.imageId);
      setContextMenu(null);
    }
  }, [contextMenu, setSelectedImageId]);

  const handleContextMenuGoto = useCallback(() => {
    if (contextMenu) {
      flyToImage(contextMenu.imageId);
      setContextMenu(null);
    }
  }, [contextMenu, flyToImage]);

  const handleContextMenuInfo = useCallback(() => {
    if (contextMenu) {
      openImageDetail(contextMenu.imageId);
      setContextMenu(null);
    }
  }, [contextMenu, openImageDetail]);

  const handleContextMenuClose = useCallback(() => {
    setContextMenu(null);
  }, []);

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
      <div className="flex items-center justify-between gap-2 p-2 bg-ds-tertiary">
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
        <div className={toolbarStyles.group}>
          {viewMode === 'gallery' && <span className="text-ds-muted text-sm">Shift+Scroll to zoom</span>}
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
                        onContextMenu={handleContextMenu}
                        isScrolling={debouncedIsScrolling}
                        skipImages={imageLoadMode === 'skip'}
                        isSettling={isSettling}
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
                      isScrolling={debouncedIsScrolling}
                      skipImages={imageLoadMode === 'skip'}
                      isSettling={isSettling}
                    />
                  </div>
                );
              })}
            </div>
          )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <GalleryContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onSelect={handleContextMenuSelect}
          onGoto={handleContextMenuGoto}
          onInfo={handleContextMenuInfo}
          onClose={handleContextMenuClose}
        />
      )}
    </div>
  );
}
