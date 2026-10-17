import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { openArchiveReader } from '../archive/archiveService';
import { buildArchiveEntry, buildArchiveReader, buildFile } from '../test/builders';
import { hfAuth } from '../features/huggingface/auth';
import { downloadZip, type ZipProgressCallback } from './zipDownload';
import { isArchiveFile, isArchiveUrl, loadZipFromFile, loadZipFromUrl, findZipEntry } from './zipLoader';
import { appLogger } from './logger';
import type { ArchiveReader } from '../archive/types';
import { archiveError, REMOTE_ARCHIVE_RANGE_THRESHOLD } from '../archive/protocol';

vi.mock('../archive/archiveService', () => ({ openArchiveReader: vi.fn() }));
const openArchive = vi.mocked(openArchiveReader) as unknown as Mock<(file: File) => Promise<ArchiveReader>>;
vi.mock('./zipDownload', async (importOriginal) => ({
  ...await importOriginal<typeof import('./zipDownload')>(),
  downloadZip: vi.fn(),
}));

describe('archive routing and bounded range failure', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
  it('does not replace a failed multi-gigabyte range index with a whole download',async()=>{
    openArchive.mockRejectedValueOnce(archiveError('No validated ranges.','ArchiveRangeUnsupportedError'));
    await expect(loadZipFromUrl('https://example.test/large.zip',vi.fn(),undefined,{size:3*1024**3})).rejects.toMatchObject({name:'ArchiveLocalAccessRequiredError',message:expect.stringContaining('local file')});
    expect(downloadZip).not.toHaveBeenCalled();
  });
  it('does not download a range-rejected archive as a hidden recovery attempt',async()=>{
    openArchive.mockRejectedValueOnce(archiveError('Range rejected.','ArchiveRangeRejectedError'));
    await expect(loadZipFromUrl('https://example.test/large.zip',vi.fn(),undefined,{size:13_721_139_139})).rejects.toMatchObject({name:'ArchiveRangeRejectedError'});
    expect(downloadZip).not.toHaveBeenCalled();
  });
  it('recognizes Zenodo content URLs and accepts a filename hint without inventing size metadata', async () => {
    expect(isArchiveUrl('https://zenodo.org/api/records/1/files/scene.zip/content')).toBe(true);
    const fetchImpl=vi.fn(async()=>new Response(null,{headers:{'content-length':'7'}}));
    vi.mocked(downloadZip).mockResolvedValue(new Blob(['archive']));
    openArchive.mockResolvedValue(buildArchiveReader({getFilesArray:async()=>colmapEntries()}));
    const result=await loadZipFromUrl('https://example.test/content',vi.fn(),undefined,{filename:'scene.zip',fetchImpl});
    expect(result.archive).toBeDefined();expect(fetchImpl).toHaveBeenCalled();
    expect(openArchive.mock.calls.at(-1)?.[0].name).toBe('scene.zip');
  });
  it('cancels a range-ignored oversized tar.gz body without starting a full download', async () => {
    const cancel=vi.fn();
    const fetchImpl=vi.fn(async()=>new Response(new ReadableStream<Uint8Array>({cancel}),{status:200}));
    vi.mocked(downloadZip).mockClear();
    await expect(loadZipFromUrl('https://example.test/scene.tar.gz',vi.fn(),undefined,{size:3*1024*1024*1024,fetchImpl})).rejects.toMatchObject({name:'ArchiveRangeUnsupportedError'});
    expect(cancel).toHaveBeenCalled();expect(downloadZip).not.toHaveBeenCalled();
  });
});

function colmapEntries() {
  return ['cameras.bin', 'images.bin', 'points3D.bin'].map((name) => ({
    path: 'sparse/0',
    file: buildArchiveEntry({ name }),
  }));
}

