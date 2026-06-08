import { GalleryGridIcon, GalleryListIcon, SortAscIcon, SortDescIcon } from '../../icons';
import {
  buttonStyles,
  getTooltipProps,
  inputStyles,
  toolbarStyles,
} from '../../theme';
import type {
  CameraFilter,
  GalleryBorderColorMode,
  SortDirection,
  SortField,
  ViewMode,
} from './useImageGalleryViewModel';
import {
  GALLERY_BORDER_COLOR_OPTIONS,
  getGalleryCameraFilterValue,
  getGalleryBorderColorModeValue,
  getGallerySortFieldOptions,
  getGallerySortFieldValue,
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
  sortDirection: SortDirection;
  sortField: SortField;
  showSplatMetricSort: boolean;
  touchMode: boolean;
  viewMode: ViewMode;
  onCameraFilterChange: (cameraFilter: CameraFilter) => void;
  onBorderColorModeChange: (borderColorMode: GalleryBorderColorMode) => void;
  onSortDirectionToggle: () => void;
  onSortFieldChange: (sortField: SortField) => void;
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
  sortDirection,
  sortField,
  showSplatMetricSort,
  touchMode,
  viewMode,
  onCameraFilterChange,
  onBorderColorModeChange,
  onSortDirectionToggle,
  onSortFieldChange,
  onViewModeChange,
}: ImageGalleryToolbarProps) {
  const sortFieldOptions = getGallerySortFieldOptions(showSplatMetricSort);

  return (
    <div
      className="flex h-full flex-nowrap items-center justify-between gap-1 py-1 pl-0.5 pr-1 bg-ds-tertiary"
      data-testid="image-gallery-toolbar"
    >
      <div className={`${toolbarStyles.group} min-w-0`}>
        <select
          aria-label="Camera filter"
          value={cameraFilter}
          onChange={(e) => {
            const nextCameraFilter = getGalleryCameraFilterValue(e.target.value, cameras);
            if (nextCameraFilter !== null) {
              onCameraFilterChange(nextCameraFilter);
            }
          }}
          className={`${inputStyles.select} ${inputStyles.sizes.sm}`}
        >
          <option value="all">All Cams ({cameras.length})</option>
          {cameras.map((cam) => (
            <option key={cam.cameraId} value={cam.cameraId}>
              Cam {cam.cameraId} ({cam.width}&times;{cam.height})
            </option>
          ))}
        </select>
      </div>
      <div className={`${toolbarStyles.group} flex-nowrap`}>
        <select
          aria-label="Sort field"
          value={sortField}
          onChange={(e) => {
            const nextSortField = getGallerySortFieldValue(e.target.value, showSplatMetricSort);
            if (nextSortField !== null) {
              onSortFieldChange(nextSortField);
            }
          }}
          className={`${inputStyles.select} ${inputStyles.sizes.sm}`}
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
          className={`${buttonStyles.base} ${buttonStyles.sizes.icon} ${buttonStyles.variants.toggle}`}
          {...getTooltipProps(sortDirection === 'asc' ? 'Ascending' : 'Descending', 'bottom')}
        >
          {sortDirection === 'asc' ? <SortAscIcon className="w-4 h-4" /> : <SortDescIcon className="w-4 h-4" />}
        </button>
        <select
          aria-label="Border color"
          value={borderColorMode}
          onChange={(e) => {
            const nextBorderColorMode = getGalleryBorderColorModeValue(e.target.value);
            if (nextBorderColorMode !== null) {
              onBorderColorModeChange(nextBorderColorMode);
            }
          }}
          className={`${inputStyles.select} ${inputStyles.sizes.sm}`}
        >
          {GALLERY_BORDER_COLOR_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {!touchMode && (
        <div className={`${toolbarStyles.group} ml-auto`}>
          <div className="flex items-center gap-1">
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
        </div>
      )}
    </div>
  );
}
