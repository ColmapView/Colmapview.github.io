import { useEffect, useId, useRef, useState } from 'react';
import { ModalDialogShell } from '../ui/ModalDialogShell';
import { useBucketStorageStoreFacade } from './useBucketStorageStoreFacade';
import { bucketErrorMessage, type BucketPage } from '../../features/bucketStorage/types';
import { bucketKeyUrl, listBucketPage } from '../../features/bucketStorage/client';
import { inferBucketRegion } from '../../features/bucketStorage/paths';
import { isBucketPublishing } from '../../features/bucketStorage/publishDataset';
import { getButtonClass, inputStyles, modalStyles, panelStyles, Z_INDEX } from '../../theme';
import { BucketIcon, ChevronRightIcon, CloseIcon } from '../../icons';
import { UploadProgress, UploadResult } from '../upload/UploadParts';

const fieldClass = `${inputStyles.base} ${inputStyles.sizes.sm} w-full min-w-0`;
const connectionLabelClass = 'w-24 flex-shrink-0 font-normal text-ds-secondary';
const primary = getButtonClass('primary', 'sm');
const secondary = getButtonClass('secondary', 'sm');
const ghost = getButtonClass('ghost', 'sm');
const loadable = (key: string) => /\.(?:zip|tar|tgz|tar\.gz|json|spz|sog|ply|splat|ksplat)$/i.test(key);
const folderPath = (value: string) => value && !value.endsWith('/') ? value + '/' : value;

