import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatasetManager } from './DatasetManager';
import type { DatasetState } from './types';

vi.mock('../utils/imageFileUtils', () => ({
  getImageFile: vi.fn(),
  getMaskFile: vi.fn(),
}));

vi.mock('../utils/urlImageFiles', () => ({
  fetchUrlImageRaw: vi.fn(),
  getUrlImageCached: vi.fn(),
  getUrlMaskCached: vi.fn(),
  fetchUrlImage: vi.fn(),
  fetchUrlMask: vi.fn(),
  prefetchUrlImages: vi.fn(),
}));

vi.mock('../utils/zipImageFiles', () => ({
  fetchZipImageRaw: vi.fn(),
  getZipImageCached: vi.fn(),
  getZipMaskCached: vi.fn(),
  fetchZipImage: vi.fn(),
  fetchZipMask: vi.fn(),
  isZipLoadingAvailable: vi.fn(),
}));

import {
  getImageFile,
  getMaskFile,
} from '../utils/imageFileUtils';
import {
  fetchUrlImageRaw,
  getUrlImageCached,
  getUrlMaskCached,
  fetchUrlImage,
  fetchUrlMask,
} from '../utils/urlImageFiles';
import {
  fetchZipImageRaw,
  getZipImageCached,
  getZipMaskCached,
  fetchZipImage,
  fetchZipMask,
  isZipLoadingAvailable,
} from '../utils/zipImageFiles';

