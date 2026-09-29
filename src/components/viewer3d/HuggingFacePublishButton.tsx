import { memo, useState } from 'react';
import { getHfConfiguration } from '../../features/huggingface/config';
import { ControlButton, type PanelType } from './ControlComponents';
import { useHuggingFacePublishButtonStoreFacade } from './useHuggingFacePublishButtonStoreFacade';
import { LazyToolModal } from './LazyToolModal';

const loadPublisher = () => import('../modals/PublishDatasetModal').then(module => ({ default: module.PublishDatasetModal }));

interface HuggingFacePublishButtonProps {
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
}

export const HuggingFacePublishButton = memo(function HuggingFacePublishButton({
  activePanel, setActivePanel,
}: HuggingFacePublishButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { publicationActive } = useHuggingFacePublishButtonStoreFacade();
  if (getHfConfiguration().status === 'disabled') return null;

  return <>
    <ControlButton
      panelId="publish"
      activePanel={activePanel}
      setActivePanel={setActivePanel}
      icon={<span aria-hidden="true" className="text-2xl leading-none">🤗</span>}
      tooltip="Publish to Hugging Face"
      isActive={isOpen || publicationActive}
      onClick={() => { setActivePanel(null); setIsOpen(true); }}
    />
    <LazyToolModal title="Publish dataset" load={loadPublisher} isOpen={isOpen} onClose={() => setIsOpen(false)} />
  </>;
});
