import { describe, expect, it } from 'vitest';
import {
  DELETED_FILTER,
  GAP,
  MODAL_POSITION,
  SIZE,
  Z_INDEX,
} from '../../theme';
import {
  getDeletionImageStyle,
  getDeletionPlaceholderStyle,
  getGalleryItemFrameStyle,
  getGalleryItemVignetteStyle,
  getGalleryVirtualizerSizerStyle,
  getGalleryVirtualRowStyle,
  getImageGalleryHoverCardStyle,
  getListItemFrameStyle,
  getListVirtualRowStyle,
} from './imageGalleryStyleViewModel';

describe('image gallery style view model', () => {
  it('builds gallery and list item frame styles from selection and match state', () => {
    expect(getGalleryItemFrameStyle({
      isMatched: true,
      isSelected: false,
      itemBorderColor: '#00ffaa',
      matchesColor: '#ff00aa',
    })).toEqual({
      position: 'relative',
      borderColor: '#ff00aa',
    });
    expect(getGalleryItemFrameStyle({
      isMatched: true,
      isSelected: true,
      itemBorderColor: '#00ffaa',
      matchesColor: '#ff00aa',
    })).toEqual({
      position: 'relative',
    });
    expect(getGalleryItemFrameStyle({
      isMatched: false,
      isSelected: false,
      itemBorderColor: '#00ffaa',
      matchesColor: '#ff00aa',
    })).toEqual({
      position: 'relative',
      borderColor: '#00ffaa',
    });
    expect(getListItemFrameStyle({
      isMatched: true,
      isSelected: false,
      itemBorderColor: '#ff00aa',
      matchesColor: '#00ffaa',
    })).toEqual({
      height: SIZE.listRowHeight,
      borderColor: '#00ffaa',
    });
  });

  it('builds deletion styles only for marked images', () => {
    expect(getDeletionImageStyle(true)).toEqual({
      filter: DELETED_FILTER,
    });
    expect(getDeletionImageStyle(false)).toBeUndefined();
    expect(getDeletionPlaceholderStyle(true)).toEqual({
      opacity: 0.5,
    });
    expect(getDeletionPlaceholderStyle(false)).toBeUndefined();
  });

  it('keeps gallery item vignette styling centralized', () => {
    expect(getGalleryItemVignetteStyle()).toEqual({
      background:
        'radial-gradient(ellipse 100% 100% at center, transparent 20%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0.7) 80%, rgba(0,0,0,0.9) 100%)',
    });
  });

  it('builds virtualizer container and row positioning styles', () => {
    expect(getGalleryVirtualizerSizerStyle(240)).toEqual({
      height: 240,
      width: '100%',
      position: 'relative',
    });
    expect(getGalleryVirtualRowStyle({
      galleryColumns: 3,
      start: 48,
    })).toEqual({
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      transform: 'translateY(48px)',
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: GAP.gallery,
      paddingBottom: GAP.gallery,
      willChange: 'transform',
    });
    expect(getListVirtualRowStyle(72)).toEqual({
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      transform: 'translateY(72px)',
      willChange: 'transform',
    });
  });

  it('builds fixed hover-card portal style from pointer position', () => {
    expect(getImageGalleryHoverCardStyle({ x: 100, y: 200 })).toEqual({
      position: 'fixed',
      left: 100 + MODAL_POSITION.cursorOffset,
      top: 200 + MODAL_POSITION.cursorOffset,
      pointerEvents: 'none',
      zIndex: Z_INDEX.mouseTooltip,
    });
  });
});