describe('DatasetManager', () => {
  let manager: DatasetManager;
  let mockState: DatasetState;

  beforeEach(() => {
    vi.clearAllMocks();

    mockState = {
      sourceType: null,
      imageUrlBase: null,
      maskUrlBase: null,
      loadedFiles: null,
    };

    manager = new DatasetManager(() => mockState);
  });

  describe('getSourceType', () => {
    it('returns null when no dataset loaded', () => {
      expect(manager.getSourceType()).toBeNull();
    });

    it('returns correct source type when loaded', () => {
      mockState.sourceType = 'local';
      expect(manager.getSourceType()).toBe('local');

      mockState.sourceType = 'url';
      expect(manager.getSourceType()).toBe('url');

      mockState.sourceType = 'zip';
      expect(manager.getSourceType()).toBe('zip');
    });
  });

  describe('isLoaded', () => {
    it('returns false when no dataset loaded', () => {
      expect(manager.isLoaded()).toBe(false);
    });

    it('returns true when dataset is loaded', () => {
      mockState.sourceType = 'local';
      expect(manager.isLoaded()).toBe(true);
    });
  });

  describe('getImage (local source)', () => {
    beforeEach(() => {
      mockState.sourceType = 'local';
      mockState.loadedFiles = {
        imageFiles: new Map([['test.jpg', new File([], 'test.jpg')]]),
        hasMasks: false,
      };
    });

    it('returns file from local imageFiles', async () => {
      const mockFile = new File([], 'test.jpg');
      vi.mocked(getImageFile).mockReturnValue(mockFile);

      const result = await manager.getImage('test.jpg');
      expect(result).toBe(mockFile);
      expect(getImageFile).toHaveBeenCalledWith(mockState.loadedFiles?.imageFiles, 'test.jpg');
    });

    it('returns null when file not found', async () => {
      vi.mocked(getImageFile).mockReturnValue(undefined);

      const result = await manager.getImage('missing.jpg');
      expect(result).toBeNull();
    });
  });

  describe('getImage (url source)', () => {
    beforeEach(() => {
      mockState.sourceType = 'url';
      mockState.imageUrlBase = 'https://example.com/images/';
    });

    it('returns cached image if available', async () => {
      const cachedFile = new File([], 'cached.jpg');
      vi.mocked(getUrlImageCached).mockReturnValue(cachedFile);

      const result = await manager.getImage('test.jpg');
      expect(result).toBe(cachedFile);
      expect(fetchUrlImage).not.toHaveBeenCalled();
    });

    it('fetches image if not cached', async () => {
      const fetchedFile = new File([], 'fetched.jpg');
      vi.mocked(getUrlImageCached).mockReturnValue(undefined);
      vi.mocked(fetchUrlImage).mockResolvedValue(fetchedFile);

      const result = await manager.getImage('test.jpg');
      expect(result).toBe(fetchedFile);
      expect(fetchUrlImage).toHaveBeenCalledWith('https://example.com/images/', 'test.jpg');
    });

    it('returns null when no imageUrlBase', async () => {
      mockState.imageUrlBase = null;

      const result = await manager.getImage('test.jpg');
      expect(result).toBeNull();
    });

    it('fetches raw URL images for metric computation', async () => {
      const rawFile = new File(['raw'], 'raw.jpg');
      vi.mocked(fetchUrlImageRaw).mockResolvedValue(rawFile);

      const result = await manager.getMetricImage('test.jpg');

      expect(result).toBe(rawFile);
      expect(fetchUrlImageRaw).toHaveBeenCalledWith('https://example.com/images/', 'test.jpg');
      expect(fetchUrlImage).not.toHaveBeenCalled();
    });
  });

  describe('getImage (zip source)', () => {
    beforeEach(() => {
      mockState.sourceType = 'zip';
      vi.mocked(isZipLoadingAvailable).mockReturnValue(true);
    });

    it('returns cached image if available', async () => {
      const cachedFile = new File([], 'cached.jpg');
      vi.mocked(getZipImageCached).mockReturnValue(cachedFile);

      const result = await manager.getImage('test.jpg');
      expect(result).toBe(cachedFile);
      expect(fetchZipImage).not.toHaveBeenCalled();
    });

    it('extracts image if not cached', async () => {
      const extractedFile = new File([], 'extracted.jpg');
      vi.mocked(getZipImageCached).mockReturnValue(undefined);
      vi.mocked(fetchZipImage).mockResolvedValue(extractedFile);

      const result = await manager.getImage('test.jpg');
      expect(result).toBe(extractedFile);
      expect(fetchZipImage).toHaveBeenCalledWith('test.jpg');
    });

    it('returns null when ZIP not available', async () => {
      vi.mocked(isZipLoadingAvailable).mockReturnValue(false);

      const result = await manager.getImage('test.jpg');
      expect(result).toBeNull();
    });

    it('extracts raw ZIP images for metric computation', async () => {
      const rawFile = new File(['raw'], 'raw.jpg');
      vi.mocked(fetchZipImageRaw).mockResolvedValue(rawFile);

      const result = await manager.getMetricImage('test.jpg');

      expect(result).toBe(rawFile);
      expect(fetchZipImageRaw).toHaveBeenCalledWith('test.jpg');
      expect(fetchZipImage).not.toHaveBeenCalled();
    });
  });

  describe('getImageSync', () => {
    it('returns local file directly', () => {
      mockState.sourceType = 'local';
      mockState.loadedFiles = {
        imageFiles: new Map(),
        hasMasks: false,
      };
      const mockFile = new File([], 'test.jpg');
      vi.mocked(getImageFile).mockReturnValue(mockFile);

      expect(manager.getImageSync('test.jpg')).toBe(mockFile);
    });

    it('returns cached URL image only', () => {
      mockState.sourceType = 'url';
      mockState.imageUrlBase = 'https://example.com/images/';
      const cachedFile = new File([], 'cached.jpg');
      vi.mocked(getUrlImageCached).mockReturnValue(cachedFile);

      expect(manager.getImageSync('test.jpg')).toBe(cachedFile);
    });

    it('returns undefined for uncached URL image', () => {
      mockState.sourceType = 'url';
      mockState.imageUrlBase = 'https://example.com/images/';
      vi.mocked(getUrlImageCached).mockReturnValue(undefined);

      expect(manager.getImageSync('test.jpg')).toBeUndefined();
    });
  });

  describe('getMask', () => {
    it('returns local mask file', async () => {
      mockState.sourceType = 'local';
      mockState.loadedFiles = {
        imageFiles: new Map(),
        hasMasks: true,
      };
      const maskFile = new File([], 'mask.png');
      vi.mocked(getMaskFile).mockReturnValue(maskFile);

      const result = await manager.getMask('test.jpg');
      expect(result).toBe(maskFile);
    });

    it('fetches URL mask', async () => {
      mockState.sourceType = 'url';
      mockState.maskUrlBase = 'https://example.com/masks/';
      const maskFile = new File([], 'mask.png');
      vi.mocked(fetchUrlMask).mockResolvedValue(maskFile);

      const result = await manager.getMask('test.jpg');
      expect(result).toBe(maskFile);
      expect(fetchUrlMask).toHaveBeenCalledWith('https://example.com/masks/', 'test.jpg');
    });

    it('returns cached URL mask synchronously', () => {
      mockState.sourceType = 'url';
      mockState.maskUrlBase = 'https://example.com/masks/';
      const maskFile = new File([], 'mask.png');
      vi.mocked(getUrlMaskCached).mockReturnValue(maskFile);

      expect(manager.getMaskSync('test.jpg')).toBe(maskFile);
    });

    it('returns null when no maskUrlBase for URL source', async () => {
      mockState.sourceType = 'url';
      mockState.maskUrlBase = null;

      const result = await manager.getMask('test.jpg');
      expect(result).toBeNull();
    });

    it('extracts ZIP mask', async () => {
      mockState.sourceType = 'zip';
      vi.mocked(isZipLoadingAvailable).mockReturnValue(true);
      const maskFile = new File([], 'mask.png');
      vi.mocked(fetchZipMask).mockResolvedValue(maskFile);

      const result = await manager.getMask('test.jpg');
      expect(result).toBe(maskFile);
    });

    it('returns cached ZIP mask synchronously', () => {
      mockState.sourceType = 'zip';
      const maskFile = new File([], 'mask.png');
      vi.mocked(getZipMaskCached).mockReturnValue(maskFile);

      expect(manager.getMaskSync('test.jpg')).toBe(maskFile);
    });
  });

  describe('hasImages', () => {
    it('returns false when no source', () => {
      expect(manager.hasImages()).toBe(false);
    });

    it('returns true for local with images', () => {
      mockState.sourceType = 'local';
      mockState.loadedFiles = {
        imageFiles: new Map([['test.jpg', new File([], 'test.jpg')]]),
        hasMasks: false,
      };
      expect(manager.hasImages()).toBe(true);
    });

    it('returns false for local without images', () => {
      mockState.sourceType = 'local';
      mockState.loadedFiles = {
        imageFiles: new Map(),
        hasMasks: false,
      };
      expect(manager.hasImages()).toBe(false);
    });

    it('returns true for URL with imageUrlBase', () => {
      mockState.sourceType = 'url';
      mockState.imageUrlBase = 'https://example.com/images/';
      expect(manager.hasImages()).toBe(true);
    });

    it('returns true for ZIP when available', () => {
      mockState.sourceType = 'zip';
      vi.mocked(isZipLoadingAvailable).mockReturnValue(true);
      expect(manager.hasImages()).toBe(true);
    });
  });

  describe('hasMasks', () => {
    it('returns false when no source', () => {
      expect(manager.hasMasks()).toBe(false);
    });

    it('returns true for local with masks', () => {
      mockState.sourceType = 'local';
      mockState.loadedFiles = {
        imageFiles: new Map(),
        hasMasks: true,
      };
      expect(manager.hasMasks()).toBe(true);
    });

    it('returns true for URL with maskUrlBase', () => {
      mockState.sourceType = 'url';
      mockState.maskUrlBase = 'https://example.com/masks/';
      expect(manager.hasMasks()).toBe(true);
    });
  });
});
