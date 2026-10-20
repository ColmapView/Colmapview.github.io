import { afterEach, describe, expect, it, vi } from 'vitest';
import { NativeArchiveBackend, type NativeWasmModule } from './nativeArchive';
import { buildReadableFile, readBlobAsArrayBuffer } from '../test/builders';

const factory = vi.hoisted(() => vi.fn());
vi.mock('libarchive.js/src/webworker/wasm-gen/libarchive.js', () => ({ default: factory }));
vi.mock('libarchive.js/src/webworker/wasm-module.js', () => ({ WasmModule: class {} }));
afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks(); });
function native() {
  let index = 0;
  const wasm: NativeWasmModule = { HEAPU8: new Uint8Array(1024), initFunctions: vi.fn(), runCode: {
    malloc: vi.fn(() => 1), free: vi.fn(), openArchive: vi.fn(() => { index = 0; return 100; }),
    getNextEntry: vi.fn(() => ++index <= 2 ? index : 0), getEntryType: vi.fn(entry => entry === 1 ? 16384 : 32768),
    getEntryName: vi.fn(entry => entry === 1 ? 'images/' : 'images/photo.jpg'), getEntrySize: vi.fn(() => 3),
    getEntryLastModified: vi.fn(() => 0), skipEntry: vi.fn(), getFileData: vi.fn(() => 500), getError: vi.fn(() => 'Invalid archive data'),
    closeArchive: vi.fn(),
  } };
  wasm.HEAPU8.set([9, 8, 7], 500); factory.mockResolvedValue(wasm);
  return wasm;
}
describe('archive compatibility codec', () => {
  it('preserves case-distinct paths when listing compatibility archives', async () => {
    const wasm = native(), paths = ['images/café.JPG', 'images/café.jpg'];
    vi.mocked(wasm.runCode.getEntryType).mockReturnValue(32768);
    vi.mocked(wasm.runCode.getEntryName).mockImplementation(entry => paths[entry - 1]);
    const reader = await NativeArchiveBackend.open(buildReadableFile({ name: 'scene.7z', contents: 'archive' }), '/workers/libarchive.wasm');
    expect((await reader.list(new AbortController().signal)).map(entry => entry.path)).toEqual(paths);
    await reader.close();
  });
  it('rejects duplicate exact paths and closes its native handle', async () => {
    const wasm = native();
    vi.mocked(wasm.runCode.getEntryType).mockReturnValue(32768);
    vi.mocked(wasm.runCode.getEntryName).mockReturnValue('images/photo.jpg');
    const reader = await NativeArchiveBackend.open(buildReadableFile({ name: 'scene.7z', contents: 'archive' }), '/workers/libarchive.wasm');
    await expect(reader.list(new AbortController().signal)).rejects.toThrow(/duplicate/i);
    expect(wasm.runCode.closeArchive).toHaveBeenCalledOnce();
    await reader.close();
  });
  it('closes every native scan and frees owned memory once, while returning independent file bytes', async () => {
    const wasm = native(), reader = await NativeArchiveBackend.open(buildReadableFile({ name: 'scene.tar.xz', contents: 'archive' }), 'https://viewer.test/workers/libarchive.wasm');
    expect(factory.mock.calls[0][0].locateFile()).toBe('https://viewer.test/workers/libarchive.wasm');
    expect((await reader.list(new AbortController().signal)).map(entry => entry.path)).toEqual(['images/photo.jpg']);
    const file = await reader.extract('images/photo.jpg', new AbortController().signal);
    expect(wasm.runCode.closeArchive).toHaveBeenCalledTimes(2); expect(wasm.runCode.free).toHaveBeenCalledWith(500);
    wasm.HEAPU8.fill(0); await reader.close(); await reader.close();
    expect(wasm.runCode.free).toHaveBeenCalledTimes(2); expect(wasm.runCode.free).toHaveBeenLastCalledWith(1);
    expect(Array.from(new Uint8Array(await readBlobAsArrayBuffer(file)))).toEqual([9, 8, 7]);
  });
  it('closes native handles on extraction failure and invalid metadata', async () => {
    const wasm = native(), reader = await NativeArchiveBackend.open(buildReadableFile({ name: 'scene.7z', contents: 'archive' }), '/workers/libarchive.wasm');
    vi.mocked(wasm.runCode.getFileData).mockReturnValue(-1);
    await expect(reader.extract('images/photo.jpg', new AbortController().signal)).rejects.toThrow('Invalid archive data');
    vi.mocked(wasm.runCode.getEntrySize).mockReturnValue(-1);
    await expect(reader.list(new AbortController().signal)).rejects.toThrow('invalid size');
    expect(wasm.runCode.closeArchive).toHaveBeenCalledTimes(2); await reader.close();
  });
});
