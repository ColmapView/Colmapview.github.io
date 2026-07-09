import { describe, expect, it } from 'vitest';
import type { LoadedFiles, SplatFileSource } from '../types/colmap';
import {
  applyActiveSplatFile,
  applyActiveSplatPlaceholder,
  clearActiveSplatFile,
  findSplatSourceById,
  getActiveSplatSourceId,
  getNextSplatFile,
  getNextSplatSourceId,
  isByteLessActiveSplatFile,
  loadedFilesHaveSplatData,
  mergeRemoteSplatCatalog,
} from './splatFileSourcePolicy';

function loaded(partial: Partial<LoadedFiles>): LoadedFiles {
  return { imageFiles: new Map(), hasMasks: false, ...partial };
}

describe('loadedFilesHaveSplatData', () => {
  it('is true when an active splat file, bundled list, or pickable source is present', () => {
    const splat = new File(['s'], 's.spz');
    expect(loadedFilesHaveSplatData(loaded({ splatFile: splat }))).toBe(true);
    expect(loadedFilesHaveSplatData(loaded({ splatFiles: [splat] }))).toBe(true);
    // A lazy/not-yet-downloaded source (no file) still counts: the user can pick it.
    expect(
      loadedFilesHaveSplatData(loaded({ splatFileSources: [{ id: 'a', path: 'a.ply', url: 'u/a' }] }))
    ).toBe(true);
  });

  it('is false for a dataset with no splat of any kind (and for null)', () => {
    expect(loadedFilesHaveSplatData(loaded({}))).toBe(false);
    expect(loadedFilesHaveSplatData(loaded({ splatFiles: [], splatFileSources: [] }))).toBe(false);
    expect(loadedFilesHaveSplatData(null)).toBe(false);
  });
});

describe('splat file source policy', () => {
  it('selects the next splat file with wraparound', () => {
    const first = new File(['first'], 'first.spz');
    const second = new File(['second'], 'second.ply');
    const third = new File(['third'], 'third.ply');
    const splatFiles = [first, second, third];

    expect(getNextSplatFile(splatFiles, first)).toBe(second);
    expect(getNextSplatFile(splatFiles, second)).toBe(third);
    expect(getNextSplatFile(splatFiles, third)).toBe(first);
    expect(getNextSplatFile(splatFiles, undefined)).toBe(first);
  });

  it('does not select a next splat when there is only one candidate', () => {
    const only = new File(['only'], 'only.spz');

    expect(getNextSplatFile([only], only)).toBeNull();
    expect(getNextSplatFile([], undefined)).toBeNull();
  });
});

describe('getActiveSplatSourceId (cycle anchor)', () => {
  it('returns the id of the source whose file is the active splat', () => {
    const fileA = new File(['a'], 'a.ply');
    const fileB = new File(['b'], 'b.ply');
    const sources: SplatFileSource[] = [
      { id: 'splats/a.ply', path: 'splats/a.ply', file: fileA },
      { id: 'splats/b.ply', path: 'splats/b.ply', file: fileB },
    ];
    expect(getActiveSplatSourceId(loaded({ splatFile: fileB, splatFileSources: sources }))).toBe('splats/b.ply');
  });

  it('returns null when no splat is active', () => {
    expect(getActiveSplatSourceId(loaded({}))).toBeNull();
    expect(getActiveSplatSourceId(null)).toBeNull();
  });

  it('falls back to the file name when the active file is not in the sources', () => {
    const orphan = new File(['x'], 'orphan.ply');
    expect(getActiveSplatSourceId(loaded({ splatFile: orphan, splatFileSources: [] }))).toBe('orphan.ply');
  });

  it('resolves a byte-less placeholder to its re-fetchable source by filename', () => {
    // Byte-less activation: the active splat is a zero-byte placeholder held by
    // no source; the panel's active-source value must still find the source id.
    const placeholder = new File([], 'big.ply');
    const lf = loaded({
      splatFile: placeholder,
      splatFiles: [],
      splatFileSources: [
        { id: 'splats/big.ply', path: 'splats/big.ply', url: 'u/big', size: 150_000_000 },
        { id: 'splats/other.ply', path: 'splats/other.ply', url: 'u/other' },
      ],
    });
    expect(getActiveSplatSourceId(lf)).toBe('splats/big.ply');
  });
});

describe('getNextSplatSourceId (cycles over all sources, including lazy)', () => {
  const sources: SplatFileSource[] = [
    { id: 'a', path: 'a.ply', url: 'u/a', file: new File(['a'], 'a.ply') },
    { id: 'b', path: 'b.ply', url: 'u/b' }, // lazy, not downloaded
    { id: 'c', path: 'c.ply', url: 'u/c' }, // lazy
  ];

  it('advances to the next source id and wraps around', () => {
    expect(getNextSplatSourceId(sources, 'a')).toBe('b');
    expect(getNextSplatSourceId(sources, 'b')).toBe('c');
    expect(getNextSplatSourceId(sources, 'c')).toBe('a');
    expect(getNextSplatSourceId(sources, null)).toBe('a');
  });

  it('returns null when there is one or zero sources', () => {
    expect(getNextSplatSourceId([sources[0]], 'a')).toBeNull();
    expect(getNextSplatSourceId([], null)).toBeNull();
  });
});

