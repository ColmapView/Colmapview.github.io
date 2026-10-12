import { useState, useSyncExternalStore } from 'react';
import { hfAuth } from '../../features/huggingface/auth';
import { googleDriveAuth } from '../../features/googleDrive/auth';
import { getGoogleDrivePickerConfig } from '../../features/googleDrive/picker';
import { GOOGLE_DRIVE_ENABLED_ORIGIN, GOOGLE_DRIVE_HANDOFF_TOOLTIP, isGoogleDriveEnabled } from '../../features/googleDrive/config';
import { GoogleDriveIcon } from '../../icons';
import { DROP_ZONE_ICON_BUTTON_CLASS } from './dropZonePanelViewModel';
import { BucketStorageButton } from '../bucket/BucketStorageButton';
import { DatasetAccountDialog, type DatasetAccountProvider } from './DatasetAccountDialog';

interface DatasetAccountButtonsProps {
  onOpenUrlModal: () => void;
  onLoadRemoteDataset: (url: string) => void;
}

export function DatasetAccountButtons({ onOpenUrlModal, onLoadRemoteDataset }: DatasetAccountButtonsProps) {
  const [provider, setProvider] = useState<DatasetAccountProvider | null>(null);
  const google = useSyncExternalStore(googleDriveAuth.subscribe, googleDriveAuth.getSnapshot);
  const hf = useSyncExternalStore(hfAuth.subscribe, hfAuth.getSnapshot);
  const clientId = getGoogleDrivePickerConfig()?.clientId;
  const googleEnabled = isGoogleDriveEnabled();
  return <>
    <BucketStorageButton className={DROP_ZONE_ICON_BUTTON_CLASS} onLoadUrl={onLoadRemoteDataset} />
    <button type="button" className={DROP_ZONE_ICON_BUTTON_CLASS} aria-label="Hugging Face account"
      data-tooltip={hf.status === 'connected' ? `Hugging Face: ${hf.identity?.username}` : 'Sign in with Hugging Face'}
      aria-pressed={hf.status === 'connected'} onClick={() => setProvider('hf')}>
      <span aria-hidden="true" className="startup-account-emoji">🤗</span>
    </button>
    {googleEnabled ? <button type="button" className={DROP_ZONE_ICON_BUTTON_CLASS} aria-label="Google Drive account"
      data-tooltip={clientId ? 'Choose archive from Google Drive' : 'Google Drive'}
      aria-pressed={google.status === 'connected'} onClick={() => setProvider('google')}>
      <GoogleDriveIcon className="w-4 h-4" />
    </button> : <a href={GOOGLE_DRIVE_ENABLED_ORIGIN} className={DROP_ZONE_ICON_BUTTON_CLASS}
      target="_blank" rel="noopener noreferrer" aria-label="Use Google Drive" data-tooltip={GOOGLE_DRIVE_HANDOFF_TOOLTIP}>
      <GoogleDriveIcon className="w-4 h-4" />
    </a>}
    <DatasetAccountDialog provider={provider} onClose={() => setProvider(null)}
      onOpenUrlModal={onOpenUrlModal} onLoadRemoteDataset={onLoadRemoteDataset} />
  </>;
}
