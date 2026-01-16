import { useEffect } from 'react';
import { useHotkeysContext } from 'react-hotkeys-hook';
import { useUIStore } from '../store';

/**
 * Hook to manage hotkey scopes based on modal state.
 * Automatically switches between 'viewer' and 'modal' scopes.
 *
 * Place this hook in a component that's always mounted (like AppLayout)
 * to ensure scope switching happens reliably.
 */
export function useHotkeyScope() {
  const { enableScope, disableScope } = useHotkeysContext();
  const imageDetailId = useUIStore((s) => s.imageDetailId);
  const isModalOpen = imageDetailId !== null;

  useEffect(() => {
    if (isModalOpen) {
      disableScope('viewer');
      enableScope('modal');
    } else {
      disableScope('modal');
      enableScope('viewer');
    }
  }, [isModalOpen, enableScope, disableScope]);

  return { isModalOpen };
}