export function BucketStorageModal({ isOpen, onClose, onLoadUrl }: {
  isOpen: boolean; onClose: () => void; onLoadUrl: (url: string) => void;
}) {
  const id = useId();
  const facade = useBucketStorageStoreFacade();
  const { connection, publication, bucketConnection, bucketPublication } = facade;
  const [mode, setMode] = useState<'url' | 'bucket'>(connection.config ? 'bucket' : 'url');
  const [publicUrl, setPublicUrl] = useState('');
  const [baseUrl, setBaseUrl] = useState(connection.config?.baseUrl ?? '');
  const [region, setRegion] = useState(connection.config?.region ?? '');
  const [publicBaseUrl, setPublicBaseUrl] = useState(connection.config?.publicBaseUrl ?? '');
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [prefix, setPrefix] = useState('');
  const [folder, setFolder] = useState('dataset');
  const [browsing, setBrowsing] = useState(false);
  const [page, setPage] = useState<BucketPage | null>(null);
  const [listing, setListing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listingRef = useRef<AbortController | null>(null);
  const connected = Boolean(connection.config);
  const busy = isBucketPublishing(publication.phase);
  const objects = page?.objects.filter(object => loadable(object.key)) ?? [];
  const path = prefix.trim();
  const browsePrefix = loadable(path) ? path.slice(0, path.lastIndexOf('/') + 1) : folderPath(path);
  useEffect(() => () => { listingRef.current?.abort(); }, []);

  const browse = async (nextPrefix: string, token?: string) => {
    const session = bucketConnection.getSession();
    if (!session) return;
    listingRef.current?.abort();
    const controller = new AbortController();
    listingRef.current = controller;
    setListing(true); setError(null); setPrefix(nextPrefix);
    if (!token) setPage(null);
    try {
      const result = await listBucketPage(session, nextPrefix, controller.signal, { token });
      if (controller.signal.aborted || bucketConnection.getSession() !== session) return;
      setPage(current => token && current ? { objects: [...current.objects, ...result.objects],
        directories: [...new Set([...current.directories, ...result.directories])], nextToken: result.nextToken } : result);
    } catch (failure) {
      if (!controller.signal.aborted && bucketConnection.getSession() === session) setError(bucketErrorMessage(failure));
    } finally { if (listingRef.current === controller) { listingRef.current = null; setListing(false); } }
  };
  const connect = () => {
    setError(null);
    try {
      bucketConnection.connect({ baseUrl, region: region || inferBucketRegion(baseUrl), publicBaseUrl },
        { accessKeyId, secretAccessKey, sessionToken });
      setAccessKeyId(''); setSecretAccessKey(''); setSessionToken('');
      setPrefix(''); setPage(null); setBrowsing(false);
    } catch (failure) { setError(bucketErrorMessage(failure)); }
  };
  const changePrefix = (value: string) => {
    listingRef.current?.abort(); listingRef.current = null;
    setListing(false); setPage(null); setError(null); setPrefix(value);
  };
  const disconnect = () => {
    listingRef.current?.abort(); listingRef.current = null; setListing(false);
    bucketConnection.disconnect(); setPage(null); setBrowsing(false); setError(null);
    setAccessKeyId(''); setSecretAccessKey(''); setSessionToken('');
  };
  const load = (url: string) => { onClose(); onLoadUrl(url); };
  const loadObject = (key: string) => {
    const session = bucketConnection.getSession();
    if (!session) return;
    try { load(bucketKeyUrl(session, key)); } catch (failure) { setError(bucketErrorMessage(failure)); }
  };
  const toggleBrowse = () => {
    if (browsing) {
      listingRef.current?.abort(); listingRef.current = null; setListing(false);
    } else void browse(browsePrefix);
    setBrowsing(!browsing);
  };
  const publish = async () => {
    setError(null);
    try { await facade.publishDataset(folder); } catch (failure) { setError(bucketErrorMessage(failure)); }
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
      </form> : <>
        {!connected ? <form className="flex flex-col gap-2" onSubmit={event => { event.preventDefault(); connect(); }}>
          <p className="m-0 text-ds-secondary">Keys are optional and stay in this tab.</p>
          <div className="flex items-center gap-2">
            <label htmlFor={`${id}-root`} className={connectionLabelClass}>Bucket URL</label>
            <input id={`${id}-root`} className={`${fieldClass} flex-1`} type="url" required value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder="https://endpoint.example/my-bucket/" autoComplete="off" />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor={`${id}-access`} className={connectionLabelClass}>Access key ID</label>
            <input id={`${id}-access`} className={`${fieldClass} flex-1`} value={accessKeyId} onChange={event => setAccessKeyId(event.target.value)} autoComplete="off" spellCheck={false} />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor={`${id}-secret`} className={connectionLabelClass}>Secret key</label>
            <input id={`${id}-secret`} aria-label="Secret access key" className={`${fieldClass} flex-1`} type="password" value={secretAccessKey} onChange={event => setSecretAccessKey(event.target.value)} autoComplete="off" />
          </div>
          <details>
            <summary className="cursor-pointer text-ds-secondary">More options</summary>
            <div className="flex flex-col gap-2 mt-2">
              <div className="flex items-center gap-2">
                <label htmlFor={`${id}-region`} className={connectionLabelClass}>Region</label>
                <input id={`${id}-region`} className={`${fieldClass} flex-1`} value={region} onChange={event => setRegion(event.target.value)} placeholder={inferBucketRegion(baseUrl)} autoComplete="off" />
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor={`${id}-public`} className={connectionLabelClass}>Public URL</label>
                <input id={`${id}-public`} aria-label="Public bucket URL (optional)" className={`${fieldClass} flex-1`} type="url" value={publicBaseUrl} onChange={event => setPublicBaseUrl(event.target.value)} placeholder="https://public.example/" autoComplete="off" />
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor={`${id}-token`} className={connectionLabelClass}>Session token</label>
                <input id={`${id}-token`} aria-label="Session token (optional)" className={`${fieldClass} flex-1`} type="password" value={sessionToken} onChange={event => setSessionToken(event.target.value)} autoComplete="off" />
              </div>
            </div>
          </details>
          <div className="flex items-center justify-between gap-2">
            <a href="https://developers.cloudflare.com/r2/buckets/cors/" target="_blank" rel="noopener noreferrer" className="text-ds-secondary underline">CORS setup</a>
            <button type="submit" className={primary}>Connect</button>
          </div>
        </form> : <>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-ds-secondary truncate" title={connection.config!.baseUrl}>{new URL(connection.config!.baseUrl).host}</span>
            <button type="button" className={`${ghost} ml-auto`} onClick={disconnect}>Disconnect</button>
          </div>
          {facade.retryLink && <button type="button" className={secondary} onClick={() => { onClose(); void facade.retryLink?.(); }}>Retry shared link</button>}
          <section className="flex flex-col gap-2" aria-label="Bucket files">
            <form className="flex flex-col gap-2" onSubmit={event => {
              event.preventDefault(); loadObject(loadable(path) ? path : folderPath(path));
            }}>
              <input className={fieldClass} aria-label="Dataset path" value={prefix} onChange={event => changePrefix(event.target.value)} placeholder="Folder, manifest.json, or archive" autoComplete="off" />
              <div className="flex items-center justify-between gap-2">
                <button type="button" className={ghost} aria-expanded={browsing} aria-controls={`${id}-files`} onClick={toggleBrowse}>Browse files</button>
                <button type="submit" className={primary} disabled={busy}>Load dataset</button>
              </div>
            </form>
            {browsing && <div id={`${id}-files`} className="flex flex-col gap-2">
              <div className="flex gap-2">
                {prefix && <button type="button" className={ghost} onClick={() => { void browse(folderPath(prefix.replace(/\/+$/, '').split('/').slice(0, -1).join('/'))); }}>Up one folder</button>}
                <button type="button" className={`${ghost} ml-auto`} disabled={listing} onClick={() => { void browse(browsePrefix); }}>Refresh</button>
              </div>
              {listing && <p role="status" className="m-0 text-ds-secondary">Listing files…</p>}
              {page && (page.directories.length > 0 || objects.length > 0) && <div className="border border-ds rounded overflow-y-auto" style={{ maxHeight: 192 }} role="list" aria-label="Bucket objects">
                {page.directories.map(key => <div key={key} role="listitem"><button type="button" className="flex w-full items-center justify-between gap-2 text-left px-3 py-1.5 hover-bg-ds-secondary" title={key} onClick={() => { void browse(key); }}>
                  <span className="truncate">{key.slice(prefix.length) || key}</span><ChevronRightIcon className="w-3.5 h-3.5 flex-shrink-0" />
                </button></div>)}
                {objects.map(object => <div key={object.key} role="listitem"><button type="button" className="w-full truncate text-left px-3 py-1.5 hover-bg-ds-secondary" disabled={busy} title={`${object.key} · ${(object.size / 1024 / 1024).toFixed(1)} MiB`} aria-label={`Load ${object.key}`} onClick={() => loadObject(object.key)}>{object.key.slice(prefix.length) || object.key}</button></div>)}
              </div>}
              {page && !listing && !page.directories.length && !objects.length && <p className="m-0 text-ds-secondary">{page.nextToken ? 'No datasets on this page.' : 'No datasets in this folder.'}</p>}
              {page?.nextToken && <button type="button" className={secondary} disabled={listing} onClick={() => { void browse(prefix, page.nextToken!); }}>More files</button>}
            </div>}
          </section>
          {connection.canWrite && <section className="publication-body flex flex-col gap-3 border-t border-ds pt-3" aria-label="Bucket upload">
            <h3 className="m-0 font-semibold">Upload dataset</h3>
            {publication.phase === 'idle' ? <>
              <form className="flex flex-col gap-2" onSubmit={event => { event.preventDefault(); void publish(); }}>
                <div className="publication-fields">
                  <label htmlFor={`${id}-bucket-access`}>Access</label>
                  <div className="publication-access">
                    <input id={`${id}-bucket-access`} className={fieldClass} value="Bucket permissions" readOnly aria-describedby={`${id}-bucket-access-hint`} />
                    <p id={`${id}-bucket-access-hint`} className="publication-note">Uses your bucket's existing public or private access.</p>
                  </div>
                  <label htmlFor={`${id}-destination`}>Upload folder</label>
                  <div className="publication-access">
                    <input id={`${id}-destination`} className={fieldClass} value={folder} onChange={event => setFolder(event.target.value)} autoComplete="off" />
                    <p className="publication-note">Each upload creates a new subfolder.</p>
                  </div>
                </div>
                <div className="publication-submit">
                  <p className="publication-note">Includes original images, masks, splats, and viewer settings. Original image metadata is retained.</p>
                  <div className="publication-submit-row"><button type="submit" className={primary} disabled={!facade.canPublish}>Upload dataset</button></div>
                </div>
              </form>
              {!facade.canPublish && <p className="m-0 text-ds-secondary">{facade.pendingDeletions ? 'Apply or clear pending deletions first.' : 'Load a COLMAP dataset to upload it.'}</p>}
            </> : <>
              {busy && <UploadProgress label="Bucket publication progress" message={publication.message} progressLabel="Bucket upload progress"
                max={publication.filesTotal} value={publication.filesDone}
                detail={publication.filesTotal > 0 ? `${publication.filesDone} / ${publication.filesTotal} files · ${(publication.bytesDone / 1024 / 1024).toFixed(1)} MiB` : undefined}
                cancelDisabled={publication.phase === 'cancelling'} onCancel={bucketPublication.cancel} />}
              {publication.viewerUrl && <UploadResult label="Published bucket dataset" title="Dataset saved to bucket storage"
                notice="Access follows your bucket permissions. Viewers need bucket access for private files."
                viewerUrl={publication.viewerUrl} linkLabel="Bucket viewer link" onReset={bucketPublication.reset} />}
              {!busy && !publication.viewerUrl && <section className="publication-section" aria-label="Bucket upload recovery">
                <p role="status">{publication.message}</p>
                <div className="publication-actions"><button type="button" className={secondary} onClick={bucketPublication.reset}>Start a new publication</button></div>
              </section>}
            </>}
          </section>}
        </>}
      </>}
      {(error || publication.error) && <p role="alert" className="m-0 text-ds-error">{error || publication.error}</p>}
    </div>
  </ModalDialogShell>;
}
