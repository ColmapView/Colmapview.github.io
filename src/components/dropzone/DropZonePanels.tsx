import { useState } from 'react';
import {
  emptyStateStyles,
} from '../../theme';
import {
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
  getDropZoneBrowseIconStyle,
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

  return (
    <div className={DROP_ZONE_DESKTOP_OVERLAY_CLASS} style={getDropZonePanelOverlayStyle()}>
      <div className="flex flex-col bg-ds-secondary rounded-lg border border-ds p-6 min-w-[420px]">
        <div className="flex justify-between -mt-4 -mx-4 mb-6">
          <div className="flex items-center gap-1">
            <ProfileDropdown />
            <div className="w-px h-5 bg-ds-muted/30 mx-1" />
            <button
              type="button"
              className={DROP_ZONE_ICON_BUTTON_CLASS}
              onClick={onUploadConfig}
              data-tooltip={DROP_ZONE_UPLOAD_CONFIG_TOOLTIP}
            >
              <UploadIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              className={DROP_ZONE_ICON_BUTTON_CLASS}
              onClick={onResetConfig}
              data-tooltip={DROP_ZONE_RESET_CONFIG_TOOLTIP}
            >
              <ResetIcon className="w-4 h-4" />
            </button>
          </div>
          <button
            type="button"
            className={DROP_ZONE_ICON_BUTTON_CLASS}
            onClick={onDismiss}
            data-tooltip={DROP_ZONE_DISMISS_TOOLTIP}
          >
            ×
          </button>
        </div>

        <div className="flex flex-col items-center">
          <div
            className={DROP_ZONE_BROWSE_BOX_CLASS}
            onClick={onBrowse}
          >
            <span className="text-ds-muted font-light leading-none" style={getDropZoneBrowseIconStyle()}>+</span>
          </div>
          <h2 className={emptyStateStyles.title}>{DROP_ZONE_DESKTOP_TITLE}</h2>
          <p className={emptyStateStyles.message}>
            {DROP_ZONE_DESKTOP_MESSAGE.split('\n').map((line, index) => (
              <span key={line}>
                {index > 0 && <br />}
                {line}
              </span>
            ))}
          </p>
          <style>{`.info-line:hover { color: rgba(255,255,255,0.9); }`}</style>
          <div className="text-ds-muted text-sm text-left max-w-md mt-6 mb-4">
            {DROP_ZONE_INFO_LINES.map((line) => (
              <div key={`${line.label ?? ''}${line.text}`} className={getDropZoneInfoLineClass(line.muted === true)}>
                {line.label && <strong>{line.label}</strong>}
                {line.label ? ` ${line.text}` : line.text}
              </div>
            ))}
          </div>

          <div className="flex gap-2 mt-2">
            <div className="relative">
              <button
                type="button"
                onClick={onOpenUrlModal}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onOpenExampleDataset();
                }}
                onMouseEnter={() => setHoveredButton('url')}
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
                onMouseEnter={() => setHoveredButton('toy')}
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
      <div className="flex flex-col bg-ds-secondary rounded-lg border border-ds p-4 w-full max-w-xs">
        <div className="flex justify-end -mt-1 -mr-1">
          <button
            type="button"
            className={DROP_ZONE_TOUCH_CLOSE_BUTTON_CLASS}
            onClick={onDismiss}
            aria-label={DROP_ZONE_ACTION_LABELS.dismiss}
          >
            ×
          </button>
        </div>

        <div className="flex flex-col items-center mb-3">
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

        <p className="text-ds-muted text-xs text-center mt-3">
          {DROP_ZONE_TOUCH_FOOTER}
        </p>
      </div>
    </div>
  );
}
