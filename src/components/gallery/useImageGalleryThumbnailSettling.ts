import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { pauseThumbnailCache, resumeThumbnailCache } from '../../hooks/useThumbnail';

export interface ImageGalleryThumbnailSettlingKeyOptions {
  cameraFilter: number | string;
  selectedImageId: number | null;
  sortDirection: string;
  sortField: string;
}

interface ThumbnailSettlingResource {
  dispose: () => void;
  getSnapshot: () => boolean;
  subscribe: (listener: () => void) => () => void;
  sync: (settleKey: string, settleDelay: number) => void;
}

export function getImageGalleryThumbnailSettlingKey({
  cameraFilter,
  selectedImageId,
  sortDirection,
  sortField,
}: ImageGalleryThumbnailSettlingKeyOptions): string {
  return [
    cameraFilter,
    sortField,
    sortDirection,
    selectedImageId ?? 'none',
  ].join('\n');
}

function createThumbnailSettlingResource(): ThumbnailSettlingResource {
  let isSettling = false;
  let currentSettleDelay = 0;
  let currentSettleKey: string | null = null;
  let settleTimeout: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const publish = (nextIsSettling: boolean) => {
    if (isSettling === nextIsSettling) return;

    isSettling = nextIsSettling;
    emit();
  };

  const clearSettleTimeout = () => {
    if (settleTimeout === null) return;

    clearTimeout(settleTimeout);
    settleTimeout = null;
  };

  return {
    dispose: () => {
      clearSettleTimeout();
      currentSettleKey = null;

      if (isSettling) {
        publish(false);
        resumeThumbnailCache();
      }
    },
    getSnapshot: () => isSettling,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    sync: (settleKey, settleDelay) => {
      if (currentSettleKey === settleKey && currentSettleDelay === settleDelay) {
        return;
      }

      currentSettleKey = settleKey;
      currentSettleDelay = settleDelay;
      clearSettleTimeout();
      pauseThumbnailCache();
      publish(true);

      settleTimeout = setTimeout(() => {
        settleTimeout = null;
        publish(false);
        resumeThumbnailCache();
      }, settleDelay);
    },
  };
}

export function useImageGalleryThumbnailSettling(
  keyOptions: ImageGalleryThumbnailSettlingKeyOptions,
  settleDelay: number
): boolean {
  const {
    cameraFilter,
    selectedImageId,
    sortDirection,
    sortField,
  } = keyOptions;
  const resourceRef = useRef<ThumbnailSettlingResource | null>(null);
  resourceRef.current ??= createThumbnailSettlingResource();
  const resource = resourceRef.current;
  const settleKey = useMemo(
    () => getImageGalleryThumbnailSettlingKey({
      cameraFilter,
      selectedImageId,
      sortDirection,
      sortField,
    }),
    [
      cameraFilter,
      selectedImageId,
      sortDirection,
      sortField,
    ]
  );
  const isSettling = useSyncExternalStore(
    resource.subscribe,
    resource.getSnapshot,
    resource.getSnapshot
  );

  useEffect(() => {
    resource.sync(settleKey, settleDelay);
  }, [resource, settleDelay, settleKey]);

  useEffect(() => resource.dispose, [resource]);

  return isSettling;
}
