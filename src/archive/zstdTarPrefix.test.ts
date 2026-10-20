import { File as NativeFile } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractZstdTarPrefix } from './zstdTarPrefix';
import { MAX_GEOMETRY_MEMBER_BYTES, MAX_GEOMETRY_PREFIX_BYTES } from './geometryLimits';

// Python zstandard: a flushed block containing a directory and one TAR file, without closing the archive/frame.
const prefixBase64 = "KLUv/QBYFAYAEsshHYC1zQFowjapbev3Mba0vzMD04OBm0jJB46TVuo76Jk+pv90KpyFsUBPfvro5DSi1WPpIeBQFGnDBBTVHTh0vetgaApewm4tDPFzq23ZhtIJdasEdoomyhTdQCMQBmbZrWQXBD3W7qMKiKieHmvG+c8uxzSH4KMIqfCf/0oB/P8ZMJqsRQZGFgBWQAECKUQKcSK1OQJW+8B2AGFGE9lgQI1AdoDbB4gUCAEDRAHmgDoApIMVPx/ACgCOlcvcBJA=";
const expected = "ply\nformat ascii 1.0\nelement vertex 2\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n1 2 3 10 20 30\n-1 -2 -3 200 210 220\n";
const prefix = () => Uint8Array.from(atob(prefixBase64), byte => byte.charCodeAt(0));
beforeEach(() => vi.stubGlobal('File', NativeFile));
afterEach(() => vi.unstubAllGlobals());

describe('bounded Zstandard TAR frame extraction', () => {
  it('reads a complete first file from an unfinished compressed archive and keeps nested paths', async () => {
    const file = await extractZstdTarPrefix(new File([prefix()], 'frames.tar.zst'), 'frames/frame.ply', expected.length, new AbortController().signal);
    expect(file.name).toBe('frame.ply');
    expect(await file.text()).toBe(expected);
  });
  it.each(['frames/later.ply', 'frame.ply'])('does not scan later files or flatten a requested member (%s)', async path => {
    await expect(extractZstdTarPrefix(new File([prefix()], 'frames.tar.zst'), path, expected.length, new AbortController().signal)).rejects.toThrow(/first regular/);
  });
  it('rejects changed member lengths, truncated payloads and unsafe paths', async () => {
    for (const path of ['../frames/frame.ply', '/frames/frame.ply', 'frames/../frame.ply']) {
      await expect(extractZstdTarPrefix(new File([prefix()], 'frames.tar.zst'), path, expected.length, new AbortController().signal)).rejects.toThrow(/Unsafe/);
    }
    await expect(extractZstdTarPrefix(new File([prefix()], 'frames.tar.zst'), 'frames/frame.ply', expected.length + 1, new AbortController().signal)).rejects.toThrow(/first regular/);
    await expect(extractZstdTarPrefix(new File([prefix().slice(0, -20)], 'frames.tar.zst'), 'frames/frame.ply', expected.length, new AbortController().signal)).rejects.toThrow();
  });
  it('checks decoder window and dictionary requirements before allocating their buffers', async () => {
    const large = prefix(); large[5] = 255;
    await expect(extractZstdTarPrefix(new File([large], 'frames.tar.zst'), 'frames/frame.ply', expected.length, new AbortController().signal)).rejects.toThrow(/window/);
    const dictionary = prefix(); dictionary[4] |= 1; dictionary[6] = 1;
    await expect(extractZstdTarPrefix(new File([dictionary], 'frames.tar.zst'), 'frames/frame.ply', expected.length, new AbortController().signal)).rejects.toThrow(/dictionaries/);
  });
  it('rejects oversized declarations and cancellation before reading source bytes', async () => {
    const arrayBuffer = vi.fn();
    const oversized = { size: MAX_GEOMETRY_PREFIX_BYTES + 1, arrayBuffer } as unknown as File;
    await expect(extractZstdTarPrefix(oversized, 'frame.ply', 10, new AbortController().signal)).rejects.toThrow(/budget/);
    await expect(extractZstdTarPrefix(new File([prefix()], 'frames.tar.zst'), 'frame.ply', MAX_GEOMETRY_MEMBER_BYTES + 1, new AbortController().signal)).rejects.toThrow(/budget/);
    const controller = new AbortController(); controller.abort();
    await expect(extractZstdTarPrefix(oversized, 'frame.ply', 10, controller.signal)).rejects.toThrow();
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
});