describe('findSplatSourceById', () => {
  it('matches by id, path, or file name', () => {
    const lf = loaded({
      splatFileSources: [
        { id: 'tileA', path: 'splats/tileA.ply', url: 'u/a' },
        { id: 'tileB', path: 'splats/tileB.ply', url: 'u/b' },
      ],
    });
    expect(findSplatSourceById(lf, 'tileB')?.id).toBe('tileB');
    expect(findSplatSourceById(lf, 'splats/tileA.ply')?.id).toBe('tileA');
    expect(findSplatSourceById(lf, 'missing')).toBeUndefined();
  });
});

describe('applyActiveSplatFile (activate + offload previous)', () => {
  it('attaches the file, activates it, and offloads the previous re-fetchable splat', () => {
    const fileA = new File(['a'], 'a.ply');
    const fileB = new File(['b'], 'b.ply');
    const lf = loaded({
      splatFile: fileA,
      splatFiles: [fileA],
      splatFileSources: [
        { id: 'a', path: 'a.ply', url: 'u/a', file: fileA },
        { id: 'b', path: 'b.ply', url: 'u/b' },
      ],
    });

    const next = applyActiveSplatFile(lf, 'b', fileB);

    expect(next.splatFile).toBe(fileB);
    expect(next.splatFileSources?.find((s) => s.id === 'b')?.file).toBe(fileB);
    // previous active (a) is re-fetchable (has url) -> offloaded
    expect(next.splatFileSources?.find((s) => s.id === 'a')?.file).toBeUndefined();
    expect(next.splatFiles).toEqual([fileB]);
  });

  it('keeps a local (non-re-fetchable) previous splat loaded', () => {
    const localFile = new File(['local'], 'local.ply');
    const fileB = new File(['b'], 'b.ply');
    const lf = loaded({
      splatFile: localFile,
      splatFiles: [localFile],
      splatFileSources: [
        { id: 'local', path: 'local.ply', file: localFile }, // no url -> cannot re-fetch
        { id: 'b', path: 'b.ply', url: 'u/b' },
      ],
    });

    const next = applyActiveSplatFile(lf, 'b', fileB);

    expect(next.splatFile).toBe(fileB);
    expect(next.splatFileSources?.find((s) => s.id === 'local')?.file).toBe(localFile);
    expect(next.splatFiles).toEqual([localFile, fileB]);
  });
});

describe('applyActiveSplatPlaceholder (byte-less activation)', () => {
  it('activates the placeholder while the source keeps no bytes (stays re-fetchable)', () => {
    const placeholder = new File([], 'big.ply');
    const lf = loaded({
      splatFileSources: [
        { id: 'splats/big.ply', path: 'splats/big.ply', url: 'u/big', size: 150_000_000 },
      ],
    });

    const next = applyActiveSplatPlaceholder(lf, 'splats/big.ply', placeholder);

    expect(next.splatFile).toBe(placeholder);
    expect(next.splatFileSources?.find((s) => s.id === 'splats/big.ply')?.file).toBeUndefined();
    // The placeholder holds no bytes, so it is not listed among loaded files.
    expect(next.splatFiles).toEqual([]);
  });

  it('offloads the previous re-fetchable tile and keeps local ones', () => {
    const fileA = new File(['a'], 'a.ply');
    const localFile = new File(['local'], 'local.ply');
    const placeholder = new File([], 'big.ply');
    const lf = loaded({
      splatFile: fileA,
      splatFiles: [fileA, localFile],
      splatFileSources: [
        { id: 'a', path: 'a.ply', url: 'u/a', file: fileA },
        { id: 'local', path: 'local.ply', file: localFile },
        { id: 'big', path: 'splats/big.ply', url: 'u/big' },
      ],
    });

    const next = applyActiveSplatPlaceholder(lf, 'big', placeholder);

    expect(next.splatFile).toBe(placeholder);
    // Previous active (a) is re-fetchable (has url) -> offloaded.
    expect(next.splatFileSources?.find((s) => s.id === 'a')?.file).toBeUndefined();
    // Local splats cannot be re-fetched -> kept.
    expect(next.splatFileSources?.find((s) => s.id === 'local')?.file).toBe(localFile);
    expect(next.splatFiles).toEqual([localFile]);
  });
});

