import type { LoadedFiles } from '../types/colmap';

export function normalizeSplatSourceId(sourceId: string): string {
  return sourceId.replace(/\\/g, '/').replace(/^\/+/, '');
}

export function getLoadedFilesWithActiveSplatSource(
  loadedFiles: LoadedFiles,
  requestedSplatSourceId: string
): LoadedFiles {
  const target = normalizeSplatSourceId(requestedSplatSourceId);
  const splatFiles = getLoadedSplatFiles(loadedFiles);
  const sourceMatch = loadedFiles.splatFileSources?.find((source) => {
    const ids = [source.id, source.path, source.file.name];
    return ids.some((id) => normalizeSplatSourceId(id) === target);
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

function getLoadedSplatFiles(loadedFiles: LoadedFiles): readonly File[] {
  return loadedFiles.splatFiles ?? (loadedFiles.splatFile ? [loadedFiles.splatFile] : []);
}
