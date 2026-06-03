import { useState } from 'react';
import type { PanelType } from './ControlComponents';

export interface ViewerControlPanelState {
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
}

export function useViewerControlPanelState(): ViewerControlPanelState {
  const [activePanel, setActivePanel] = useState<PanelType>(null);

  return { activePanel, setActivePanel };
}
