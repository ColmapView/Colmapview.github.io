import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoadedFiles } from '../types/colmap';
import { useReconstructionStore } from './reconstructionStore';
import { usePointCloudStore } from './stores/pointCloudStore';
import { useTransformStore } from './stores/transformStore';
import { useUIStore } from './stores/uiStore';

describe('reconstruction store URL load lifecycle', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    usePointCloudStore.setState(usePointCloudStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('serializes URL loads independently from the visible loading indicator', () => {
    useReconstructionStore.setState({ urlLoading: true });

    expect(useReconstructionStore.getState().tryStartUrlLoad()).toBe(true);
    expect(useReconstructionStore.getState().tryStartUrlLoad()).toBe(false);

    useReconstructionStore.getState().finishUrlLoad();

    expect(useReconstructionStore.getState().tryStartUrlLoad()).toBe(true);
  });

  it('clears active URL load state when the reconstruction is cleared', () => {
    expect(useReconstructionStore.getState().tryStartUrlLoad()).toBe(true);

    useReconstructionStore.getState().clear();

    expect(useReconstructionStore.getState().tryStartUrlLoad()).toBe(true);
  });

  it('uses a black default background when a splat file starts loading', () => {
    const splatFile = new File(['splat'], 'scene.spz');

    useUIStore.setState({ backgroundColor: '#ffffff' });

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile: new File([''], 'cameras.bin'),
      imagesFile: new File([''], 'images.bin'),
      points3DFile: new File([''], 'points3D.bin'),
      splatFile,
      splatFiles: [splatFile],
      imageFiles: new Map(),
      hasMasks: false,
    });

    expect(useUIStore.getState().backgroundColor).toBe('#000000');
  });

  it('preserves custom background colors when a splat file starts loading', () => {
    const splatFile = new File(['splat'], 'scene.spz');

    useUIStore.setState({ backgroundColor: '#123456' });

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile: new File([''], 'cameras.bin'),
      imagesFile: new File([''], 'images.bin'),
      points3DFile: new File([''], 'points3D.bin'),
      splatFile,
      splatFiles: [splatFile],
      imageFiles: new Map(),
      hasMasks: false,
    });

    expect(useUIStore.getState().backgroundColor).toBe('#123456');
  });

  it('switches point cloud display to splats plus points when loaded files include a splat', () => {
    const splatFile = new File(['splat'], 'scene.spz');

    usePointCloudStore.setState({
      colorMode: 'rgb',
      showSplats: false,
      pointSize: 7,
      pointOpacity: 0.9,
    });

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile: new File([''], 'cameras.bin'),
      imagesFile: new File([''], 'images.bin'),
      points3DFile: new File([''], 'points3D.bin'),
      splatFile,
      splatFiles: [splatFile],
      imageFiles: new Map(),
      hasMasks: false,
    });

    expect(usePointCloudStore.getState().colorMode).toBe('splatPoints');
    expect(usePointCloudStore.getState().showSplats).toBe(true);
    expect(usePointCloudStore.getState().pointSize).toBe(1);
    expect(usePointCloudStore.getState().pointOpacity).toBe(0.2);
  });

  it('preserves point rendering mode, size, and opacity when only the active splat file changes', () => {
    const camerasFile = new File([''], 'cameras.bin');
    const imagesFile = new File([''], 'images.bin');
    const points3DFile = new File([''], 'points3D.bin');
    const firstSplatFile = new File(['splat-a'], 'scene-a.spz');
    const secondSplatFile = new File(['splat-b'], 'scene-b.spz');
    const imageFiles = new Map<string, File>();

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile,
      imagesFile,
      points3DFile,
      splatFile: firstSplatFile,
      splatFiles: [firstSplatFile],
      imageFiles,
      hasMasks: false,
    });
    usePointCloudStore.setState({
      colorMode: 'rgb',
      showSplats: false,
      pointSize: 5,
      pointOpacity: 0.65,
    });

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile,
      imagesFile,
      points3DFile,
      splatFile: secondSplatFile,
      splatFiles: [firstSplatFile, secondSplatFile],
      imageFiles,
      hasMasks: false,
    });

    expect(usePointCloudStore.getState().colorMode).toBe('rgb');
    expect(usePointCloudStore.getState().showSplats).toBe(false);
    expect(usePointCloudStore.getState().pointSize).toBe(5);
    expect(usePointCloudStore.getState().pointOpacity).toBe(0.65);
  });

  it('resolves a requested active splat source when loaded files arrive', () => {
    const camerasFile = new File([''], 'cameras.bin');
    const imagesFile = new File([''], 'images.bin');
    const points3DFile = new File([''], 'points3D.bin');
    const defaultSplatFile = new File(['splat-a'], 'scene-a.spz');
    const requestedSplatFile = new File(['splat-b'], 'scene-b.spz');
    const imageFiles = new Map<string, File>();

    useReconstructionStore.getState().setRequestedSplatSourceId('splats/scene-b.spz');

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile,
      imagesFile,
      points3DFile,
      splatFile: defaultSplatFile,
      splatFiles: [defaultSplatFile, requestedSplatFile],
      splatFileSources: [
        { id: 'splats/scene-a.spz', path: 'splats/scene-a.spz', file: defaultSplatFile },
        { id: 'splats/scene-b.spz', path: 'splats/scene-b.spz', file: requestedSplatFile },
      ],
      imageFiles,
      hasMasks: false,
    });

    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(requestedSplatFile);
    expect(useReconstructionStore.getState().requestedSplatSourceId).toBeNull();
  });

  it('applies splat point defaults when a splat is added to an already loaded dataset', () => {
    const camerasFile = new File([''], 'cameras.bin');
    const imagesFile = new File([''], 'images.bin');
    const points3DFile = new File([''], 'points3D.bin');
    const imageFiles = new Map<string, File>();
    const splatFile = new File(['splat'], 'scene.spz');

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile,
      imagesFile,
      points3DFile,
      imageFiles,
      hasMasks: false,
    });
    usePointCloudStore.setState({ pointSize: 5, pointOpacity: 0.65 });

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile,
      imagesFile,
      points3DFile,
      splatFile,
      splatFiles: [splatFile],
      imageFiles,
      hasMasks: false,
    });

    expect(usePointCloudStore.getState().colorMode).toBe('splatPoints');
    expect(usePointCloudStore.getState().pointSize).toBe(1);
    expect(usePointCloudStore.getState().pointOpacity).toBe(0.2);
  });

  it('resets accumulated splat transform when a new dataset is loaded', () => {
    useTransformStore.getState().setSplatTransform({
      scale: 2,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      translationX: 1,
      translationY: 0,
      translationZ: 0,
    });

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile: new File([''], 'cameras.bin'),
      imagesFile: new File([''], 'images.bin'),
      points3DFile: new File([''], 'points3D.bin'),
      splatFile: new File(['splat'], 'scene.spz'),
      imageFiles: new Map(),
      hasMasks: false,
    });

    expect(useTransformStore.getState().splatTransform).toMatchObject({
      scale: 1,
      translationX: 0,
    });
  });

  it('preserves accumulated splat transform when only the active splat file changes', () => {
    const camerasFile = new File([''], 'cameras.bin');
    const imagesFile = new File([''], 'images.bin');
    const points3DFile = new File([''], 'points3D.bin');
    const firstSplatFile = new File(['splat-a'], 'scene-a.spz');
    const secondSplatFile = new File(['splat-b'], 'scene-b.spz');
    const imageFiles = new Map<string, File>();

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile,
      imagesFile,
      points3DFile,
      splatFile: firstSplatFile,
      splatFiles: [firstSplatFile],
      imageFiles,
      hasMasks: false,
    });
    useTransformStore.getState().setSplatTransform({
      scale: 2,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      translationX: 1,
      translationY: 0,
      translationZ: 0,
    });

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile,
      imagesFile,
      points3DFile,
      splatFile: secondSplatFile,
      splatFiles: [firstSplatFile, secondSplatFile],
      imageFiles,
      hasMasks: false,
    });

    expect(useTransformStore.getState().splatTransform).toMatchObject({
      scale: 2,
      translationX: 1,
    });
  });
});

