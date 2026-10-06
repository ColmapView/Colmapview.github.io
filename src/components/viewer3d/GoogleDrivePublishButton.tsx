import { memo, useState } from 'react';
import { getGoogleDriveClientId } from '../../features/googleDrive/auth';
import { GOOGLE_DRIVE_ENABLED_ORIGIN, isGoogleDriveEnabled } from '../../features/googleDrive/config';
import { useDrivePublicationStatus } from '../../features/googleDrive/publicationStatus';
import { GoogleDriveIcon } from '../../icons';
import { ControlButton, type PanelType } from './ControlComponents';
import { LazyToolModal } from './LazyToolModal';
import { getControlButtonClass, getTooltipProps } from '../../theme';

const loadPublisher = () => import('../modals/GoogleDrivePublishModal').then(module => ({ default: module.GoogleDrivePublishModal }));
export const GoogleDrivePublishButton = memo(function GoogleDrivePublishButton({ activePanel, setActivePanel }: {
  activePanel: PanelType; setActivePanel: (panel: PanelType) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const active = useDrivePublicationStatus(state => state.active);
  if (!isGoogleDriveEnabled()) return <a href={GOOGLE_DRIVE_ENABLED_ORIGIN} aria-label="Use Google Drive"
    className={getControlButtonClass(false, false)} {...getTooltipProps('Use Google Drive', 'left')}>
    <GoogleDriveIcon className="w-5 h-5" />
  </a>;
  if (!getGoogleDriveClientId()) return null;
  return <>
    <ControlButton panelId="publishDrive" activePanel={activePanel} setActivePanel={setActivePanel}
      icon={<GoogleDriveIcon className="w-5 h-5" />} tooltip="Publish to Google Drive" isActive={isOpen || active}
      onClick={() => { setActivePanel(null); setIsOpen(true); }} />
    <LazyToolModal title="Publish to Google Drive" load={loadPublisher} isOpen={isOpen} onClose={() => setIsOpen(false)} />
  </>;
});
