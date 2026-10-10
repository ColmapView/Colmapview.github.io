import { lazy, Suspense, useState } from 'react';
import { BucketIcon } from '../../icons';
import { useBucketStorageButtonStoreFacade } from './useBucketStorageButtonStoreFacade';

const BucketStorageModal = lazy(() => import('./BucketStorageModal').then(module => ({ default: module.BucketStorageModal })));

export function BucketStorageButton({ className, onLoadUrl }: {
  className: string;
  onLoadUrl?: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { loadUrl } = useBucketStorageButtonStoreFacade();
  return <>
    <button type="button" className={className} aria-label="Bucket storage" data-tooltip="Read or upload a bucket dataset"
      onClick={() => setOpen(true)}><BucketIcon /></button>
    {open && <Suspense fallback={<span role="status">Opening bucket storage…</span>}>
      <BucketStorageModal isOpen onClose={() => setOpen(false)} onLoadUrl={onLoadUrl ?? loadUrl} />
    </Suspense>}
  </>;
}
