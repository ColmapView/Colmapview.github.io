import { useCallback, useEffect, useState } from 'react';
import type { PanelType } from './ControlComponents';
import { subscribeToTrainingPanelOpen, useTrainingPanelStoreFacade } from './useTrainingPanelStoreFacade';

export interface ViewerControlPanelState {
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
}

export function useViewerControlPanelState(): ViewerControlPanelState {
  const [activePanel, setPanel] = useState<PanelType>(null);

  const { trainingOpen, setTrainingOpen } = useTrainingPanelStoreFacade();
  useEffect(() => subscribeToTrainingPanelOpen(() => setPanel(null)), []);
  const setActivePanel = useCallback((panel: PanelType) => {
    setPanel(panel === 'training' ? null : panel);
    setTrainingOpen(panel === 'training');
  }, [setTrainingOpen]);
  return { activePanel: trainingOpen ? 'training' : activePanel, setActivePanel };
}
