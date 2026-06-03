import { useUIStore } from '../../store';

export interface FooterBrandingStoreFacade {
  autoHideButtons: boolean;
}

export function useFooterBrandingStoreFacade(): FooterBrandingStoreFacade {
  const autoHideButtons = useUIStore((s) => s.autoHideElements.buttons);

  return { autoHideButtons };
}
