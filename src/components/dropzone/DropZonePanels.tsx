import { ThemeSelect } from '../ui/ThemeSelect';
import { useId, useState } from 'react';
import {
  emptyStateStyles,
  floatingPanelStyles,
  panelStyles,
} from '../../theme';
import {
  CloseIcon,
  InfoIcon,
  PlusIcon,
  FileJsonIcon,
  LinkIcon,
  ResetIcon,
  UploadIcon,
} from '../../icons';
import { publicAsset } from '../../utils/paths';
import { ProfileDropdown } from './ProfileDropdown';
import { LoadJsonHoverCard, LoadUrlHoverCard, ToyHoverCard } from './DropZoneHoverCards';
import {
  DROP_ZONE_ACTION_LABELS,
  DROP_ZONE_BROWSE_BOX_CLASS,
  DROP_ZONE_BROWSE_LABEL,
  DROP_ZONE_DESKTOP_ACTION_BUTTON_ICON_CLASS,
  DROP_ZONE_DESKTOP_MESSAGE,
  DROP_ZONE_DESKTOP_OVERLAY_CLASS,
  DROP_ZONE_DESKTOP_TITLE,
  DROP_ZONE_DISMISS_TOOLTIP,
  DROP_ZONE_ICON_BUTTON_CLASS,
  DROP_ZONE_INFO_LINES,
  DROP_ZONE_RESET_CONFIG_TOOLTIP,
  DROP_ZONE_TOUCH_ACTION_ICON_CLASS,
  DROP_ZONE_TOUCH_CLOSE_BUTTON_CLASS,
  DROP_ZONE_TOUCH_FOOTER,
  DROP_ZONE_TOUCH_OVERLAY_CLASS,
  DROP_ZONE_TOUCH_SUBTITLE,
  DROP_ZONE_TOUCH_TITLE,
  DROP_ZONE_UPLOAD_CONFIG_TOOLTIP,
  getDesktopDropZoneActionButtonClass,
  getDropZoneInfoLineClass,
  getDropZonePanelOverlayStyle,
  getTouchDropZoneToyButtonClass,
  getTouchDropZoneUrlButtonClass,
  type HoveredDropZoneButton,
} from './dropZonePanelViewModel';

export interface DesktopDropZonePanelProps {
  urlLoading: boolean;
  onOpenUrlModal: () => void;
  onOpenManifestFile: () => void;
  onLoadToy: () => void;
  onBrowse: () => void;
  onUploadConfig: () => void;
  onResetConfig: () => void;
  onDismiss: () => void;
  onOpenExampleDataset: () => void;
  onDownloadExampleManifest: () => void;
}

export interface TouchDropZonePanelProps {
  urlLoading: boolean;
  onOpenUrlModal: () => void;
  onLoadToy: () => void;
  onDismiss: () => void;
}

