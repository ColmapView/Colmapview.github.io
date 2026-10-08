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
import { applySavedViewerState, applyShareConfig, collectShareConfig, decodeSharedViewerOverrides, generateEmbedUrl } from './useUrlState';
import { createIdentityEuler } from '../utils/sim3dTransforms';
import type { PublishedViewerState } from '../utils/publishedViewerState';
import { getSplatLoadingProgress } from '../utils/splatLoadingProgressPolicy';

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

  function stubPendingDownload() {
    let respond!: (response: Response) => void;
    // Like fetch: the restored splat's download rejects once its signal aborts.
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
      respond = resolve;
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
    })));
    return { respond: (response: Response) => respond(response) };
  }

  // flyToState writes flyToViewState; record what the trackball would read at that moment.
  function recordNavigationAtFlyTo() {
    const seen: Array<Record<string, unknown>> = [];
    const unsubscribe = useCameraStore.subscribe((state, previous) => {
      if (!state.flyToViewState || state.flyToViewState === previous.flyToViewState) return;
      const { cameraMode, cameraProjection, cameraFov, horizonLock, flyTransitionDuration, autoRotateMode,
        autoRotateSpeed, undistortionEnabled } = state;
      seen.push({ cameraMode, cameraProjection, cameraFov, horizonLock, flyTransitionDuration, autoRotateMode,
        autoRotateSpeed, undistortionEnabled, axesCoordinateSystem: useUIStore.getState().axesCoordinateSystem });
    });
    return { seen, unsubscribe };
  }

  it('round trips COLMAP only and overrides a saved splat without downloading it', async () => {
    installSavedSplatSources();
    const config = collectShareConfig();
    expect(config.splat?.activeSourceId).toBe('');
    // Decoded the way the URL loader decodes the overrides it hands to applySavedViewerState.
    const decoded = await decodeSharedViewerOverrides(new URL(generateEmbedUrl(manifest, viewState, config)).hash);
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

  it('applies the saved navigation settings before it flies to the saved view', async () => {
    installSavedSplatSources();
    stubPendingDownload();
    const saved = savedSplatState();
    saved.config.camera = { cameraMode: 'fly', cameraProjection: 'orthographic', cameraFov: 35, horizonLock: 'on',
      flyTransitionDuration: 0, autoRotateMode: 'cw', autoRotateSpeed: 1.5, undistortionEnabled: true, showCameras: false };
    saved.config.ui = { ...saved.config.ui, axesCoordinateSystem: 'opengl' };
    const { seen, unsubscribe } = recordNavigationAtFlyTo();
    try {
      const restoration = applySavedViewerState(saved, null);
      expect(seen).toEqual([{ cameraMode: 'fly', cameraProjection: 'orthographic', cameraFov: 35, horizonLock: 'on',
        flyTransitionDuration: 0, autoRotateMode: 'cw', autoRotateSpeed: 1.5, undistortionEnabled: true,
        axesCoordinateSystem: 'opengl' }]);
      // Frustum and point display still wait for the splat.
      expect(useCameraStore.getState().showCameras).toBe(true);
      expect(useUIStore.getState().backgroundColor).not.toBe('#123456');
      await useReconstructionStore.getState().selectSplatSource('');
      await restoration;
    } finally { unsubscribe(); }
  });

  it("lets the viewer URL's navigation win over the saved one at the fly-to", async () => {
    installSavedSplatSources();
    stubPendingDownload();
    const saved = savedSplatState();
    saved.config.camera = { horizonLock: 'on' };
    const { seen, unsubscribe } = recordNavigationAtFlyTo();
    try {
      const restoration = applySavedViewerState(saved, { config: { camera: { horizonLock: 'flip' } } });
      expect(seen.map(values => values.horizonLock)).toEqual(['flip']);
      await useReconstructionStore.getState().selectSplatSource('');
      await restoration;
      expect(useCameraStore.getState().horizonLock).toBe('flip');
    } finally { unsubscribe(); }
  });

  it('keeps a navigation change made while the restored splat downloads', async () => {
    installSavedSplatSources();
    const download = stubPendingDownload();
    const saved = savedSplatState();
    saved.config.camera = { horizonLock: 'on', showCameras: false };
    const restoration = applySavedViewerState(saved, null);
    useCameraStore.getState().setHorizonLock('off');
    download.respond(new Response(new Blob(['splat']), { status: 200 }));
    await restoration;
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeDefined();
    expect(useCameraStore.getState().horizonLock).toBe('off');
    // Display still lands once the splat is in.
    expect(useCameraStore.getState().showCameras).toBe(false);
  });

  it.each(['saved', 'shared'] as const)('keeps an alignment change made while the restored splat downloads (%s alignment)', async origin => {
    installSavedSplatSources();
    const download = stubPendingDownload();
    const alignment = { transform: { ...createIdentityEuler(), translationX: 5 },
      splat: { transform: { ...createIdentityEuler(), translationY: 2 } } };
    const saved = savedSplatState();
    const restoration = origin === 'saved'
      ? applySavedViewerState({ ...saved, config: { ...saved.config, ...alignment, splat: { ...saved.config.splat, ...alignment.splat } } }, null)
      : applySavedViewerState(saved, { config: alignment });
    // The alignment landed with the view, before the download.
    expect(useTransformStore.getState()).toMatchObject({ transform: alignment.transform, splatTransform: alignment.splat.transform });
    const edited = { ...createIdentityEuler(), rotationZ: 30 };
    useTransformStore.getState().setTransform(edited);
    useTransformStore.getState().setSplatTransform(createIdentityEuler());
    download.respond(new Response(new Blob(['splat']), { status: 200 }));
    await restoration;
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeDefined();
    expect(useTransformStore.getState()).toMatchObject({ transform: edited, splatTransform: createIdentityEuler() });
    // Display still lands once the splat is in.
    expect(useUIStore.getState().backgroundColor).toBe('#123456');
  });

  it("restores the selection with the navigation, the viewer URL's winning, and keeps a selection made during the download", async () => {
    installSavedSplatSources();
    const download = stubPendingDownload();
    const saved = savedSplatState();
    saved.config.camera = { undistortionEnabled: true, selectedImageId: 1 };
    const restoration = applySavedViewerState(saved, { config: { camera: { selectedImageId: 2 } } });
    // A U toggle flies to the panorama selected when it lands, so the selection lands with it.
    expect(useCameraStore.getState()).toMatchObject({ undistortionEnabled: true, selectedImageId: 2 });
    useCameraStore.getState().setSelectedImageId(3);
    download.respond(new Response(new Blob(['splat']), { status: 200 }));
    await restoration;
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeDefined();
    expect(useCameraStore.getState().selectedImageId).toBe(3);
  });

  it('falls back to the plain point display when saved splat display lands on a scene without a splat', async () => {
    installSavedSplatSources();
    const saved: PublishedViewerState = { version: 1, viewerVersion: 'test', viewState: null,
      config: { pointCloud: { colorMode: 'splatPoints', pointSize: 1, pointOpacity: 0.2 } } };
    await applySavedViewerState(saved, null);
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
    expect(usePointCloudStore.getState()).toMatchObject({ colorMode: 'rgb', pointSize: 2, pointOpacity: 1 });
  });

  it('keeps a saved COLMAP-only display', async () => {
    installSavedSplatSources();
    const saved: PublishedViewerState = { version: 1, viewerVersion: 'test', viewState: null,
      config: { splat: { activeSourceId: '' }, pointCloud: { colorMode: 'error', pointSize: 4, pointOpacity: 0.7 } } };
    await applySavedViewerState(saved, null);
    expect(usePointCloudStore.getState()).toMatchObject({ colorMode: 'error', pointSize: 4, pointOpacity: 0.7 });
  });

  it('keeps the loading overlay while the renderer decodes a restored splat that is already loaded', async () => {
    const splat = buildFile('scene.spz', 'splat');
    useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles({ splatFile: splat,
      splatFileSources: [{ id: 'scene.spz', path: 'scene.spz', file: splat }] }));
    const progress = getSplatLoadingProgress(splat, { startPercent: 60 });
    useReconstructionStore.setState({ urlLoading: true, urlProgress: progress });

    await applySavedViewerState(null, { config: { splat: { activeSourceId: 'scene.spz' } } });

    expect(useReconstructionStore.getState()).toMatchObject({ urlLoading: true, urlProgress: progress });
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
