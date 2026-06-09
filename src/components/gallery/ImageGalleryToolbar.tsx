import { GalleryGridIcon, GalleryListIcon, SortAscIcon, SortDescIcon } from '../../icons';
import {
  buttonStyles,
  getTooltipProps,
  inputStyles,
} from '../../theme';
import type {
  CameraFilter,
  GalleryBorderColorMode,
  GalleryThumbnailDisplayMode,
  SortDirection,
  SortField,
  ViewMode,
} from './useImageGalleryViewModel';
import {
  GALLERY_BORDER_COLOR_OPTIONS,
  GALLERY_THUMBNAIL_DISPLAY_OPTIONS,
  getGalleryCameraFilterValue,
  getGalleryBorderColorModeValue,
  getGallerySortFieldOptions,
  getGallerySortFieldValue,
  getGalleryThumbnailDisplayModeValue,
} from './imageGalleryToolbarViewModel';

type GalleryToolbarCamera = {
  cameraId: number;
  width: number;
  height: number;
};

interface ImageGalleryToolbarProps {
  cameraFilter: CameraFilter;
  borderColorMode: GalleryBorderColorMode;
  cameras: GalleryToolbarCamera[];
  hasMasks: boolean;
  sortDirection: SortDirection;
  sortField: SortField;
  showSplatMetricSort: boolean;
  thumbnailDisplayMode: GalleryThumbnailDisplayMode;
  touchMode: boolean;
  viewMode: ViewMode;
  onCameraFilterChange: (cameraFilter: CameraFilter) => void;
  onBorderColorModeChange: (borderColorMode: GalleryBorderColorMode) => void;
  onSortDirectionToggle: () => void;
  onSortFieldChange: (sortField: SortField) => void;
  onThumbnailDisplayModeChange: (thumbnailDisplayMode: GalleryThumbnailDisplayMode) => void;
  onViewModeChange: (viewMode: ViewMode) => void;
}

function getViewModeButtonClass(isActive: boolean): string {
  const base = `${buttonStyles.base} ${buttonStyles.sizes.icon}`;
  return isActive
    ? `${base} ${buttonStyles.variants.toggleActive}`
    : `${base} ${buttonStyles.variants.toggle}`;
}

export function ImageGalleryToolbar({
  cameraFilter,
  borderColorMode,
  cameras,
  hasMasks,
  sortDirection,
  sortField,
  showSplatMetricSort,
  thumbnailDisplayMode,
  touchMode,
  viewMode,
  onCameraFilterChange,
  onBorderColorModeChange,
  onSortDirectionToggle,
  onSortFieldChange,
  onThumbnailDisplayModeChange,
  onViewModeChange,
}: ImageGalleryToolbarProps) {
  const sortFieldOptions = getGallerySortFieldOptions(showSplatMetricSort);
  const toolbarSelectClass = `${inputStyles.select} ${inputStyles.sizes.sm} image-gallery-toolbar__select`;

  return (
    <div
      className={`image-gallery-toolbar ${touchMode ? 'image-gallery-toolbar--touch' : ''} h-auto py-1 pl-0.5 pr-1 bg-ds-tertiary`}
      data-testid="image-gallery-toolbar"
    >
      <select
        aria-label="Camera filter"
        value={cameraFilter}
        onChange={(e) => {
          const nextCameraFilter = getGalleryCameraFilterValue(e.target.value, cameras);
          if (nextCameraFilter !== null) {
            onCameraFilterChange(nextCameraFilter);
          }
        }}
        className={`${toolbarSelectClass} image-gallery-toolbar__camera`}
      >
        <option value="all">All Cams ({cameras.length})</option>
        {cameras.map((cam) => (
          <option key={cam.cameraId} value={cam.cameraId}>
            Cam {cam.cameraId} ({cam.width}&times;{cam.height})
          </option>
        ))}
      </select>
      <div className="image-gallery-toolbar__sort-group">
        <select
          aria-label="Sort field"
          value={sortField}
          onChange={(e) => {
            const nextSortField = getGallerySortFieldValue(e.target.value, showSplatMetricSort);
            if (nextSortField !== null) {
              onSortFieldChange(nextSortField);
            }
          }}
          className={`${toolbarSelectClass} image-gallery-toolbar__sort`}
        >
          {sortFieldOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          aria-label="Toggle sort direction"
          onClick={onSortDirectionToggle}
          className={`${buttonStyles.base} ${buttonStyles.sizes.icon} ${buttonStyles.variants.toggle} image-gallery-toolbar__direction`}
          {...getTooltipProps(sortDirection === 'asc' ? 'Ascending' : 'Descending', 'bottom')}
        >
          {sortDirection === 'asc' ? <SortAscIcon className="w-4 h-4" /> : <SortDescIcon className="w-4 h-4" />}
        </button>
      </div>
      <select
        aria-label="Border color"
        value={borderColorMode}
        onChange={(e) => {
          const nextBorderColorMode = getGalleryBorderColorModeValue(e.target.value);
          if (nextBorderColorMode !== null) {
            onBorderColorModeChange(nextBorderColorMode);
          }
        }}
        className={`${toolbarSelectClass} image-gallery-toolbar__border`}
      >
        {GALLERY_BORDER_COLOR_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Thumbnail display"
        value={thumbnailDisplayMode}
        onChange={(e) => {
          const nextThumbnailDisplayMode = getGalleryThumbnailDisplayModeValue(e.target.value);
          if (nextThumbnailDisplayMode !== null) {
            onThumbnailDisplayModeChange(nextThumbnailDisplayMode);
          }
        }}
        className={`${toolbarSelectClass} image-gallery-toolbar__display`}
      >
        {GALLERY_THUMBNAIL_DISPLAY_OPTIONS.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={!hasMasks && option.value !== 'image'}
          >
            {option.label}
          </option>
        ))}
      </select>
      {!touchMode && (
        <div className="image-gallery-toolbar__view flex items-center gap-1">
          <button
            aria-label="Grid view"
            onClick={() => onViewModeChange('gallery')}
            className={getViewModeButtonClass(viewMode === 'gallery')}
            data-tooltip="Grid view (Shift+{SCROLL} to resize)"
          >
            <GalleryGridIcon className="w-4 h-4" />
          </button>
          <button
            aria-label="List view"
            onClick={() => onViewModeChange('list')}
            className={getViewModeButtonClass(viewMode === 'list')}
            data-tooltip="List view with stats"
          >
            <GalleryListIcon className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