describe.each(['local', 'url'] as const)('%s archive reader ownership', (source) => {
  const load = (onProgress: ZipProgressCallback = vi.fn()) => source === 'local'
    ? loadZipFromFile(buildFile('dataset.zip'), onProgress)
    : loadZipFromUrl('https://example.com/dataset.zip', onProgress);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(downloadZip).mockResolvedValue(new Blob(['archive']));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })));
  });

  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('keeps media inside a selected nested model beneath another native scene',async()=>{
    const photo=buildArchiveEntry({name:'a.png'});
    openArchive.mockResolvedValue(buildArchiveReader({getFilesArray:async()=>[
      ...colmapEntries().map(entry=>({...entry,path:'outer/colmap'})),
      ...colmapEntries().map(entry=>({...entry,path:'outer/inner/sparse/0'})),
      {path:'outer/inner/images',file:photo},
    ]}));
    const result=await load();
    expect(result.imageIndex.get('outer/inner/images/a.png')).toBe(photo);
    expect(result.imageCount).toBe(1);
  });

  it('rejects a model assembled from incomplete files in unrelated directories',async()=>{
    const close=vi.fn(async()=>{});
    openArchive.mockResolvedValue(buildArchiveReader({getFilesArray:async()=>colmapEntries().map((entry,index)=>({...entry,path:['a','b','c'][index]+'/sparse/0'})),close}));
    await expect(load()).rejects.toThrow(/does not contain valid COLMAP/);
    expect(close).toHaveBeenCalledOnce();
  });

  it('extracts one complete native model from distinct roots that share sparse/0',async()=>{
    const firstImages=buildFile('images.bin','first'),secondImages=buildFile('images.bin','second');
    const model=(root: string,imageFile: File)=>colmapEntries().map(entry=>({path:root+'/'+entry.path,file:buildArchiveEntry({name:entry.file.name,extract:async()=>entry.file.name==='images.bin' ? imageFile : buildFile(entry.file.name)})}));
    const firstPhoto=buildArchiveEntry({name:'a.png'}),secondPhoto=buildArchiveEntry({name:'a.png'}),foreignSettings=vi.fn(async()=>buildFile('colmapview.yaml'));
    openArchive.mockResolvedValue(buildArchiveReader({getFilesArray:async()=>[
      ...model('a',firstImages),...model('b',secondImages),
      {path:'a/images',file:firstPhoto},{path:'b/images',file:secondPhoto},
      {path:'b',file:buildArchiveEntry({name:'colmapview.yaml',extract:foreignSettings})},
      {path:'b/masks',file:buildArchiveEntry({name:'a.png.png'})},
    ]}));
    const result=await load();
    expect(result.colmapFiles.get('sparse/0/images.bin')).toBe(firstImages);
    expect(findZipEntry('a.png',result.imageIndex)).toBe(firstPhoto);
    expect(foreignSettings).not.toHaveBeenCalled();
    expect(findZipEntry('masks/a.png.png',result.imageIndex)).toBeNull();
    expect(result.imageCount).toBe(1);
  });

  it('resolves original native image paths before ambiguous suffix aliases',async()=>{
    const deep=buildArchiveEntry({name:'a.png'}),shallow=buildArchiveEntry({name:'a.png'});
    openArchive.mockResolvedValue(buildArchiveReader({getFilesArray:async()=>[
      ...colmapEntries(),{path:'images/images/nested',file:deep},{path:'images/nested',file:shallow},
    ]}));
    const result=await load();
    expect(findZipEntry('images/nested/a.png',result.imageIndex)).toBe(deep);
    expect(findZipEntry('nested/a.png',result.imageIndex)).toBe(shallow);
  });

  it('rejects equivalent archive source paths and closes the uncommitted reader',async()=>{
    const close=vi.fn(async()=>{});
    openArchive.mockResolvedValue(buildArchiveReader({getFilesArray:async()=>[
      {path:'scene',file:buildArchiveEntry({name:'transforms.json'})},
      {path:'scene/images',file:buildArchiveEntry({name:'a.png'})},
      {path:'scene/images/.',file:buildArchiveEntry({name:'a.png'})},
    ],close}));
    await expect(load()).rejects.toThrow(/Duplicate source path/);
    expect(close).toHaveBeenCalledOnce();
  });

  it('keeps a successfully loaded reader open for lazy image extraction', async () => {
    const image = buildArchiveEntry({ name: 'photo.jpg' });
    const close = vi.fn(async () => {});
    const archive = buildArchiveReader({
      getFilesArray: async () => [...colmapEntries(), { path: 'images', file: image }],
      close,
    });
    openArchive.mockResolvedValue(archive);

    const result = await load();

    expect(result.archive).toBe(archive);
    expect(result.colmapFiles.size).toBe(3);
    expect(result.imageIndex.get('images/photo.jpg')).toBe(image);
    expect(result.imageCount).toBe(1);
    expect(close).not.toHaveBeenCalled();
  });

  it('closes the reader when listing entries fails and preserves the original error', async () => {
    const error = new Error('corrupt directory');
    const close = vi.fn().mockRejectedValue(new Error('close failed'));
    openArchive.mockResolvedValue(buildArchiveReader({
      getFilesArray: vi.fn().mockRejectedValue(error),
      close,
    }));

    await expect(load()).rejects.toBe(error);
    expect(close).toHaveBeenCalledOnce();
  });

  it('extracts project settings from a wrapped archive and leaves unrelated YAML alone', async () => {
    const settings = buildFile('colmapview.yaml', 'ui:\n  background_color: "#123456"');
    const unrelated = buildArchiveEntry({ name: 'training.yaml', extract: vi.fn() });
    openArchive.mockResolvedValue(buildArchiveReader({ getFilesArray: async () => [
      ...colmapEntries(), { path: 'project', file: buildArchiveEntry({ name: 'colmapview.yaml', extract: async () => settings }) },
      { path: 'project', file: unrelated },
    ] }));
    const result = await load();
    expect(result.colmapFiles.get('project/colmapview.yaml')).toBe(settings);
    expect(unrelated.extract).not.toHaveBeenCalled();
  });

  it.each(['oversized', 'unreadable'] as const)('skips %s optional archive settings', async mode => {
    const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);
    const extract = vi.fn().mockRejectedValue(new Error('Read failed'));
    openArchive.mockResolvedValue(buildArchiveReader({ getFilesArray: async () => [
      ...colmapEntries(), { path: '', file: buildArchiveEntry({ name: 'colmapview.yaml', size: mode === 'oversized' ? 300000 : 4, extract }) },
    ] }));
    const result = await load();
    expect(result.colmapFiles.size).toBe(3);
    if (mode === 'oversized') expect(extract).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledExactlyOnceWith('[Archive Loader] Skipping unavailable or oversized colmapview.yaml settings.');
  });

  it('closes the reader when extraction fails', async () => {
    const error = new Error('corrupt entry');
    const entries = colmapEntries();
    entries[0].file.extract = vi.fn().mockRejectedValue(error);
    const close = vi.fn(async () => {});
    openArchive.mockResolvedValue(buildArchiveReader({
      getFilesArray: async () => entries,
      close,
    }));

    await expect(load()).rejects.toBe(error);
    expect(close).toHaveBeenCalledOnce();
  });

  it('closes the reader when required COLMAP files are missing', async () => {
    const close = vi.fn(async () => {});
    openArchive.mockResolvedValue(buildArchiveReader({ close }));

    await expect(load()).rejects.toThrow('does not contain valid COLMAP files');
    expect(close).toHaveBeenCalledOnce();
  });

  it('closes the reader if extraction progress throws', async () => {
    const close = vi.fn(async () => {});
    openArchive.mockResolvedValue(buildArchiveReader({
      getFilesArray: async () => colmapEntries(),
      close,
    }));

    await expect(load((progress) => {
      if (progress.percent >= 60) throw new Error('progress failed');
    })).rejects.toThrow('progress failed');
    expect(close).toHaveBeenCalledOnce();
  });

  it('stops waiting on a cancelled archive open and closes the reader that arrives later', async () => {
    const controller = new AbortController();
    const close = vi.fn(async () => {});
    const getFilesArray = vi.fn(async () => colmapEntries());
    let resolve!: (reader: ReturnType<typeof buildArchiveReader>) => void;
    openArchive.mockImplementation(() => new Promise(done => { resolve = done; }));
    const pending = source === 'local'
      ? loadZipFromFile(buildFile('scene.tar'), vi.fn(), controller.signal)
      : loadZipFromUrl('https://example.com/scene.tar', vi.fn(), controller.signal);
    await vi.waitFor(() => expect(openArchiveReader).toHaveBeenCalledOnce());
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    resolve(buildArchiveReader({ close, getFilesArray }));
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(getFilesArray).not.toHaveBeenCalled();
  });

  it('closes the native reader immediately during cancellation of pending extraction', async () => {
    const controller = new AbortController();
    let resolve!: (file: File) => void;
    const entries = colmapEntries();
    const extract = vi.fn(() => new Promise<File>(done => { resolve = done; }));
    entries[0].file.extract = extract;
    const secondExtract = vi.spyOn(entries[1].file, 'extract');
    const close = vi.fn(async () => {});
    openArchive.mockResolvedValue(buildArchiveReader({ close, getFilesArray: async () => entries }));
    const progress = vi.fn();
    const pending = source === 'local'
      ? loadZipFromFile(buildFile('scene.zip'), progress, controller.signal)
      : loadZipFromUrl('https://example.com/scene.zip', progress, controller.signal);
    await vi.waitFor(() => expect(extract).toHaveBeenCalledOnce());
    controller.abort();
    expect(close).toHaveBeenCalledOnce();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    const progressCount = progress.mock.calls.length;
    resolve(buildFile('cameras.bin'));
    await Promise.resolve();
    await Promise.resolve();
    expect(secondExtract).not.toHaveBeenCalled();
    expect(progress).toHaveBeenCalledTimes(progressCount);
    expect(close).toHaveBeenCalledOnce();
  });

  if (source === 'url') {
    it('uses Drive metadata for archive naming and size instead of a HEAD request', async () => {
      const archive = buildArchiveReader({ getFilesArray: async () => colmapEntries() });
      openArchive.mockResolvedValue(archive);
      const fetchImpl = vi.fn();
      const signal = new AbortController().signal;
      const result = await loadZipFromUrl('https://www.googleapis.com/drive/v3/files/file123?alt=media', vi.fn(), signal,
        { filename: 'reconstruction.tar', size: 7, fetchImpl });
      expect(result.archive).toBe(archive);
      expect(fetch).not.toHaveBeenCalled();
      expect(downloadZip).toHaveBeenCalledWith(expect.any(String), expect.any(Function), expect.objectContaining({ signal, expectedSize: 7, fetchImpl }));
      expect(openArchive.mock.calls[0][0].name).toBe('reconstruction.tar');
    });

    it('closes a reader opened after its URL load is cancelled', async () => {
      const controller = new AbortController();
      const close = vi.fn(async () => {});
      const getFilesArray = vi.fn(async () => colmapEntries());
      openArchive.mockImplementation(async () => {
        controller.abort();
        return buildArchiveReader({ close, getFilesArray });
      });

      await expect(loadZipFromUrl('https://example.com/dataset.zip', vi.fn(), controller.signal))
        .rejects.toMatchObject({ name: 'AbortError' });
      expect(close).toHaveBeenCalledOnce();
      expect(getFilesArray).not.toHaveBeenCalled();
    });
  }
});