export function DesktopDropZonePanel({
  urlLoading,
  onOpenUrlModal,
  onOpenManifestFile,
  onLoadToy,
  onBrowse,
  onUploadConfig,
  onResetConfig,
  onDismiss,
  onOpenExampleDataset,
  onDownloadExampleManifest,
}: DesktopDropZonePanelProps) {
  const [hoveredButton, setHoveredButton] = useState<HoveredDropZoneButton>(null);
  const [showFormatInfo, setShowFormatInfo] = useState(false);
  const formatInfoId = useId();

  return (
    <div className={DROP_ZONE_DESKTOP_OVERLAY_CLASS} style={getDropZonePanelOverlayStyle()}>
      <div className={`${floatingPanelStyles.dialog} startup-panel w-full max-w-[520px]`}>
        <div className="startup-header">
          <div
            className="startup-format-info"
            onMouseLeave={() => setShowFormatInfo(false)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setShowFormatInfo(false);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setShowFormatInfo(false);
                event.stopPropagation();
              }
            }}
          >
            <h2 className={panelStyles.startupTitle}>{DROP_ZONE_DESKTOP_TITLE}</h2>
            <button
              type="button"
              className={DROP_ZONE_ICON_BUTTON_CLASS}
              aria-label="Supported files and folder structure"
              aria-describedby={showFormatInfo ? formatInfoId : undefined}
              onMouseEnter={() => setShowFormatInfo(true)}
              onFocus={() => setShowFormatInfo(true)}
              onClick={() => setShowFormatInfo(true)}
            >
              <InfoIcon className="w-4 h-4" />
            </button>
            {showFormatInfo && (
              <div className="startup-format-popover">
                <div id={formatInfoId} role="tooltip" className={`${floatingPanelStyles.surface} startup-format-content`}>
                  {DROP_ZONE_INFO_LINES.map((line) => (
                    <div key={`${line.label ?? ''}${line.text}`} className={getDropZoneInfoLineClass(false)}>
                      {line.label && <strong>{line.label}</strong>}
                      {line.label ? ` ${line.text}` : line.text}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="startup-config-actions">
            <ProfileDropdown />
            <ThemeSelect />
            <div className="w-px h-5 bg-ds-muted/30 mx-1" />
            <button
              type="button"
              className={DROP_ZONE_ICON_BUTTON_CLASS}
              onClick={onUploadConfig}
              data-tooltip={DROP_ZONE_UPLOAD_CONFIG_TOOLTIP}
              aria-label={DROP_ZONE_UPLOAD_CONFIG_TOOLTIP}
            >
              <UploadIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              className={DROP_ZONE_ICON_BUTTON_CLASS}
              onClick={onResetConfig}
              data-tooltip={DROP_ZONE_RESET_CONFIG_TOOLTIP}
              aria-label={DROP_ZONE_RESET_CONFIG_TOOLTIP}
            >
              <ResetIcon className="w-4 h-4" />
            </button>
          </div>
          <button
            type="button"
            className={DROP_ZONE_ICON_BUTTON_CLASS}
            onClick={onDismiss}
            data-tooltip={DROP_ZONE_DISMISS_TOOLTIP}
            aria-label={DROP_ZONE_DISMISS_TOOLTIP}
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col items-center">
          <button
            type="button"
            className={DROP_ZONE_BROWSE_BOX_CLASS}
            style={{ minHeight: 112 }}
            onClick={onBrowse}
            aria-label={DROP_ZONE_BROWSE_LABEL}
          >
            <PlusIcon className="w-6 h-6" />
            <span className="text-sm font-medium">Browse folder</span>
            <span className="text-ds-secondary text-xs text-center px-4">
              {DROP_ZONE_DESKTOP_MESSAGE}
            </span>
          </button>

          <div className="startup-actions" onKeyDown={(event) => {
            if (event.key === 'Escape' && hoveredButton !== null) {
              setHoveredButton(null);
              event.stopPropagation();
            }
          }}>
            <div className="relative">
              <button
                type="button"
                onClick={onOpenUrlModal}
                onMouseEnter={() => setHoveredButton('url')}
                onFocus={() => setHoveredButton('url')}
                onBlur={() => setHoveredButton(null)}
                onMouseLeave={() => setHoveredButton(null)}
                disabled={urlLoading}
                className={getDesktopDropZoneActionButtonClass(urlLoading)}
              >
                <LinkIcon className={DROP_ZONE_DESKTOP_ACTION_BUTTON_ICON_CLASS} />
                {DROP_ZONE_ACTION_LABELS.loadUrl}
              </button>
              {hoveredButton === 'url' && <LoadUrlHoverCard />}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={onOpenManifestFile}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onDownloadExampleManifest();
                }}
                onMouseEnter={() => setHoveredButton('json')}
                onFocus={() => setHoveredButton('json')}
                onBlur={() => setHoveredButton(null)}
                onMouseLeave={() => setHoveredButton(null)}
                disabled={urlLoading}
                className={getDesktopDropZoneActionButtonClass(urlLoading)}
              >
                <FileJsonIcon className={DROP_ZONE_DESKTOP_ACTION_BUTTON_ICON_CLASS} />
                {DROP_ZONE_ACTION_LABELS.loadJson}
              </button>
              {hoveredButton === 'json' && <LoadJsonHoverCard />}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={onLoadToy}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onOpenExampleDataset();
                }}
                onMouseEnter={() => setHoveredButton('toy')}
                onFocus={() => setHoveredButton('toy')}
                onBlur={() => setHoveredButton(null)}
                onMouseLeave={() => setHoveredButton(null)}
                disabled={urlLoading}
                className={getDesktopDropZoneActionButtonClass(urlLoading)}
              >
                <img src={publicAsset('LOGO.png')} alt="" className={DROP_ZONE_DESKTOP_ACTION_BUTTON_ICON_CLASS} />
                {DROP_ZONE_ACTION_LABELS.tryToy}
              </button>
              {hoveredButton === 'toy' && <ToyHoverCard />}
            </div>
          </div>


        </div>
      </div>
    </div>
  );
}

export function TouchDropZonePanel({
  urlLoading,
  onOpenUrlModal,
  onLoadToy,
  onDismiss,
}: TouchDropZonePanelProps) {
  return (
    <div className={DROP_ZONE_TOUCH_OVERLAY_CLASS} style={getDropZonePanelOverlayStyle()}>
      <div className={`${floatingPanelStyles.dialog} startup-panel-touch p-4 w-full max-w-xs`}>
        <div className="flex items-center justify-between mb-4">
          <ThemeSelect />
          <button
            type="button"
            className={DROP_ZONE_TOUCH_CLOSE_BUTTON_CLASS}
            onClick={onDismiss}
            aria-label={DROP_ZONE_ACTION_LABELS.dismiss}
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col items-center mb-4">
          <img
            src={publicAsset('LOGO.png')}
            alt="ColmapView"
            className="w-12 h-12 mb-2"
          />
          <h2 className={emptyStateStyles.title}>{DROP_ZONE_TOUCH_TITLE}</h2>
          <p className="text-ds-secondary text-xs text-center mt-1">
            {DROP_ZONE_TOUCH_SUBTITLE}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onOpenUrlModal}
            disabled={urlLoading}
            className={getTouchDropZoneUrlButtonClass(urlLoading)}
          >
            <LinkIcon className={DROP_ZONE_TOUCH_ACTION_ICON_CLASS} />
            {DROP_ZONE_ACTION_LABELS.loadFromUrl}
          </button>

          <button
            type="button"
            onClick={onLoadToy}
            disabled={urlLoading}
            className={getTouchDropZoneToyButtonClass(urlLoading)}
          >
            <img src={publicAsset('LOGO.png')} alt="" className={DROP_ZONE_TOUCH_ACTION_ICON_CLASS} />
            {DROP_ZONE_ACTION_LABELS.tryToy}
          </button>
        </div>

        <p className="text-ds-muted text-xs text-center mt-4">
          {DROP_ZONE_TOUCH_FOOTER}
        </p>
      </div>
    </div>
  );
}
