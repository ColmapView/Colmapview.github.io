import { useCallback, useEffect, useRef, useState } from 'react';
import { bucketConnection } from '../../features/bucketStorage/connection';
import { listBucketPage } from '../../features/bucketStorage/client';
import { bucketErrorMessage, type BucketPage } from '../../features/bucketStorage/types';

export const isBucketDatasetKey = (key: string) => /\.(?:zip|tar|tgz|tar\.gz|json|spz|sog|ply|splat|ksplat)$/i.test(key);
export const bucketFolderPath = (value: string) => value && !value.endsWith('/') ? value + '/' : value;
export const bucketBrowsePrefix = (value: string) => {
  const path = value.trim();
  return isBucketDatasetKey(path) ? path.slice(0, path.lastIndexOf('/') + 1) : bucketFolderPath(path);
};

export function useBucketBrowser(isOpen: boolean) {
  const [prefix, setPrefix] = useState('');
  const [page, setPage] = useState<BucketPage | null>(null);
  const [listing, setListing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listingRef = useRef<AbortController | null>(null);
  const cancel = useCallback(() => {
    listingRef.current?.abort(); listingRef.current = null; setListing(false);
  }, []);
  useEffect(() => {
    if (!isOpen) cancel();
    return () => { listingRef.current?.abort(); };
  }, [isOpen, cancel]);
  const changePrefix = (value: string) => {
    cancel(); setPage(null); setError(null); setPrefix(value);
  };
  const browse = async (nextPrefix: string, token?: string) => {
    const session = bucketConnection.getSession();
    if (!session) return;
    listingRef.current?.abort();
    const controller = new AbortController();
    listingRef.current = controller;
    setListing(true); setError(null); setPrefix(nextPrefix);
    if (!token) setPage(null);
    try {
      const result = await listBucketPage(session, nextPrefix, controller.signal, { token });
      if (controller.signal.aborted || bucketConnection.getSession() !== session) return;
      setPage(current => token && current ? { objects: [...current.objects, ...result.objects],
        directories: [...new Set([...current.directories, ...result.directories])], nextToken: result.nextToken } : result);
    } catch (failure) {
      if (!controller.signal.aborted && bucketConnection.getSession() === session) setError(bucketErrorMessage(failure));
    } finally { if (listingRef.current === controller) { listingRef.current = null; setListing(false); } }
  };
  return { prefix, page, listing, error, browse, changePrefix, cancel };
}