describe('isByteLessActiveSplatFile', () => {
  it('detects a byte-less placeholder (zero bytes, held by no source, re-fetchable source present)', () => {
    const placeholder = new File([], 'big.ply');
    const lf = loaded({
      splatFile: placeholder,
      splatFileSources: [{ id: 'splats/big.ply', path: 'splats/big.ply', url: 'u/big' }],
    });
    expect(isByteLessActiveSplatFile(lf)).toBe(true);
  });

  it('is false for a real downloaded splat, no active splat, and null', () => {
    const fileA = new File(['a'], 'a.ply');
    expect(isByteLessActiveSplatFile(loaded({
      splatFile: fileA,
      splatFileSources: [{ id: 'a', path: 'a.ply', url: 'u/a', file: fileA }],
    }))).toBe(false);
    expect(isByteLessActiveSplatFile(loaded({}))).toBe(false);
    expect(isByteLessActiveSplatFile(null)).toBe(false);
  });

  it('is false for a genuinely empty file attached to a source (not a placeholder)', () => {
    const empty = new File([], 'empty.ply');
    expect(isByteLessActiveSplatFile(loaded({
      splatFile: empty,
      splatFileSources: [{ id: 'e', path: 'empty.ply', url: 'u/e', file: empty }],
    }))).toBe(false);
  });
});

describe('clearActiveSplatFile (COLMAP only)', () => {
  it('clears the active splat and offloads its re-fetchable bytes', () => {
    const fileA = new File(['a'], 'a.ply');
    const lf = loaded({
      splatFile: fileA,
      splatFiles: [fileA],
      splatFileSources: [{ id: 'a', path: 'a.ply', url: 'u/a', file: fileA }],
    });

    const next = clearActiveSplatFile(lf);

    expect(next.splatFile).toBeUndefined();
    expect(next.splatFiles).toEqual([]);
    expect(next.splatFileSources?.find((s) => s.id === 'a')?.file).toBeUndefined();
  });

  it('is a no-op when no splat is active', () => {
    const lf = loaded({ splatFileSources: [{ id: 'a', path: 'a.ply', url: 'u/a' }] });
    expect(clearActiveSplatFile(lf)).toBe(lf);
  });
});

describe('mergeRemoteSplatCatalog', () => {
  it('lists every tile as a source, keeping the eager file and making the rest lazy', () => {
    const firstFile = new File(['a'], 'a.ply');
    const lf = loaded({
      splatFile: firstFile,
      splatFiles: [firstFile],
      splatFileSources: [{ id: 'splats/a.ply', path: 'splats/a.ply', file: firstFile }],
    });

    const merged = mergeRemoteSplatCatalog(
      lf,
      [
        { path: 'splats/a.ply', size: 100 },
        { path: 'splats/b.ply', size: 200 },
      ],
      'https://x/ds'
    );

    expect(merged.splatFileSources).toEqual([
      { id: 'splats/a.ply', path: 'splats/a.ply', url: 'https://x/ds/splats/a.ply', size: 100, file: firstFile, splatCount: null },
      { id: 'splats/b.ply', path: 'splats/b.ply', url: 'https://x/ds/splats/b.ply', size: 200, file: undefined, splatCount: null },
    ]);
    expect(merged.splatFiles).toEqual([firstFile]);
    expect(merged.splatFile).toBe(firstFile);
  });

  it('handles a base url that already ends with a slash', () => {
    const lf = loaded({ splatFileSources: [] });
    const merged = mergeRemoteSplatCatalog(lf, [{ path: 'splats/a.ply', size: 1 }], 'https://x/ds/');
    expect(merged.splatFileSources?.[0].url).toBe('https://x/ds/splats/a.ply');
  });

  it('percent-encodes # (and other special chars) in tile paths so URLs do not 404', () => {
    const lf = loaded({ splatFileSources: [] });
    const merged = mergeRemoteSplatCatalog(
      lf,
      [{ path: 'splats/5x5#-5_-15_0_-10#-1_-3.ply', size: 1 }],
      'https://x/ds'
    );
    expect(merged.splatFileSources?.[0].url).toBe(
      'https://x/ds/splats/5x5%23-5_-15_0_-10%23-1_-3.ply'
    );
  });

  it('carries splat counts from the remote catalog into sources', () => {
    const loadedFiles = { imageFiles: new Map(), hasMasks: false } as unknown as LoadedFiles;
    const merged = mergeRemoteSplatCatalog(loadedFiles, [
      { path: 'splats/huge.ply', size: 1_040_000_634, splatCount: 10_000_000 },
      { path: 'splats/tiles.spz', size: 40_000_000 },
    ], 'https://x/ds');

    expect(merged.splatFileSources?.map((s) => s.splatCount ?? null)).toEqual([10_000_000, null]);
  });

  it('preserves an existing source splat count when the incoming entry lacks one', () => {
    const lf = loaded({
      splatFileSources: [
        { id: 'splats/a.ply', path: 'splats/a.ply', url: 'https://x/ds/splats/a.ply', size: 100, splatCount: 5_000_000 },
      ],
    });

    const merged = mergeRemoteSplatCatalog(lf, [{ path: 'splats/a.ply', size: 100 }], 'https://x/ds');

    expect(merged.splatFileSources?.[0].splatCount).toBe(5_000_000);
  });
});