describe('reconstruction store lazy splat source switching', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    usePointCloudStore.setState(usePointCloudStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function baseLoadedFiles(overrides: Partial<LoadedFiles>): LoadedFiles {
    return {
      camerasFile: new File([''], 'cameras.bin'),
      imagesFile: new File([''], 'images.bin'),
      points3DFile: new File([''], 'points3D.bin'),
      imageFiles: new Map(),
      hasMasks: false,
      ...overrides,
    };
  }

  it('activates a downloaded splat source and offloads the previous one', async () => {
    const fileA = new File(['a'], 'a.ply');
    const fileB = new File(['b'], 'b.ply');
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({
      splatFile: fileA,
      splatFiles: [fileA, fileB],
      splatFileSources: [
        { id: 'splats/a.ply', path: 'splats/a.ply', url: 'https://x/splats/a.ply', file: fileA },
        { id: 'splats/b.ply', path: 'splats/b.ply', url: 'https://x/splats/b.ply', file: fileB },
      ],
    }));

    await useReconstructionStore.getState().selectSplatSource('splats/b.ply');

    const loadedFiles = useReconstructionStore.getState().loadedFiles;
    expect(loadedFiles?.splatFile).toBe(fileB);
    expect(loadedFiles?.splatFileSources?.find((s) => s.id === 'splats/a.ply')?.file).toBeUndefined();
  });

  it('fetches a lazy splat source on demand, activates it, and offloads the previous tile', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['splat-bytes']), { status: 200 })));
    const fileA = new File(['a'], 'a.ply');
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({
      splatFile: fileA,
      splatFiles: [fileA],
      splatFileSources: [
        { id: 'splats/a.ply', path: 'splats/a.ply', url: 'https://x/splats/a.ply', file: fileA },
        { id: 'splats/b.ply', path: 'splats/b.ply', url: 'https://x/splats/b.ply' },
      ],
    }));

    await useReconstructionStore.getState().selectSplatSource('splats/b.ply');

    const loadedFiles = useReconstructionStore.getState().loadedFiles;
    expect(loadedFiles?.splatFile?.name).toBe('b.ply');
    expect(loadedFiles?.splatFileSources?.find((s) => s.id === 'splats/b.ply')?.file).toBeDefined();
    expect(loadedFiles?.splatFileSources?.find((s) => s.id === 'splats/a.ply')?.file).toBeUndefined();
  });

  // Registers a controllable fetch per URL so tests can resolve/reject lazy
  // splat downloads out of order.
  function stubDeferredFetch(): Map<string, { resolve: (r: Response) => void; reject: (e: unknown) => void }> {
    const deferreds = new Map<string, { resolve: (r: Response) => void; reject: (e: unknown) => void }>();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (url: string) =>
          new Promise<Response>((resolve, reject) => {
            deferreds.set(url, { resolve, reject });
          })
      )
    );
    return deferreds;
  }

  function threeLazySources() {
    const fileA = new File(['a'], 'a.ply');
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({
      splatFile: fileA,
      splatFiles: [fileA],
      splatFileSources: [
        { id: 'splats/a.ply', path: 'splats/a.ply', url: 'https://x/splats/a.ply', file: fileA },
        { id: 'splats/b.ply', path: 'splats/b.ply', url: 'https://x/splats/b.ply' },
        { id: 'splats/c.ply', path: 'splats/c.ply', url: 'https://x/splats/c.ply' },
      ],
    }));
  }

  it('latest-wins: an out-of-order lazy fetch does not overwrite a newer selection', async () => {
    const deferreds = stubDeferredFetch();
    threeLazySources();

    // Click B (slow), then C (fast).
    const pB = useReconstructionStore.getState().selectSplatSource('splats/b.ply');
    const pC = useReconstructionStore.getState().selectSplatSource('splats/c.ply');

    // C resolves first and wins; B resolves later and must be ignored.
    deferreds.get('https://x/splats/c.ply')!.resolve(new Response(new Blob(['c']), { status: 200 }));
    await pC;
    deferreds.get('https://x/splats/b.ply')!.resolve(new Response(new Blob(['b']), { status: 200 }));
    await pB;

    expect(useReconstructionStore.getState().loadedFiles?.splatFile?.name).toBe('c.ply');
    expect(useReconstructionStore.getState().requestedSplatSourceId).toBe('splats/c.ply');
  });

  it('latest-wins: a superseded fetch failure does not clobber the winner', async () => {
    const deferreds = stubDeferredFetch();
    threeLazySources();

    const pB = useReconstructionStore.getState().selectSplatSource('splats/b.ply');
    const pC = useReconstructionStore.getState().selectSplatSource('splats/c.ply');

    deferreds.get('https://x/splats/c.ply')!.resolve(new Response(new Blob(['c']), { status: 200 }));
    await pC;
    // B (already superseded) fails late — must not surface an error over C.
    deferreds.get('https://x/splats/b.ply')!.reject(new Error('network down'));
    await pB;

    expect(useReconstructionStore.getState().loadedFiles?.splatFile?.name).toBe('c.ply');
    expect(useReconstructionStore.getState().urlError).toBeNull();
  });

  it('COLMAP-only supersedes an in-flight lazy fetch and clears the loading indicator', async () => {
    const deferreds = stubDeferredFetch();
    threeLazySources();

    const pB = useReconstructionStore.getState().selectSplatSource('splats/b.ply');
    expect(useReconstructionStore.getState().urlLoading).toBe(true);

    // Switch to COLMAP-only while B is still downloading.
    await useReconstructionStore.getState().selectSplatSource('');
    expect(useReconstructionStore.getState().urlLoading).toBe(false);
    expect(useReconstructionStore.getState().urlProgress).toBeNull();
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();

    // B resolves late — must not re-activate or re-show the loading overlay.
    deferreds.get('https://x/splats/b.ply')!.resolve(new Response(new Blob(['b']), { status: 200 }));
    await pB;
    expect(useReconstructionStore.getState().urlLoading).toBe(false);
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
  });

  it('sets an error and stops loading when a (non-superseded) lazy fetch fails', async () => {
    const deferreds = stubDeferredFetch();
    threeLazySources();

    const pB = useReconstructionStore.getState().selectSplatSource('splats/b.ply');
    deferreds.get('https://x/splats/b.ply')!.reject(new Error('boom'));
    await pB;

    expect(useReconstructionStore.getState().urlLoading).toBe(false);
    expect(useReconstructionStore.getState().urlProgress).toBeNull();
    expect(useReconstructionStore.getState().urlError?.message).toBe('Failed to load splat');
    // The previously active tile is left intact.
    expect(useReconstructionStore.getState().loadedFiles?.splatFile?.name).toBe('a.ply');
  });

  it('clears the active splat (COLMAP only) when selecting the empty source', async () => {
    const fileA = new File(['a'], 'a.ply');
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({
      splatFile: fileA,
      splatFiles: [fileA],
      splatFileSources: [{ id: 'a', path: 'a.ply', url: 'u/a', file: fileA }],
    }));

    await useReconstructionStore.getState().selectSplatSource('');

    const loadedFiles = useReconstructionStore.getState().loadedFiles;
    expect(loadedFiles?.splatFile).toBeUndefined();
    expect(loadedFiles?.splatFileSources?.find((s) => s.id === 'a')?.file).toBeUndefined();
  });

  it('switches to a splat display mode when activating a downloaded splat from COLMAP-only', async () => {
    const fileB = new File(['b'], 'b.ply');
    // COLMAP-only: the source has a downloaded file but no active splatFile yet.
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({
      splatFileSources: [{ id: 'splats/b.ply', path: 'splats/b.ply', file: fileB }],
    }));
    usePointCloudStore.setState({ colorMode: 'rgb', showSplats: false });

    await useReconstructionStore.getState().selectSplatSource('splats/b.ply');

    expect(usePointCloudStore.getState().colorMode).toBe('splatPoints');
    expect(usePointCloudStore.getState().showSplats).toBe(true);
  });

  it('switches to a splat display mode when a lazy splat is activated', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['b']), { status: 200 })));
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({
      splatFileSources: [{ id: 'splats/b.ply', path: 'splats/b.ply', url: 'https://x/splats/b.ply' }],
    }));
    usePointCloudStore.setState({ colorMode: 'rgb', showSplats: false });

    await useReconstructionStore.getState().selectSplatSource('splats/b.ply');

    expect(usePointCloudStore.getState().colorMode).toBe('splatPoints');
    expect(usePointCloudStore.getState().showSplats).toBe(true);
  });

  it('preserves the display mode when switching between splat tiles', async () => {
    const fileA = new File(['a'], 'a.ply');
    const fileB = new File(['b'], 'b.ply');
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({
      splatFile: fileA,
      splatFiles: [fileA, fileB],
      splatFileSources: [
        { id: 'splats/a.ply', path: 'splats/a.ply', file: fileA },
        { id: 'splats/b.ply', path: 'splats/b.ply', file: fileB },
      ],
    }));
    // A splat is already active; the user has since chosen a non-splat mode.
    usePointCloudStore.setState({ colorMode: 'rgb' });

    await useReconstructionStore.getState().selectSplatSource('splats/b.ply');

    expect(usePointCloudStore.getState().colorMode).toBe('rgb');
  });

  it('merges a remote splat catalog into lazy sources', () => {
    const fileA = new File(['a'], 'a.ply');
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({
      splatFile: fileA,
      splatFiles: [fileA],
      splatFileSources: [{ id: 'splats/a.ply', path: 'splats/a.ply', file: fileA }],
    }));

    useReconstructionStore.getState().mergeRemoteSplatCatalog(
      [{ path: 'splats/a.ply', size: 10 }, { path: 'splats/b.ply', size: 20 }],
      'https://x/ds'
    );

    const sources = useReconstructionStore.getState().loadedFiles?.splatFileSources ?? [];
    expect(sources.map((s) => s.id)).toEqual(['splats/a.ply', 'splats/b.ply']);
    expect(sources.find((s) => s.id === 'splats/a.ply')?.file).toBe(fileA);
    expect(sources.find((s) => s.id === 'splats/b.ply')?.url).toBe('https://x/ds/splats/b.ply');
    expect(sources.find((s) => s.id === 'splats/b.ply')?.file).toBeUndefined();
  });

  it('opens the splat picker when multiple splats are merged with none active', () => {
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({ splatFileSources: [] }));
    expect(useReconstructionStore.getState().showSplatPicker).toBe(false);

    useReconstructionStore.getState().mergeRemoteSplatCatalog(
      [{ path: 'splats/a.ply', size: 10 }, { path: 'splats/b.ply', size: 20 }],
      'https://x/ds'
    );

    expect(useReconstructionStore.getState().showSplatPicker).toBe(true);
    useReconstructionStore.getState().setShowSplatPicker(false);
    expect(useReconstructionStore.getState().showSplatPicker).toBe(false);
  });
});