describe('isArchiveFile', () => {
  it('treats a dropped SOG as a splat, never as a dataset archive, even with a ZIP MIME type', () => {
    // A SOG bundle is itself a ZIP; routing it to the archive loader would look
    // for COLMAP files inside it instead of rendering it.
    expect(isArchiveFile(new File(['PK'], 'scene.sog', { type: 'application/zip' }))).toBe(false);
    expect(isArchiveFile(new File(['PK'], 'dataset.zip', { type: 'application/zip' }))).toBe(true);
  });
});

describe('indexed remote archive loading', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  it.each(['zip', 'tar'])('uses a remote %s index instead of buffering the whole archive', async extension => {
    vi.clearAllMocks();
    const archive = buildArchiveReader({ getFilesArray: async () => colmapEntries() });
    vi.mocked(openArchiveReader).mockResolvedValue(archive);
    const fetchImpl = vi.fn(), size = REMOTE_ARCHIVE_RANGE_THRESHOLD + 1;
    const result = await loadZipFromUrl('https://example.test/archive', vi.fn(), undefined, { filename: `scene.${extension}`, size, fetchImpl });
    expect(result.archive).toBe(archive); expect(result.fileSize).toBe(size);
    expect(openArchiveReader).toHaveBeenCalledWith({ kind: 'remote', name: `scene.${extension}`, size }, expect.objectContaining({ read: expect.any(Function) }));
    expect(downloadZip).not.toHaveBeenCalled();
  });
  it('falls back for servers without validated ranges but preserves changed-file and provider errors', async () => {
    vi.clearAllMocks();
    const archive = buildArchiveReader({ getFilesArray: async () => colmapEntries() });
    vi.mocked(openArchiveReader).mockRejectedValueOnce(archiveError('No ranges', 'ArchiveRangeUnsupportedError')).mockResolvedValueOnce(archive);
    vi.mocked(downloadZip).mockResolvedValue(new Blob(['archive']));
    const options = { filename: 'scene.zip', size: REMOTE_ARCHIVE_RANGE_THRESHOLD + 1, fetchImpl: vi.fn() };
    expect((await loadZipFromUrl('https://example.test/archive', vi.fn(), undefined, options)).archive).toBe(archive);
    expect(downloadZip).toHaveBeenCalledOnce();
    vi.clearAllMocks();
    vi.mocked(openArchiveReader).mockRejectedValueOnce(new Error('Archive changed while reading'));
    await expect(loadZipFromUrl('https://example.test/archive', vi.fn(), undefined, options)).rejects.toThrow('Archive changed');
    expect(downloadZip).not.toHaveBeenCalled();
  });
});

