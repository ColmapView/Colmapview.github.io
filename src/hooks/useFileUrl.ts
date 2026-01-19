/**
 * Hook to create and manage a blob URL for a File object.
 *
 * Automatically creates the URL when file is provided and
 * revokes it on cleanup to prevent memory leaks.
 *
 * Uses deferred revocation to prevent ERR_FILE_NOT_FOUND errors
 * when rapidly switching between files (e.g., during quick scrolling).
 */

import { useState, useEffect, useRef } from 'react';

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
  const [url, setUrl] = useState<string | null>(null);
  // Track pending URLs that need to be revoked
  const pendingRevocationsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!file) {
       
      setUrl(null);
      return;
    }

    const blobUrl = URL.createObjectURL(file);
     
    setUrl(blobUrl);

    return () => {
      // Defer revocation to allow React's commit phase to complete
      // and any in-flight image loads to be properly canceled.
      // This prevents ERR_FILE_NOT_FOUND errors during rapid scrolling.
      // eslint-disable-next-line react-hooks/exhaustive-deps -- Capture the Set reference once - it remains stable throughout the hook's lifetime
      const pendingSet = pendingRevocationsRef.current;
      pendingSet.add(blobUrl);

      // Use requestIdleCallback if available, otherwise use setTimeout
      // to defer until after the current event loop tick
      const revoke = () => {
        if (pendingSet.has(blobUrl)) {
          pendingSet.delete(blobUrl);
          URL.revokeObjectURL(blobUrl);
        }
      };

      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(revoke, { timeout: 1000 });
      } else {
        setTimeout(revoke, 100);
      }
    };
  }, [file]);

  // Cleanup any remaining URLs on unmount
  useEffect(() => {
    const pending = pendingRevocationsRef.current;
    return () => {
      pending.forEach((blobUrl) => {
        URL.revokeObjectURL(blobUrl);
      });
      pending.clear();
    };
  }, []);

  return url;
}
