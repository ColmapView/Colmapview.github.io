import { useTrainingToggleStoreFacade } from './useTrainingStoreFacade';
import { ControlButton, type PanelType } from '../viewer3d/ControlComponents';
import { TrainingPanel } from './TrainingPanel';

export function TrainingToggleButton({ activePanel, setActivePanel }: {
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
}) {
  const { embedMode } = useTrainingToggleStoreFacade();
  if (embedMode) return null;
  return <ControlButton panelId="training" activePanel={activePanel} setActivePanel={setActivePanel}
    icon={<span aria-hidden="true" className="text-base leading-none">▲</span>}
    tooltip="Training" panelTitle="Training" onClick={() => setActivePanel('training')}>
    <TrainingPanel />
  </ControlButton>;
}
