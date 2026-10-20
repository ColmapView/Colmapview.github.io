import { lazy, Suspense, useState } from 'react';
import type { PublicHubDataset } from '../../features/colmapviewHub/publication';
import { getButtonClass } from '../../theme';

const HubModal = lazy(() => import('../modals/ShareOnHubModal').then(module => ({ default: module.ShareOnHubModal })));

export function ShareOnHubButton({ target }: { target: PublicHubDataset }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return <>
    <button type="button" className={getButtonClass('secondary', 'sm')} onClick={() => { setLoaded(true); setOpen(true); }}>Share on Hub</button>
    {loaded && <Suspense fallback={null}><HubModal target={target} isOpen={open} onClose={() => setOpen(false)} /></Suspense>}
  </>;
}
