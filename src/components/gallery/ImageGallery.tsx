import { useMemo, useState, useEffect, useRef, memo, startTransition, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useReconstructionStore, selectCameraCount, useUIStore, useCameraStore, useDeletionStore } from '../../store';
import { getImageFile, getUrlImageCached, fetchUrlImage, getZipImageCached, fetchZipImage, isZipLoadingAvailable } from '../../utils/imageFileUtils';
import { useThumbnail, pauseThumbnailCache, resumeThumbnailCache } from '../../hooks/useThumbnail';
import { prioritizeFrustumTexture } from '../../hooks/useFrustumTexture';
import { useLongPress } from '../../hooks/useLongPress';
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
  isMatched: boolean;
  isMarkedForDeletion: boolean;
  matchesColor: string;
  matchesBlink: boolean;
  onClick: (id: number) => void;
  onDoubleClick: (id: number) => void;
  onRightClick: (id: number) => void;
  isScrolling: boolean;
  skipImages: boolean;
  isSettling: boolean;
  isResizing: boolean;
  wouldGoBack: boolean;
  touchMode?: boolean;
}

const GalleryItem = memo(function GalleryItem({ img, isSelected, isMatched, isMarkedForDeletion, matchesColor, matchesBlink, onClick, onDoubleClick, onRightClick, isScrolling, skipImages, isSettling, isResizing, wouldGoBack, touchMode = false }: GalleryItemProps) {
  const multiCamera = useReconstructionStore(selectCameraCount) > 1;
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

  // Long-press support for touch mode (triggers context menu)
  const longPressHandlers = useLongPress({
    onLongPress: () => onRightClick(img.imageId),
    onClick: () => handleClick(),
  });

  // Determine border class and style based on selection/match state
  const borderClass = isSelected
    ? galleryStyles.itemSelected
    : isMatched
      ? `${matchesBlink ? 'matches-blink' : ''}`
      : galleryStyles.itemHover;
  const borderStyle = isMatched && !isSelected
    ? { borderColor: matchesColor }
    : {};

  return (
    <div
      className={`${galleryStyles.itemAspect} group ${galleryStyles.item} ${borderClass}`}
      style={{ position: 'relative', ...borderStyle }}
      onClick={touchMode ? undefined : handleClick}
      onContextMenu={(e) => { e.preventDefault(); onRightClick(img.imageId); }}
      onPointerOver={(e) => {
        if (touchMode) return;
        setHovered(true);
        setMousePos({ x: e.clientX, y: e.clientY });
        document.body.style.cursor = 'pointer';
      }}
      onPointerMove={(e) => {
        if (touchMode) return;
        if (hovered) setMousePos({ x: e.clientX, y: e.clientY });
      }}
      onPointerOut={() => {
        if (touchMode) return;
        setHovered(false);
        setMousePos(null);
        document.body.style.cursor = '';
      }}
      {...(touchMode ? longPressHandlers : {})}
    >
      {/* Inner wrapper clips image content without clipping tooltip */}
      <div className={galleryStyles.itemInner}>
        {src ? (
          <img
            src={src}
            alt={img.name}
            className={galleryStyles.itemImage}
            style={isMarkedForDeletion ? { filter: 'grayscale(100%) opacity(0.5)' } : undefined}
            draggable={false}
          />
        ) : (
          <div
            className={galleryStyles.placeholder}
            style={isMarkedForDeletion ? { opacity: 0.5 } : undefined}
          >
            {isScrolling ? '...' : img.name}
          </div>
        )}
        {/* Diagonal X overlay for deleted images */}
        {isMarkedForDeletion && (
          <div className="absolute inset-0 pointer-events-none z-20">
            <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <line x1="0" y1="0" x2="100" y2="100" stroke="var(--bg-primary)" strokeWidth="1.5" />
              <line x1="100" y1="0" x2="0" y2="100" stroke="var(--bg-primary)" strokeWidth="1.5" />
            </svg>
          </div>
        )}
        {/* Realistic lens vignette overlay - elliptical with smooth falloff (hidden when selected or deleted) */}
        {!isSelected && !isMarkedForDeletion && (
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
      {/* Hover card - rendered via portal to body (disabled in touch mode) */}
      {!touchMode && hovered && mousePos && createPortal(
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
            <div className={hoverCardStyles.subtitle}>{multiCamera ? `#${img.cameraId}:${img.imageId}` : `#${img.imageId}`}</div>
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
                {isMatched ? 'Right: matches' : wouldGoBack ? 'Right: back' : 'Right: fly to'}
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

const ListItem = memo(function ListItem({ img, isSelected, isMatched, isMarkedForDeletion, matchesColor, matchesBlink, onClick, onDoubleClick, onRightClick, isScrolling, skipImages, isSettling, isResizing, wouldGoBack, touchMode = false }: ListItemProps) {
  const multiCamera = useReconstructionStore(selectCameraCount) > 1;
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

  // Long-press support for touch mode (triggers context menu)
  const longPressHandlers = useLongPress({
    onLongPress: () => onRightClick(img.imageId),
    onClick: () => handleClick(),
  });

  // Determine border class and style based on selection/match state
  const borderClass = isSelected
    ? listStyles.itemSelected
    : isMatched
      ? `${matchesBlink ? 'matches-blink' : ''}`
      : listStyles.itemHover;
  const borderStyle = isMatched && !isSelected
    ? { borderColor: matchesColor }
    : {};

  return (
    <div
      onClick={touchMode ? undefined : handleClick}
      onContextMenu={(e) => { e.preventDefault(); onRightClick(img.imageId); }}
      onPointerOver={(e) => {
        if (touchMode) return;
        setHovered(true);
        setMousePos({ x: e.clientX, y: e.clientY });
        document.body.style.cursor = 'pointer';
      }}
      onPointerMove={(e) => {
        if (touchMode) return;
        if (hovered) setMousePos({ x: e.clientX, y: e.clientY });
      }}
      onPointerOut={() => {
        if (touchMode) return;
        setHovered(false);
        setMousePos(null);
        document.body.style.cursor = '';
      }}
      style={{ height: SIZE.listRowHeight, ...borderStyle }}
      className={`${listStyles.item} px-3 list-stats-container ${borderClass}`}
      {...(touchMode ? longPressHandlers : {})}
    >
      <div className={`${listStyles.thumbnail} ${listStyles.thumbnailSize} relative`}>
        {src ? (
          <img
            src={src}
            alt={img.name}
            className="w-full h-full object-cover"
            style={isMarkedForDeletion ? { filter: 'grayscale(100%) opacity(0.5)' } : undefined}
            draggable={false}
          />
        ) : (
          <div
            className={listStyles.thumbnailPlaceholder}
            style={isMarkedForDeletion ? { opacity: 0.5 } : undefined}
          >
            {img.imageId}
          </div>
        )}
        {/* Diagonal X overlay for deleted images */}
        {isMarkedForDeletion && (
          <div className="absolute inset-0 pointer-events-none">
            <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <line x1="0" y1="0" x2="100" y2="100" stroke="var(--bg-primary)" strokeWidth="2" />
              <line x1="100" y1="0" x2="0" y2="100" stroke="var(--bg-primary)" strokeWidth="2" />
            </svg>
          </div>
        )}
      </div>
      <div className={listStyles.content}>
        <div className={listStyles.title}>{img.name}</div>
        <div className={listStyles.subtitle}>{multiCamera ? `#${img.cameraId}:${img.imageId}` : `#${img.imageId}`} · {img.cameraWidth}×{img.cameraHeight}</div>
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
      {/* Hover card - simplified for list view (stats already visible in row, disabled in touch mode) */}
      {!touchMode && hovered && mousePos && createPortal(
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
                {isMatched ? 'Right: matches' : wouldGoBack ? 'Right: back' : 'Right: fly to'}
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
  const imageUrlBase = useReconstructionStore((s) => s.imageUrlBase);
  const openImageDetail = useUIStore((s) => s.openImageDetail);
  const setMatchedImageId = useUIStore((s) => s.setMatchedImageId);
  const setShowMatchesInModal = useUIStore((s) => s.setShowMatchesInModal);
  const showMatches = useUIStore((s) => s.showMatches);
  const matchesDisplayMode = useUIStore((s) => s.matchesDisplayMode);
  const matchesColor = useUIStore((s) => s.matchesColor);
  const touchMode = useUIStore((s) => s.touchMode);
  const pendingDeletions = useDeletionStore((s) => s.pendingDeletions);
  const selectedImageId = useCameraStore((s) => s.selectedImageId);
  const setSelectedImageId = useCameraStore((s) => s.setSelectedImageId);
  const flyToImage = useCameraStore((s) => s.flyToImage);
  const currentViewState = useCameraStore((s) => s.currentViewState);
  const pushNavigationHistory = useCameraStore((s) => s.pushNavigationHistory);
  const popNavigationHistory = useCameraStore((s) => s.popNavigationHistory);
  const peekNavigationHistory = useCameraStore((s) => s.peekNavigationHistory);
  const flyToState = useCameraStore((s) => s.flyToState);
  const navigationHistory = useCameraStore((s) => s.navigationHistory);
  const [viewMode, setViewMode] = useState<ViewMode>(touchMode ? 'list' : 'gallery');
  const [galleryColumns, setGalleryColumns] = useState<number>(COLUMNS.default);
  const [cameraFilter, setCameraFilter] = useState<number | 'all'>('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const containerRef = useRef<HTMLDivElement>(null);
  // Track URL/ZIP image cache version to trigger re-renders when images are fetched
  const [urlImageCacheVersion, setUrlImageCacheVersion] = useState(0);
  const [zipImageCacheVersion, setZipImageCacheVersion] = useState(0);

  // Compute matched image IDs when matches are shown (uses pre-computed connectedImagesIndex)
  const matchedImageIds = useMemo(() => {
    if (!reconstruction || selectedImageId === null || !showMatches) {
      return new Set<number>();
    }
    const connections = reconstruction.connectedImagesIndex.get(selectedImageId);
    if (!connections) {
      return new Set<number>();
    }
    return new Set(connections.keys());
  }, [reconstruction, selectedImageId, showMatches]);

  // Click handlers
  const handleClick = useCallback((imageId: number) => {
    setSelectedImageId(imageId);
  }, [setSelectedImageId]);

  const handleDoubleClick = useCallback((imageId: number) => {
    openImageDetail(imageId);
  }, [openImageDetail]);

  // Right-click selects and goes to image in 3D viewer (with navigation history tracking)
  const handleRightClick = useCallback((imageId: number) => {
    // Check if this is a matched camera (shares points with the selected camera)
    if (selectedImageId !== null && matchedImageIds.has(imageId)) {
      // Open image detail for the selected camera with this as the matched image
      setShowMatchesInModal(true);
      setMatchedImageId(imageId);
      openImageDetail(selectedImageId);
      // Need to set matchedImageId after openImageDetail since it resets it
      setTimeout(() => setMatchedImageId(imageId), 0);
      return;
    }

    const lastEntry = peekNavigationHistory();

    // Check if we're clicking the same image we just flew to (trace back)
    if (currentViewState && lastEntry && lastEntry.toImageId === imageId) {
      // User wants to go back - pop and return
      const entry = popNavigationHistory();
      if (entry) {
        flyToState(entry.fromState);
        setSelectedImageId(entry.fromImageId);
      }
      return;
    }

    // Prioritize texture loading if image is already cached (consistent with frustum context menu)
    if (reconstruction) {
      const image = reconstruction.images.get(imageId);
      if (image) {
        let cachedFile: File | undefined;
        if (imageUrlBase) {
          cachedFile = getUrlImageCached(image.name);
        } else if (isZipLoadingAvailable()) {
          cachedFile = getZipImageCached(image.name) ?? undefined;
        } else {
          cachedFile = getImageFile(loadedFiles?.imageFiles, image.name);
        }
        if (cachedFile) {
          prioritizeFrustumTexture(cachedFile, image.name);
        }
      }
    }

    // Push current state to history and fly to the image
    if (currentViewState) {
      pushNavigationHistory({
        fromState: currentViewState,
        fromImageId: selectedImageId,
        toImageId: imageId,
      });
    }
    setSelectedImageId(imageId);
    flyToImage(imageId);
  }, [setSelectedImageId, flyToImage, currentViewState, peekNavigationHistory, popNavigationHistory, pushNavigationHistory, flyToState, selectedImageId, matchedImageIds, setShowMatchesInModal, setMatchedImageId, openImageDetail, reconstruction, imageUrlBase, loadedFiles]);

  // Get the last navigation target for "back" hint display
  const lastNavigationToImageId = useMemo(() => {
    if (navigationHistory.length === 0) return null;
    return navigationHistory[navigationHistory.length - 1].toImageId;
  }, [navigationHistory]);

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

        // Get image file - use URL cache if in URL mode, ZIP cache if ZIP mode, otherwise local files
        let file: File | undefined;
        if (imageUrlBase) {
          // URL mode: check cache first (sync)
          file = getUrlImageCached(img.name);
        } else if (isZipLoadingAvailable()) {
          // ZIP mode: check ZIP cache (sync)
          file = getZipImageCached(img.name) ?? undefined;
        } else {
          // Local mode: use local file lookup
          file = getImageFile(imageFiles, img.name);
        }

        return {
          imageId: img.imageId,
          name: img.name,
          file,
          numPoints2D: img.numPoints2D ?? img.points2D.length,
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
  }, [reconstruction, imageFiles, imageUrlBase, cameraFilter, sortField, sortDirection, urlImageCacheVersion, zipImageCacheVersion]);

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

  // Fetch visible images from URL when in URL mode
  useEffect(() => {
    if (!imageUrlBase || !reconstruction || debouncedIsScrolling || isSettling) return;

    // Get visible rows from virtualizer
    const visibleItems = viewMode === 'gallery'
      ? rowVirtualizer.getVirtualItems()
      : listVirtualizer.getVirtualItems();

    // Collect image names that need fetching
    const toFetch: string[] = [];
    for (const virtualItem of visibleItems) {
      const rowImages = viewMode === 'gallery'
        ? rows[virtualItem.index] || []
        : [images[virtualItem.index]].filter(Boolean);

      for (const img of rowImages) {
        if (img && !getUrlImageCached(img.name)) {
          toFetch.push(img.name);
        }
      }
    }

    if (toFetch.length === 0) return;

    // Fetch images in parallel (limit concurrency)
    let cancelled = false;
    const fetchBatch = async () => {
      const BATCH_SIZE = 5;
      for (let i = 0; i < toFetch.length && !cancelled; i += BATCH_SIZE) {
        const batch = toFetch.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map(name => fetchUrlImage(imageUrlBase, name))
        );
        // Trigger re-render if any images were fetched
        if (!cancelled && results.some(f => f !== null)) {
          setUrlImageCacheVersion(v => v + 1);
        }
      }
    };

    fetchBatch();

    return () => {
      cancelled = true;
    };
  }, [imageUrlBase, reconstruction, viewMode, rows, images, debouncedIsScrolling, isSettling, rowVirtualizer, listVirtualizer]);

  // Fetch visible images from ZIP when in ZIP mode
  useEffect(() => {
    if (imageUrlBase || !isZipLoadingAvailable() || !reconstruction || debouncedIsScrolling || isSettling) return;

    // Get visible rows from virtualizer
    const visibleItems = viewMode === 'gallery'
      ? rowVirtualizer.getVirtualItems()
      : listVirtualizer.getVirtualItems();

    // Collect image names that need fetching
    const toFetch: string[] = [];
    for (const virtualItem of visibleItems) {
      const rowImages = viewMode === 'gallery'
        ? rows[virtualItem.index] || []
        : [images[virtualItem.index]].filter(Boolean);

      for (const img of rowImages) {
        if (img && !getZipImageCached(img.name)) {
          toFetch.push(img.name);
        }
      }
    }

    if (toFetch.length === 0) return;

    // Fetch images in parallel (limit concurrency)
    let cancelled = false;
    const fetchBatch = async () => {
      const BATCH_SIZE = 5;
      for (let i = 0; i < toFetch.length && !cancelled; i += BATCH_SIZE) {
        const batch = toFetch.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map(name => fetchZipImage(name))
        );
        // Trigger re-render if any images were fetched
        if (!cancelled && results.some(f => f !== null)) {
          setZipImageCacheVersion(v => v + 1);
        }
      }
    };

    fetchBatch();

    return () => {
      cancelled = true;
    };
  }, [imageUrlBase, reconstruction, viewMode, rows, images, debouncedIsScrolling, isSettling, rowVirtualizer, listVirtualizer]);

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
        {!touchMode && (
          <div className={`${toolbarStyles.group} ml-auto`}>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setViewMode('gallery')}
                className={getViewModeButtonClass(viewMode === 'gallery')}
                data-tooltip="Grid view (Shift+{SCROLL} to resize)"
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
        )}
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
                        isMatched={matchedImageIds.has(img.imageId)}
                        isMarkedForDeletion={pendingDeletions.has(img.imageId)}
                        matchesColor={matchesColor}
                        matchesBlink={showMatches && matchesDisplayMode === 'blink'}
                        onClick={handleClick}
                        onDoubleClick={handleDoubleClick}
                        onRightClick={handleRightClick}
                        isScrolling={debouncedIsScrolling}
                        skipImages={false}
                        isSettling={isSettling}
                        isResizing={isResizing}
                        wouldGoBack={img.imageId === lastNavigationToImageId}
                        touchMode={touchMode}
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
                      isMatched={matchedImageIds.has(img.imageId)}
                      isMarkedForDeletion={pendingDeletions.has(img.imageId)}
                      matchesColor={matchesColor}
                      matchesBlink={showMatches && matchesDisplayMode === 'blink'}
                      onClick={handleClick}
                      onDoubleClick={handleDoubleClick}
                      onRightClick={handleRightClick}
                      isScrolling={debouncedIsScrolling}
                      skipImages={false}
                      isSettling={isSettling}
                      isResizing={isResizing}
                      wouldGoBack={img.imageId === lastNavigationToImageId}
                      touchMode={touchMode}
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
