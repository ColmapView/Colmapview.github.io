import { describe, expect, it } from 'vitest';
import { Z_INDEX } from '../../theme';
import { ARCHIVE_EXTENSIONS } from '../../utils/zipLoader';
import {
  DROP_ZONE_HOVER_CARD_POSITION_CLASS,
  getArchiveFormatsHint,
  getArchiveUrlCopy,
  getDropZoneHoverCardStyle,
  LOAD_JSON_HINT_ROWS,
  LOAD_JSON_MANIFEST_EXAMPLE,
  LOAD_URL_DIRECT_EXAMPLE,
  LOAD_URL_HINT_ROWS,
  LOAD_URL_LOCAL_SERVER_HINT,
  LOAD_URL_SUPPORTED_SOURCES,
  TOY_HINT_ROWS,
  TOY_HOVER_CARD_SOURCE,
} from './dropZoneHoverCardViewModel';

describe('drop zone hover card view model', () => {
  it('formats archive extensions for the URL hover card', () => {
    expect(getArchiveFormatsHint()).toBe(`${ARCHIVE_EXTENSIONS.join(' / ')} / manifest.json`);
    expect(getArchiveFormatsHint(['.zip', '.tar'])).toBe('.zip / .tar / manifest.json');
  });

  it('builds archive URL helper copy', () => {
    expect(getArchiveUrlCopy(['.zip'])).toBe('Or provide a .zip / manifest.json URL');
  });

  it('exposes direct URL and manifest examples', () => {
    expect(LOAD_URL_DIRECT_EXAMPLE).toContain('<baseUrl>/sparse/0/cameras.bin');
    expect(LOAD_URL_DIRECT_EXAMPLE).toContain('<baseUrl>/masks/   (optional)');
    expect(LOAD_JSON_MANIFEST_EXAMPLE).toContain('"version": 1');
    expect(LOAD_JSON_MANIFEST_EXAMPLE).toContain('"points3D": "sparse/0/points3D.bin"');
  });

  it('keeps URL support and local server copy together', () => {
    expect(LOAD_URL_SUPPORTED_SOURCES).toBe('Supports: S3, GCS, R2, Dropbox, HuggingFace, GitHub');
    expect(LOAD_URL_LOCAL_SERVER_HINT).toBe('Local server: npx http-server --cors -p 8080');
  });

  it('defines hint rows with explicit icon identifiers', () => {
    expect(LOAD_URL_HINT_ROWS).toEqual([
      { icon: 'mouse-left', label: 'Left: open URL dialog' },
      { icon: 'mouse-right', label: 'Right: open NGS dataset' },
    ]);
    expect(LOAD_JSON_HINT_ROWS).toEqual([
      { icon: 'mouse-left', label: 'Left: browse manifest file' },
      { icon: 'mouse-right', label: 'Right: download example' },
    ]);
    expect(TOY_HINT_ROWS).toEqual([
      { icon: 'mouse-left', label: 'Left: load random scan' },
    ]);
  });

  it('keeps hover card placement stable without dynamic Tailwind z-index classes', () => {
    expect(DROP_ZONE_HOVER_CARD_POSITION_CLASS).toContain('absolute left-1/2');
    expect(DROP_ZONE_HOVER_CARD_POSITION_CLASS).not.toContain('z-[');
    expect(getDropZoneHoverCardStyle()).toEqual({
      zIndex: Z_INDEX.dropdown,
    });
  });

  it('keeps the toy source visible in metadata', () => {
    expect(TOY_HOVER_CARD_SOURCE).toBe('huggingface.co/datasets/OpsiClear/NGS');
  });
});
