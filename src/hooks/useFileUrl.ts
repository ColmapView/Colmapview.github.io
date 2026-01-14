/**
 * Hook to create and manage a blob URL for a File object.
 *
 * Automatically creates the URL when file is provided and
 * revokes it on cleanup to prevent memory leaks.
 */

import { useState, useEffect } from 'react';

/**
 * Create a blob URL for a file with automatic cleanup.
 *
 * @param file - The file to create a URL for, or null/undefined
 * @returns The blob URL or null
 */
export function useFileUrl(file: File | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }

    const blobUrl = URL.createObjectURL(file);
    setUrl(blobUrl);

    return () => {
      URL.revokeObjectURL(blobUrl);
    };
  }, [file]);

  return url;
}