describe('private Hugging Face archive URLs', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('checks the archive size with the signed-in account before downloading', async () => {
    const url = 'https://huggingface.co/datasets/owner/private/resolve/main/scene.zip';
    vi.spyOn(hfAuth, 'getSnapshot').mockReturnValue({ status: 'connected', identity: { username: 'owner' }, error: null });
    vi.spyOn(hfAuth, 'getReadAccessToken').mockReturnValue('reader-token');
    const request = vi.fn(async (_url: string, init?: RequestInit) =>
      new Headers(init?.headers).get('Authorization') === 'Bearer reader-token'
        ? new Response(null, { status: 200, headers: { 'content-length': '7' } })
        : new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', request);
    vi.mocked(downloadZip).mockResolvedValue(new Blob(['archive']));
    const archive = buildArchiveReader({ getFilesArray: async () => colmapEntries() });
    openArchive.mockResolvedValue(archive);

    await expect(loadZipFromUrl(url, vi.fn())).resolves.toMatchObject({ archive });
    const heads = request.mock.calls.filter(([, init]) => init?.method === 'HEAD');
    expect(heads).toHaveLength(2);
    expect(new Headers(heads[1][1]?.headers).get('Authorization')).toBe('Bearer reader-token');
  });

  it('reports an expired connection from the size check instead of downloading anonymously', async () => {
    const url = 'https://huggingface.co/datasets/owner/private/resolve/main/scene.zip';
    vi.spyOn(hfAuth, 'getSnapshot').mockReturnValue({ status: 'connected', identity: { username: 'owner' }, error: null });
    vi.spyOn(hfAuth, 'getReadAccessToken').mockReturnValue('expired-token');
    const expire = vi.spyOn(hfAuth, 'expire').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })));
    vi.mocked(downloadZip).mockClear();
    vi.mocked(downloadZip).mockResolvedValue(new Blob(['archive']));
    openArchive.mockResolvedValue(buildArchiveReader({ getFilesArray: async () => colmapEntries() }));

    await expect(loadZipFromUrl(url, vi.fn())).rejects.toMatchObject({ name: 'HfError', status: 401,
      message: expect.stringContaining('connection expired') });
    expect(expire).toHaveBeenCalledOnce();
    expect(downloadZip).not.toHaveBeenCalled();
  });
});
