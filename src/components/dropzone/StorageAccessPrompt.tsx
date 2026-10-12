import { lazy, Suspense, useState } from 'react';
import { canRecoverStorageAccess } from '../../features/storageAccess';
import type { UrlLoadError } from '../../types/manifest';
import { DatasetAccountDialog } from './DatasetAccountDialog';
import { useStorageAccessPromptStoreFacade } from './useStorageAccessPromptStoreFacade';

const BucketStorageModal = lazy(() => import('../bucket/BucketStorageModal').then(module => ({ default: module.BucketStorageModal })));

/** Mounted over both the landing panel and an open scene, once per failed load. */
export function StorageAccessPrompt({ onOpenUrlModal, onLoadRemoteDataset }: {
  onOpenUrlModal: () => void; onLoadRemoteDataset: (url: string) => void;
}) {
  const { failure, retry } = useStorageAccessPromptStoreFacade();
  const [dismissed, setDismissed] = useState<UrlLoadError | null>(null);
  if (!failure?.access || failure === dismissed || !retry || !canRecoverStorageAccess(failure.access)) return null;
  const onClose = () => setDismissed(failure);
  if (failure.access.provider === 'bucket') return <Suspense fallback={<span role="status">Opening bucket connection…</span>}>
    <BucketStorageModal key={failure.access.bucketUrl} isOpen onClose={onClose} onLoadUrl={onLoadRemoteDataset}
      accessRequest={{ bucketUrl: failure.access.bucketUrl, message: failure.message, retry }} />
  </Suspense>;
  return <DatasetAccountDialog provider={failure.access.provider} onClose={onClose} accessMessage={failure.message}
    retryLoad={retry} onOpenUrlModal={onOpenUrlModal} onLoadRemoteDataset={onLoadRemoteDataset} />;
}
