import type { LoadedFiles, SplatFileSource } from '../types/colmap';
import { encodeUrlPath } from './urlUtils';

export function normalizeSplatSourceId(sourceId: string): string {
  return sourceId.replace(/\\/g, '/').replace(/^\/+/, '');
}

/**
 * Cycle to the next splat source id over ALL sources (including lazy ones that
 * are not downloaded yet), so cycling can reach every tile, not just the ones
 * already in memory.
 */
export function getNextSplatSourceId(
  sources: readonly SplatFileSource[],
  activeId: string | null
): string | null {
  if (sources.length <= 1) {
    return null;
  }
  const activeIndex = activeId ? sources.findIndex((source) => source.id === activeId) : -1;
  return sources[(activeIndex + 1) % sources.length].id;
}

/** Find a splat source by id, path, or downloaded file name. */
export function findSplatSourceById(
  loadedFiles: LoadedFiles | null,
  sourceId: string
): SplatFileSource | undefined {
  const target = normalizeSplatSourceId(sourceId);
  return loadedFiles?.splatFileSources?.find((source) =>
    [source.id, source.path, source.file?.name].some(
      (id) => id !== undefined && normalizeSplatSourceId(id) === target
    )
  );
}

/**
 * Make `sourceId` the active splat, attaching its freshly-fetched `file`, and
 * offload the splat we are switching away from when it can be re-fetched (has a
 * url). Keeps non-re-fetchable (local) splats in memory. Returns updated files;
 * the renderer disposes the previous SplatMesh when splatFile changes.
 */
export function applyActiveSplatFile(
  loadedFiles: LoadedFiles,
  sourceId: string,
  file: File
): LoadedFiles {
  const previousActiveFile = loadedFiles.splatFile;
  const sources = (loadedFiles.splatFileSources ?? []).map((source) => {
    if (source.id === sourceId) {
      return { ...source, file };
    }
    if (source.file && source.file === previousActiveFile && source.url) {
      return { ...source, file: undefined };
    }
    return source;
  });
  const splatFiles = sources
    .map((source) => source.file)
    .filter((candidate): candidate is File => Boolean(candidate));

  return { ...loadedFiles, splatFileSources: sources, splatFile: file, splatFiles };
}

function joinSplatUrl(baseUrl: string, path: string): string {
  const encoded = encodeUrlPath(path);
  return baseUrl.endsWith('/') ? `${baseUrl}${encoded}` : `${baseUrl}/${encoded}`;
}

/**
 * Merge a discovered remote splat catalog into the loaded files so every tile is
 * listed as a source. Tiles already downloaded (by path) keep their `file`;
 * the rest become lazy sources with a `url` for on-demand fetching. Catalog
 * order is preserved. `splatFile` (the active tile) is left unchanged.
 */
export function mergeRemoteSplatCatalog(
  loadedFiles: LoadedFiles,
  catalog: ReadonlyArray<{ path: string; size: number }>,
  baseUrl: string
): LoadedFiles {
  const existingByPath = new Map(
    (loadedFiles.splatFileSources ?? []).map((source) => [normalizeSplatSourceId(source.path), source])
  );

  const sources: SplatFileSource[] = catalog.map(({ path, size }) => {
    const existing = existingByPath.get(normalizeSplatSourceId(path));
    return {
      id: existing?.id ?? path,
      path,
      url: joinSplatUrl(baseUrl, path),
      size,
      file: existing?.file,
    };
  });

  // Preserve any existing sources not present in the catalog (e.g. local files).
  const catalogPaths = new Set(catalog.map((entry) => normalizeSplatSourceId(entry.path)));
  for (const source of loadedFiles.splatFileSources ?? []) {
    if (!catalogPaths.has(normalizeSplatSourceId(source.path))) {
      sources.push(source);
    }
  }

  const splatFiles = sources
    .map((source) => source.file)
    .filter((file): file is File => Boolean(file));

  return { ...loadedFiles, splatFileSources: sources, splatFiles };
}

/**
 * Deactivate the splat ("COLMAP only") - clears the active splat and offloads
 * its bytes when re-fetchable. The renderer disposes the SplatMesh when
 * splatFile becomes undefined.
 */
export function clearActiveSplatFile(loadedFiles: LoadedFiles): LoadedFiles {
  const previousActiveFile = loadedFiles.splatFile;
  if (!previousActiveFile) {
    return loadedFiles;
  }
  const sources = (loadedFiles.splatFileSources ?? []).map((source) =>
    source.file && source.file === previousActiveFile && source.url
      ? { ...source, file: undefined }
      : source
  );
  const splatFiles = sources
    .map((source) => source.file)
    .filter((candidate): candidate is File => Boolean(candidate));

  return { ...loadedFiles, splatFileSources: sources, splatFile: undefined, splatFiles };
}

export function getLoadedFilesWithActiveSplatSource(
  loadedFiles: LoadedFiles,
  requestedSplatSourceId: string
): LoadedFiles {
  const target = normalizeSplatSourceId(requestedSplatSourceId);
  const splatFiles = getLoadedSplatFiles(loadedFiles);
  const sourceMatch = loadedFiles.splatFileSources?.find((source) => {
    const ids = [source.id, source.path, source.file?.name];
    return ids.some((id) => id !== undefined && normalizeSplatSourceId(id) === target);
  });
  const fallbackMatch = splatFiles.find((file) => normalizeSplatSourceId(file.name) === target);
  const nextSplatFile = sourceMatch?.file ?? fallbackMatch;

  if (!nextSplatFile || nextSplatFile === loadedFiles.splatFile) {
    return loadedFiles;
  }

  return {
    ...loadedFiles,
    splatFile: nextSplatFile,
  };
}

export function getActiveSplatSourceId(loadedFiles: LoadedFiles | null): string | null {
  if (!loadedFiles?.splatFile) {
    return null;
  }

  const source = loadedFiles.splatFileSources?.find((candidate) => candidate.file === loadedFiles.splatFile);
  return source?.id ?? loadedFiles.splatFile.name;
}

export function getShareActiveSplatSourceId(loadedFiles: LoadedFiles | null): string | null {
  if (!loadedFiles?.splatFile) {
    return null;
  }

  const splatFileCount = getLoadedSplatFiles(loadedFiles).length;
  if (splatFileCount <= 1) {
    return null;
  }

  return getActiveSplatSourceId(loadedFiles);
}

export function getNextSplatFile(
  splatFiles: readonly File[],
  activeSplatFile: File | undefined
): File | null {
  if (splatFiles.length <= 1) {
    return null;
  }

  const activeIndex = activeSplatFile ? splatFiles.indexOf(activeSplatFile) : -1;
  return splatFiles[(activeIndex + 1) % splatFiles.length] ?? null;
}

function getLoadedSplatFiles(loadedFiles: LoadedFiles): readonly File[] {
  return loadedFiles.splatFiles ?? (loadedFiles.splatFile ? [loadedFiles.splatFile] : []);
}
