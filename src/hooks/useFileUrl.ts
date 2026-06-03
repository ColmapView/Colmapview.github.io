/**
 * Hook to create and manage a blob URL for a File object.
 *
 * Automatically creates the URL when file is provided and
 * revokes it on cleanup to prevent memory leaks.
 *
 * Uses deferred revocation to prevent ERR_FILE_NOT_FOUND errors
 * when rapidly switching between files (e.g., during quick scrolling).
 */

import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  revokeAllPendingBlobUrls,
  scheduleBlobUrlRevocation,
} from './fileUrlRevocationPolicy';

interface FileUrlSnapshot {
  file: File | null;
  url: string | null;
}

interface FileUrlResource {
  dispose: () => void;
  getSnapshot: () => FileUrlSnapshot;
  subscribe: (listener: () => void) => () => void;
  syncFile: (file: File | null | undefined) => void;
}

const EMPTY_FILE_URL_SNAPSHOT: FileUrlSnapshot = {
  file: null,
  url: null,
};

function createFileUrlResource(): FileUrlResource {
  let snapshot = EMPTY_FILE_URL_SNAPSHOT;
  const listeners = new Set<() => void>();
  const pendingRevocations = new Set<string>();

  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const scheduleCurrentUrlRevocation = () => {
    if (!snapshot.url) return;

    scheduleBlobUrlRevocation({
      blobUrl: snapshot.url,
      pendingRevocations,
      requestIdleCallback: typeof requestIdleCallback !== 'undefined'
        ? requestIdleCallback
        : undefined,
    });
  };

  return {
    dispose: () => {
      if (snapshot.url) {
        pendingRevocations.add(snapshot.url);
        snapshot = EMPTY_FILE_URL_SNAPSHOT;
      }

      revokeAllPendingBlobUrls(pendingRevocations);
    },
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    syncFile: (file) => {
      const nextFile = file ?? null;
      if (snapshot.file === nextFile) return;

      scheduleCurrentUrlRevocation();
      snapshot = nextFile
        ? {
            file: nextFile,
            url: URL.createObjectURL(nextFile),
          }
        : EMPTY_FILE_URL_SNAPSHOT;
      emit();
    },
  };
}

/**
 * Create a blob URL for a file with automatic cleanup.
 *
 * Uses deferred revocation via requestIdleCallback to ensure
 * the URL is not revoked before React finishes committing DOM updates.
 *
 * @param file - The file to create a URL for, or null/undefined
 * @returns The blob URL or null
 */
export function useFileUrl(file: File | null | undefined): string | null {
  const resourceRef = useRef<FileUrlResource | null>(null);
  resourceRef.current ??= createFileUrlResource();
  const resource = resourceRef.current;
  const snapshot = useSyncExternalStore(
    resource.subscribe,
    resource.getSnapshot,
    resource.getSnapshot
  );

  useEffect(() => {
    resource.syncFile(file);
  }, [file, resource]);

  useEffect(() => {
    return resource.dispose;
  }, [resource]);

  return snapshot.file === (file ?? null) ? snapshot.url : null;
}
