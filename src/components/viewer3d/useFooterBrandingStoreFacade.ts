import { useUIStore } from '../../store';

export interface FooterBrandingStoreFacade {
  autoHideButtons: boolean;
  embedMode: boolean;
  touchMode: boolean;
}

export function useFooterBrandingStoreFacade(): FooterBrandingStoreFacade {
  const autoHideButtons = useUIStore((s) => s.autoHideElements.buttons);
  const embedMode = useUIStore((s) => s.embedMode);
  const touchMode = useUIStore((s) => s.touchMode);

  return { autoHideButtons, embedMode, touchMode };
}
