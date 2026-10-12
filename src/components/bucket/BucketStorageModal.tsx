import { useId, useState } from 'react';
import { ModalDialogShell } from '../ui/ModalDialogShell';
import { BucketConnectionForm } from './BucketConnectionForm';
import { BucketFileList } from './BucketFileBrowser';
import { bucketBrowsePrefix, bucketFolderPath, isBucketDatasetKey, useBucketBrowser } from './useBucketBrowser';
import { useBucketStorageStoreFacade } from './useBucketStorageStoreFacade';
import { bucketErrorMessage } from '../../features/bucketStorage/types';
import { bucketKeyUrl } from '../../features/bucketStorage/client';
import { getButtonClass, inputStyles, modalStyles, panelStyles, Z_INDEX } from '../../theme';
import { BucketIcon, CloseIcon } from '../../icons';

const fieldClass = `${inputStyles.base} ${inputStyles.sizes.sm} w-full min-w-0`;
const primary = getButtonClass('primary', 'sm');
const secondary = getButtonClass('secondary', 'sm');
const ghost = getButtonClass('ghost', 'sm');

/** Loading lives under Load; publishing has its own dialog under Share. */
export function BucketStorageModal({ isOpen, onClose, onLoadUrl }: {
  isOpen: boolean; onClose: () => void; onLoadUrl: (url: string) => void;
}) {
  const id = useId();
  const { connection, bucketConnection, retryLink } = useBucketStorageStoreFacade();
  const [mode, setMode] = useState<'url' | 'bucket'>(connection.config ? 'bucket' : 'url');
  const [publicUrl, setPublicUrl] = useState('');
  const [browsing, setBrowsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const browser = useBucketBrowser(isOpen);
  const path = browser.prefix.trim();
  const disconnect = () => {
    bucketConnection.disconnect(); browser.changePrefix(''); setBrowsing(false); setError(null);
  };
  const load = (url: string) => { onClose(); onLoadUrl(url); };
  const loadObject = (key: string) => {
    const session = bucketConnection.getSession();
    if (!session) return;
    try { load(bucketKeyUrl(session, key)); } catch (failure) { setError(bucketErrorMessage(failure)); }
  };
  const toggleBrowse = () => {
    if (browsing) browser.cancel();
    else void browser.browse(bucketBrowsePrefix(path));
    setBrowsing(!browsing);
  };
  return <ModalDialogShell isOpen={isOpen} onClose={onClose} ariaLabelledBy={`${id}-title`}
    overlayClassName={`${panelStyles.overlay} p-4`} overlayStyle={{ zIndex: Z_INDEX.modalOverlay }}
    panelClassName={`${panelStyles.dialog} w-full max-w-lg overflow-hidden`} panelStyle={{ maxHeight: '90dvh' }}>
    <header className={`${modalStyles.popupHeader} flex-shrink-0`}>
      <h2 id={`${id}-title`} className={`${modalStyles.toolHeaderTitle} flex items-center gap-2`}><BucketIcon />Bucket storage</h2>
      <button type="button" className={modalStyles.toolHeaderClose} aria-label="Close bucket storage" onClick={onClose}><CloseIcon className="w-3.5 h-3.5" /></button>
    </header>
    <div className={`${panelStyles.scrollBody} flex flex-col gap-3 text-sm text-ds-primary`}>
      <div className="flex gap-2" role="group" aria-label="Bucket access">
        <button type="button" className={mode === 'url' ? secondary : ghost} aria-pressed={mode === 'url'} onClick={() => setMode('url')}>Public URL</button>
        <button type="button" className={mode === 'bucket' ? secondary : ghost} aria-pressed={mode === 'bucket'} onClick={() => setMode('bucket')}>S3 bucket</button>
      </div>
      {mode === 'url' ? <form className="flex flex-col gap-2" onSubmit={event => { event.preventDefault(); if (publicUrl.trim()) load(publicUrl.trim()); }}>
        <p className="m-0 text-ds-secondary">Load a public folder, manifest, ZIP, or TAR.</p>
        <label htmlFor={`${id}-url`} className="sr-only">Dataset URL</label>
        <input id={`${id}-url`} className={fieldClass} type="url" required value={publicUrl} onChange={event => setPublicUrl(event.target.value)} placeholder="https://bucket.example/dataset/manifest.json" />
        <div className="flex justify-end"><button type="submit" className={primary}>Load dataset</button></div>
      </form> : !connection.config ? <BucketConnectionForm access="read" onConnected={() => {
        browser.changePrefix(''); setBrowsing(false); setError(null);
      }} /> : <>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-ds-secondary truncate" title={connection.config.baseUrl}>{new URL(connection.config.baseUrl).host}</span>
          <button type="button" className={`${ghost} ml-auto`} onClick={disconnect}>Disconnect</button>
        </div>
        {retryLink && <button type="button" className={secondary} onClick={() => { onClose(); void retryLink(); }}>Retry shared link</button>}
        <section className="flex flex-col gap-2" aria-label="Bucket files">
          <form className="flex flex-col gap-2" onSubmit={event => {
            event.preventDefault(); loadObject(isBucketDatasetKey(path) ? path : bucketFolderPath(path));
          }}>
            <input className={fieldClass} aria-label="Dataset path" value={browser.prefix} onChange={event => {
              browser.changePrefix(event.target.value); setError(null);
            }} placeholder="Folder, manifest.json, or archive" autoComplete="off" />
            <div className="flex items-center justify-between gap-2">
              <button type="button" className={ghost} aria-expanded={browsing} aria-controls={`${id}-files`} onClick={toggleBrowse}>Browse files</button>
              <button type="submit" className={primary}>Load dataset</button>
            </div>
          </form>
          {browsing && <div id={`${id}-files`}><BucketFileList browser={browser} onLoad={loadObject} /></div>}
        </section>
      </>}
      {error && <p role="alert" className="m-0 text-ds-error">{error}</p>}
    </div>
  </ModalDialogShell>;
}
