import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useCameraStore,
  useImageMetricsStore,
  usePointCloudStore,
  useReconstructionStore,
  useRigStore,
  useTransformStore,
  useUIStore,
} from '../store';
import { buildFile, buildLoadedFiles } from '../test/builders';
import type { CameraViewState } from '../store/types';
import type { ColmapManifest } from '../types/manifest';
import { decodeShareData } from '../utils/shareDataCodec';
import { applyShareConfig, collectShareConfig, generateEmbedUrl } from './useUrlState';

const manifest: ColmapManifest = {
  version: 1,
  name: 'Shared gallery scene',
  baseUrl: 'https://example.com/dataset/',
  files: {
    cameras: 'sparse/0/cameras.bin',
    images: 'sparse/0/images.bin',
    points3D: 'sparse/0/points3D.bin',
  },
  splats: ['splats/model.spz', 'splats/active.spz'],
};

const viewState: CameraViewState = {
  position: [1, 2, 3],
  quaternion: [1, 0, 0, 0],
  target: [0, 0, 0],
  distance: 4,
};

describe('URL state sharing', () => {
  beforeEach(() => {
    vi.stubGlobal('__APP_VERSION__', '0.0.0');
    window.history.replaceState(null, '', '/viewer/');
    usePointCloudStore.setState(usePointCloudStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useCameraStore.setState(useCameraStore.getInitialState(), true);
    useRigStore.setState(useRigStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    useImageMetricsStore.setState(useImageMetricsStore.getInitialState(), true);
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
  });

  it('collects splat display settings, active splat source, and gallery settings for shared URLs', () => {
    const defaultSplatFile = buildFile('default.spz', 'splat');
    const activeSplatFile = buildFile('active.spz', 'splat');

    usePointCloudStore.getState().setColorMode('splatPoints');
    usePointCloudStore.getState().setPointSize(1);
    usePointCloudStore.getState().setPointOpacity(0.2);
    useReconstructionStore.setState({
      loadedFiles: buildLoadedFiles({
        splatFile: activeSplatFile,
        splatFiles: [defaultSplatFile, activeSplatFile],
        splatFileSources: [
          { id: 'splats/default.spz', path: 'splats/default.spz', file: defaultSplatFile },
          { id: 'splats/active.spz', path: 'splats/active.spz', file: activeSplatFile },
        ],
      }),
    });
    useUIStore.getState().setGalleryViewMode('list');
    useUIStore.getState().setGalleryColumns(5);
    useUIStore.getState().setGalleryCameraFilter('2');
    useUIStore.getState().setGallerySortField('splatSsim');
    useUIStore.getState().setGallerySortDirection('desc');
    useUIStore.getState().setGalleryBorderColorMode('ssim');
    useUIStore.getState().setGalleryThumbnailDisplayMode('inverseMaskedImage');

    expect(collectShareConfig()).toMatchObject({
      pointCloud: {
        colorMode: 'splatPoints',
        pointSize: 1,
        pointOpacity: 0.2,
      },
      splat: {
        activeSourceId: 'splats/active.spz',
      },
      ui: {
        galleryViewMode: 'list',
        galleryColumns: 5,
        galleryCameraFilter: '2',
        gallerySortField: 'splatSsim',
        gallerySortDirection: 'desc',
        galleryBorderColorMode: 'ssim',
        galleryThumbnailDisplayMode: 'inverseMaskedImage',
      },
    });
  });

  it('applies shared gallery settings back into the UI store', () => {
    applyShareConfig({
      ui: {
        galleryViewMode: 'gallery',
        galleryColumns: 4,
        galleryCameraFilter: '3',
        gallerySortField: 'numPoints3D',
        gallerySortDirection: 'desc',
        galleryBorderColorMode: 'camera',
        galleryThumbnailDisplayMode: 'mask',
      },
    });

    expect(useUIStore.getState()).toMatchObject({
      galleryViewMode: 'gallery',
      galleryColumns: 4,
      galleryCameraFilter: '3',
      gallerySortField: 'numPoints3D',
      gallerySortDirection: 'desc',
      galleryBorderColorMode: 'camera',
      galleryThumbnailDisplayMode: 'mask',
    });
  });

  it('stages a shared active splat source until splat files are loaded', () => {
    const defaultSplatFile = buildFile('default.spz', 'splat');
    const activeSplatFile = buildFile('active.spz', 'splat');

    applyShareConfig({
      splat: {
        activeSourceId: 'splats/active.spz',
      },
    });

    expect(useReconstructionStore.getState().requestedSplatSourceId).toBe('splats/active.spz');

    useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles({
      splatFile: defaultSplatFile,
      splatFiles: [defaultSplatFile, activeSplatFile],
      splatFileSources: [
        { id: 'splats/default.spz', path: 'splats/default.spz', file: defaultSplatFile },
        { id: 'splats/active.spz', path: 'splats/active.spz', file: activeSplatFile },
      ],
    }));

    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(activeSplatFile);
    expect(useReconstructionStore.getState().requestedSplatSourceId).toBeNull();
  });

  it('keeps shared point-cloud settings after resolving an active splat source', () => {
    const defaultSplatFile = buildFile('default.spz', 'splat');
    const activeSplatFile = buildFile('active.spz', 'splat');

    useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles({
      splatFile: defaultSplatFile,
      splatFiles: [defaultSplatFile, activeSplatFile],
      splatFileSources: [
        { id: 'splats/default.spz', path: 'splats/default.spz', file: defaultSplatFile },
        { id: 'splats/active.spz', path: 'splats/active.spz', file: activeSplatFile },
      ],
    }));

    applyShareConfig({
      splat: {
        activeSourceId: 'splats/active.spz',
      },
      pointCloud: {
        colorMode: 'splats',
        pointSize: 4,
        pointOpacity: 0.45,
      },
    });

    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(activeSplatFile);
    expect(usePointCloudStore.getState()).toMatchObject({
      colorMode: 'splats',
      pointSize: 4,
      pointOpacity: 0.45,
    });
  });

  it('embeds the collected gallery and splat config in embed URLs', async () => {
    const defaultSplatFile = buildFile('model.spz', 'splat');
    const activeSplatFile = buildFile('active.spz', 'splat');

    usePointCloudStore.getState().setColorMode('splats');
    usePointCloudStore.getState().setPointSize(1);
    usePointCloudStore.getState().setPointOpacity(0.2);
    useReconstructionStore.setState({
      loadedFiles: buildLoadedFiles({
        splatFile: activeSplatFile,
        splatFiles: [defaultSplatFile, activeSplatFile],
        splatFileSources: [
          { id: 'splats/model.spz', path: 'splats/model.spz', file: defaultSplatFile },
          { id: 'splats/active.spz', path: 'splats/active.spz', file: activeSplatFile },
        ],
      }),
    });
    useUIStore.getState().setGalleryViewMode('list');
    useUIStore.getState().setGalleryColumns(6);
    useUIStore.getState().setGallerySortField('splatPsnr');
    useUIStore.getState().setGallerySortDirection('desc');
    useUIStore.getState().setGalleryBorderColorMode('psnr');
    useUIStore.getState().setGalleryThumbnailDisplayMode('maskedImage');

    const embedUrl = generateEmbedUrl(manifest, viewState);
    const parsedUrl = new URL(embedUrl);
    const decoded = await decodeShareData(parsedUrl.hash);

    expect(parsedUrl.searchParams.get('embed')).toBe('1');
    expect(decoded?.config).toMatchObject({
      pointCloud: {
        colorMode: 'splats',
        pointSize: 1,
        pointOpacity: 0.2,
      },
      splat: {
        activeSourceId: 'splats/active.spz',
      },
      ui: {
        galleryViewMode: 'list',
        galleryColumns: 6,
        gallerySortField: 'splatPsnr',
        gallerySortDirection: 'desc',
        galleryBorderColorMode: 'psnr',
        galleryThumbnailDisplayMode: 'maskedImage',
      },
    });
  });
});
