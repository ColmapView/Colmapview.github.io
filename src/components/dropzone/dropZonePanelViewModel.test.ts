import { describe, expect, it } from 'vitest';
import { buttonStyles, Z_INDEX } from '../../theme';
import {
  DROP_ZONE_ACTION_LABELS,
  DROP_ZONE_DESKTOP_MESSAGE,
  DROP_ZONE_DESKTOP_OVERLAY_CLASS,
  DROP_ZONE_DESKTOP_TITLE,
  DROP_ZONE_INFO_LINES,
  DROP_ZONE_RESET_CONFIG_TOOLTIP,
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
} from './dropZonePanelViewModel';

describe('drop zone panel view model', () => {
  it('exposes stable overlay classes without dynamic Tailwind z-indexes', () => {
    expect(DROP_ZONE_DESKTOP_OVERLAY_CLASS).toBe('absolute inset-0 flex items-center justify-center');
    expect(DROP_ZONE_TOUCH_OVERLAY_CLASS).toBe(`${DROP_ZONE_DESKTOP_OVERLAY_CLASS} px-3`);
    expect(DROP_ZONE_DESKTOP_OVERLAY_CLASS).not.toContain('z-[');
    expect(DROP_ZONE_TOUCH_OVERLAY_CLASS).not.toContain('z-[');
  });

  it('keeps desktop and touch panel copy together', () => {
    expect(DROP_ZONE_DESKTOP_TITLE).toBe('Load COLMAP Data');
    expect(DROP_ZONE_DESKTOP_MESSAGE).toBe(
      'Drag and drop a COLMAP dataset folder here.\nOr click the box above to browse.',
    );
    expect(DROP_ZONE_TOUCH_TITLE).toBe('ColmapView');
    expect(DROP_ZONE_TOUCH_SUBTITLE).toBe('View COLMAP 3D reconstructions');
    expect(DROP_ZONE_TOUCH_FOOTER).toBe('Load a URL or try a sample dataset');
  });

  it('keeps action labels and tooltips centralized', () => {
    expect(DROP_ZONE_ACTION_LABELS).toEqual({
      loadUrl: 'Load URL',
      loadJson: 'Load JSON',
      loadFromUrl: 'Load from URL',
      tryToy: 'Try a Toy!',
      dismiss: 'Dismiss',
    });
    expect(DROP_ZONE_UPLOAD_CONFIG_TOOLTIP).toBe('Upload configuration file (.yaml)');
    expect(DROP_ZONE_RESET_CONFIG_TOOLTIP).toBe('Reset all settings to defaults');
  });

  it('describes desktop info lines in display order', () => {
    expect(DROP_ZONE_INFO_LINES).toEqual([
      { label: 'Drop folder or ZIP file', text: '- subfolders are scanned automatically' },
      { label: 'Required:', text: 'cameras, images, points3D (.bin or .txt preferred)' },
      { label: 'Auto-detected:', text: 'sparse/0/, sparse/, or any subfolder' },
      { label: 'Optional:', text: 'source images (jpg, png, webp, tiff), config (.yaml), masks/' },
      { text: 'ZIP: max 2GB, images loaded lazily on-demand', muted: true },
    ]);
  });

  it('applies muted styling only for muted info lines', () => {
    expect(getDropZoneInfoLineClass(false)).toBe('info-line px-2 rounded');
    expect(getDropZoneInfoLineClass(true)).toBe('info-line px-2 rounded text-ds-muted/70');
  });

  it('builds stable panel overlay and browse icon styles', () => {
    expect(getDropZonePanelOverlayStyle()).toEqual({
      zIndex: Z_INDEX.controls,
    });
    expect(getDropZoneBrowseIconStyle()).toEqual({
      fontSize: '72px',
    });
  });

  it('builds desktop action button classes by loading state', () => {
    expect(getDesktopDropZoneActionButtonClass(false)).not.toContain(buttonStyles.disabled);
    expect(getDesktopDropZoneActionButtonClass(true)).toContain(buttonStyles.disabled);
  });

  it('builds touch action button classes by action and loading state', () => {
    expect(getTouchDropZoneUrlButtonClass(false)).toContain(buttonStyles.variants.secondary);
    expect(getTouchDropZoneUrlButtonClass(true)).toContain(buttonStyles.disabled);
    expect(getTouchDropZoneToyButtonClass(false)).toContain(buttonStyles.variants.primary);
    expect(getTouchDropZoneToyButtonClass(true)).toContain(buttonStyles.disabled);
  });
});
