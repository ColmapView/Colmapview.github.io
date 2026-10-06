import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { applySavedViewerState, applyShareConfig, collectShareConfig, generateEmbedUrl } from './useUrlState';
import { createIdentityEuler } from '../utils/sim3dTransforms';
import type { PublishedViewerState } from '../utils/publishedViewerState';

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

  afterEach(() => {
    useReconstructionStore.getState().clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function savedSplatState(): PublishedViewerState {
    return {
      version: 1, viewerVersion: 'test', viewState,
      config: {
        splat: { activeSourceId: 'splats/active.spz', transform: { ...createIdentityEuler(), translationX: 7 } },
        pointCloud: { pointSize: 4 }, ui: { backgroundColor: '#123456' },
      },
    };
  }

  function installSavedSplatSources() {
    const alternateFile = buildFile('alternate.spz', 'alternate');
    useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles({
      splatFileSources: [
        { id: 'splats/active.spz', path: 'splats/active.spz', url: 'https://example.com/splats/active.spz' },
        { id: 'splats/alternate.spz', path: 'splats/alternate.spz', file: alternateFile },
      ],
    }));
    return alternateFile;
  }

  it('round trips COLMAP only and overrides a saved splat without downloading it', async () => {
    installSavedSplatSources();
    const config = collectShareConfig();
    expect(config.splat?.activeSourceId).toBe('');
    const decoded = await decodeShareData(new URL(generateEmbedUrl(manifest, viewState, config)).hash);
    expect(decoded?.config?.splat?.activeSourceId).toBe('');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await applySavedViewerState(savedSplatState(), decoded);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
    expect(useReconstructionStore.getState().requestedSplatSourceId).toBeNull();
    expect(useReconstructionStore.getState().showSplatPicker).toBe(false);
    expect(usePointCloudStore.getState().pointSize).toBe(config.pointCloud?.pointSize);
  });

  it('keeps a shared source when the saved dataset chooses COLMAP only', async () => {
    const alternate = installSavedSplatSources();
    const saved = savedSplatState();
    saved.config.splat!.activeSourceId = '';
    await applySavedViewerState(saved, { config: { splat: { activeSourceId: 'splats/alternate.spz' } } });
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(alternate);
    expect(useReconstructionStore.getState().requestedSplatSourceId).toBe('splats/alternate.spz');
  });

  it('applies a shared COLMAP-only choice with no saved YAML or download', async () => {
    installSavedSplatSources();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await applySavedViewerState(null, { config: { splat: { activeSourceId: '' } } }, undefined,
      useReconstructionStore.getState().splatSelectionRevision, 'splats/active.spz');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
    expect(useReconstructionStore.getState().showSplatPicker).toBe(false);
  });

  it('retains legacy automatic selection when neither saved nor shared settings specifies a source', async () => {
    const alternate = installSavedSplatSources();
    await applySavedViewerState(null, { config: { pointCloud: { pointSize: 6 } } }, undefined,
      useReconstructionStore.getState().splatSelectionRevision, 'splats/alternate.spz');
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(alternate);
    expect(usePointCloudStore.getState().pointSize).toBe(6);
  });

  it('shares a selected source when only its bytes remain in a larger lazy catalog', () => {
    const active = installSavedSplatSources();
    const loaded = useReconstructionStore.getState().loadedFiles!;
    useReconstructionStore.setState({ loadedFiles: { ...loaded, splatFile: active, splatFiles: [active] } });
    expect(collectShareConfig().splat?.activeSourceId).toBe('splats/alternate.spz');
  });

  it.each(['None', 'alternate'] as const)('retains a user %s choice made while saved settings are decoding', async choice => {
    const alternateFile = installSavedSplatSources();
    const initialRevision = useReconstructionStore.getState().splatSelectionRevision;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await useReconstructionStore.getState().selectSplatSource(choice === 'None' ? '' : 'splats/alternate.spz');

    const saved = savedSplatState();
    await applySavedViewerState(saved, { config: { splat: { activeSourceId: 'splats/active.spz' } } },
      undefined, initialRevision);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(useReconstructionStore.getState().requestedSplatSourceId).toBe(choice === 'None' ? null : 'splats/alternate.spz');
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(choice === 'None' ? undefined : alternateFile);
    expect(usePointCloudStore.getState().pointSize).toBe(4);
    expect(useUIStore.getState().backgroundColor).toBe('#123456');
    expect(useTransformStore.getState().splatTransform).toEqual(saved.config.splat?.transform);
    expect(useCameraStore.getState().flyToViewState).toEqual(viewState);
  });

  it.each(['None', 'alternate'] as const)('does not reinstate saved or shared sources after a pending activation is replaced by %s', async choice => {
    const alternateFile = installSavedSplatSources();
    let respond!: (response: Response) => void;
    let signal: AbortSignal | null | undefined;
    // Deliberately resolve after cancellation to check the late-result guard too.
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      signal = init?.signal;
      return new Promise<Response>(resolve => { respond = resolve; });
    });
    vi.stubGlobal('fetch', fetchMock);
    const saved = savedSplatState();
    const restoration = applySavedViewerState(saved, { config: { splat: { activeSourceId: 'splats/active.spz' } } });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(signal?.aborted).toBe(false);

    await useReconstructionStore.getState().selectSplatSource(choice === 'None' ? '' : 'splats/alternate.spz');
    expect(signal?.aborted).toBe(true);
    respond(new Response(new Uint8Array([1, 2, 3])));
    await restoration;

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(useReconstructionStore.getState().requestedSplatSourceId).toBe(choice === 'None' ? null : 'splats/alternate.spz');
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(choice === 'None' ? undefined : alternateFile);
    expect(useReconstructionStore.getState()).toMatchObject({ urlLoading: false, urlError: null });
    expect(usePointCloudStore.getState().pointSize).toBe(4);
    expect(useTransformStore.getState().splatTransform).toEqual(saved.config.splat?.transform);
    expect(useCameraStore.getState().flyToViewState).toEqual(viewState);
  });

  it('restores separate scene and splat transforms absolutely across repeated startup applications', () => {
    const transform = { ...createIdentityEuler(), translationX: 4, rotationY: 35 };
    const splatTransform = { ...createIdentityEuler(), scale: 2, rotationX: 20, translationZ: -3 };
    const config = { transform, splat: { transform: splatTransform } };
    applyShareConfig(config);
    applyShareConfig(config);
    expect(useTransformStore.getState().transform).toEqual(transform);
    expect(useTransformStore.getState().splatTransform).toEqual(splatTransform);
    expect(collectShareConfig()).toMatchObject(config);
  });

  it('round trips an unlimited numeric filter through JSON/YAML null', () => {
    usePointCloudStore.setState({ maxReprojectionError: Infinity });
    const config = collectShareConfig();
    expect(config.pointCloud?.maxReprojectionError).toBeNull();
    usePointCloudStore.setState({ maxReprojectionError: 1 });
    applyShareConfig(config);
    expect(usePointCloudStore.getState().maxReprojectionError).toBe(Infinity);
    expect(config.pointCloud?.maxReprojectionError).toBeNull();
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

  it('preserves saved alignment and a pending selection while installing a lazy catalog', async () => {
    const alignment = { ...createIdentityEuler(), translationX: 7, rotationZ: 1 };
    useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles());
    applyShareConfig({ splat: { activeSourceId: 'splats/active.spz', transform: alignment }, transform: createIdentityEuler() });
    useReconstructionStore.getState().mergeRemoteSplatCatalog([
      { path: 'splats/default.spz', size: 200 }, { path: 'splats/active.spz', size: 100 },
    ], 'https://example.com/');
    expect(useReconstructionStore.getState().requestedSplatSourceId).toBe('splats/active.spz');
    expect(useTransformStore.getState().splatTransform).toEqual(alignment);
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
