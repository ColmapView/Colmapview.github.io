import { useId, useState } from 'react';
import { CopyableField } from '../ui/CopyableField';
import { usePublicationPreview } from '../modals/usePublicationPreview';
import { UploadDialog, UploadFormatField, UploadImageFormatField, UploadLayout, UploadProgress, UploadResult, UploadViewPreview } from '../upload/UploadParts';
import { BucketConnectionForm } from './BucketConnectionForm';
import { BucketFileList } from './BucketFileBrowser';
import { useBucketBrowser } from './useBucketBrowser';
import { useBucketPublishStoreFacade } from './useBucketPublishStoreFacade';
import { isBucketPublishing } from '../../features/bucketStorage/publishDataset';
import { bucketErrorMessage } from '../../features/bucketStorage/types';
import type { PublicationFormat, PublicationImageFormat } from '../../features/datasetPublishing/types';
import { BucketIcon } from '../../icons';
import { getButtonClass, inputStyles } from '../../theme';
import { useHubLink } from '../upload/useHubLink';

const fieldClass = `${inputStyles.base} ${inputStyles.sizes.sm} w-full min-w-0`;
const secondary = getButtonClass('secondary', 'sm');

export function BucketPublishModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const id = useId();
  const facade = useBucketPublishStoreFacade();
  const { connection, publication, bucketConnection, bucketPublication } = facade;
  // An edit applies only to the dataset it was made for; the dialog stays mounted across loads.
  const [folderEdit, setFolderEdit] = useState<{ key: string; value: string } | null>(null);
  const folder = folderEdit?.key === facade.sourceKey ? folderEdit.value : facade.datasetName;
  const [format, setFormat] = useState<PublicationFormat>('folder');
  const [imageFormat, setImageFormat] = useState<PublicationImageFormat>('original');
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const browser = useBucketBrowser(isOpen);
  const busy = isBucketPublishing(publication.phase);
  const selecting = publication.phase === 'idle';
  const selectedImageFormat = format === 'zip' ? imageFormat : 'original';
  const preview = usePublicationPreview(facade.sourceKey, isOpen && selecting, facade.getScreenshotBlob);
  const hub = useHubLink('bucket', isOpen);
  const publish = async () => {
    setError(null);
    try { await facade.publishDataset(folder, format, selectedImageFormat, preview.file ?? null); } catch (failure) { setError(bucketErrorMessage(failure)); }
  };
  const disconnect = () => {
    browser.cancel(); setInspecting(false); bucketPublication.cancel(); bucketConnection.disconnect();
  };
  const reset = () => { browser.cancel(); setInspecting(false); bucketPublication.reset(); setError(null); };
  const applyDeletions = async () => {
    setApplying(true); setError(null);
    try { if (!await facade.applyDeletionsToData()) setError('Deletions could not be applied. Review the current reconstruction.'); }
    finally { setApplying(false); }
  };
  return <UploadDialog isOpen={isOpen} onClose={onClose} closeLabel="Close bucket publication"
    title={<><BucketIcon className="w-3.5 h-3.5 inline mr-1" />Publish to bucket</>} headerActions={connection.config && <>
      <span className="publication-account text-ds-muted text-xs" title={connection.config.baseUrl}>{new URL(connection.config.baseUrl).host}</span>
      <button type="button" className={getButtonClass('secondary', 'xs')} onClick={disconnect}>Disconnect</button>
    </>}>
    <UploadLayout completed={Boolean(publication.viewerUrl)}>
      <UploadViewPreview url={preview.url} busy={preview.busy} hasDataset={Boolean(facade.reconstruction)} />
      <div className="publication-main">
        {selecting && (!connection.canWrite ? <BucketConnectionForm access="write" /> : <section className="publication-fields" aria-label="Bucket dataset details">
          <label htmlFor={`${id}-access`}>Access</label>
          <div className="publication-access">
            <input id={`${id}-access`} className={fieldClass} value="Bucket permissions" readOnly aria-describedby={`${id}-access-hint`} />
            <p id={`${id}-access-hint`} className="publication-note">Uses your bucket's existing public or private access.</p>
          </div>
          <UploadFormatField id={`${id}-format`} value={format} onChange={setFormat} />
          {format === 'zip' && <UploadImageFormatField id={`${id}-images`} value={imageFormat} onChange={setImageFormat} />}
          <label htmlFor={`${id}-destination`}>Upload folder</label>
          <div className="publication-access">
            <input id={`${id}-destination`} className={fieldClass} value={folder} onChange={event => setFolderEdit({ key: facade.sourceKey, value: event.target.value })} autoComplete="off" />
            <p className="publication-note">Each upload creates a new subfolder.</p>
          </div>
        </section>)}
        {busy && <UploadProgress label="Bucket publication progress" message={publication.message} progressLabel="Bucket upload progress"
          max={publication.filesTotal} value={publication.filesDone}
          detail={publication.filesTotal > 0 ? `${publication.filesDone} / ${publication.filesTotal} files · ${(publication.bytesDone / 1024 / 1024).toFixed(1)} MiB` : undefined}
          cancelDisabled={publication.phase === 'cancelling'} onCancel={bucketPublication.cancel} />}
        {publication.viewerUrl && <UploadResult label="Published bucket dataset" title="Dataset saved to bucket storage"
          notice="Access follows your bucket permissions. Viewers need bucket access for private files."
          viewerUrl={publication.viewerUrl} hub={hub} />}
        {!busy && !selecting && !publication.viewerUrl && <section className="publication-section" aria-label="Bucket upload recovery">
          <p role="status">{publication.message}</p>
          {publication.prefix && <>
            <CopyableField label="Upload folder" value={publication.prefix} />
            {connection.config && <div className="publication-actions"><button type="button" className={secondary} onClick={() => {
              setInspecting(true); void browser.browse(publication.prefix!);
            }}>Browse uploaded files</button></div>}
            {inspecting && <BucketFileList browser={browser} rootPrefix={publication.prefix} />}
          </>}
          <div className="publication-actions"><button type="button" className={secondary} onClick={reset}>Start a new publication</button></div>
        </section>}
      </div>
    </UploadLayout>
    {selecting && <section className="publication-submit" aria-label="Dataset contents">
      {facade.pendingDeletions > 0 && <div className="publication-actions">
        <p>Apply {facade.pendingDeletions} pending image deletions before publishing.</p>
        <button type="button" className={secondary} disabled={applying} onClick={() => { void applyDeletions(); }}>Apply deletions and continue</button>
      </div>}
      <div className="publication-submit-row">
        {!facade.reconstruction && <span className="publication-note">Load a COLMAP dataset to upload it.</span>}
        <button type="button" className={getButtonClass('primary', 'sm')} disabled={!connection.canWrite || !facade.canPublish || applying || hub.busy}
          onClick={() => { void publish(); }}>Upload dataset</button>
      </div>
    </section>}
    {(error || publication.error) && <p role="alert" className="text-ds-error">{error || publication.error}</p>}
  </UploadDialog>;
}
