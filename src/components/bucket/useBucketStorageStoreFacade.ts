import { useSyncExternalStore } from 'react';
import { bucketConnection } from '../../features/bucketStorage/connection';
import { startupLinkRetry } from '../../appStartupRetry';

export function useBucketStorageStoreFacade() {
  const connection = useSyncExternalStore(bucketConnection.subscribe, bucketConnection.getSnapshot);
  const retryLink = useSyncExternalStore(startupLinkRetry.subscribe, startupLinkRetry.getSnapshot);
  return { connection, retryLink, bucketConnection };
}
