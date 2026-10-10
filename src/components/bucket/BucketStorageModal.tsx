import { useEffect, useId, useRef, useState } from 'react';
import { ModalDialogShell } from '../ui/ModalDialogShell';
import { useBucketStorageStoreFacade } from './useBucketStorageStoreFacade';
import { bucketErrorMessage, type BucketPage } from '../../features/bucketStorage/types';
import { bucketKeyUrl, listBucketPage } from '../../features/bucketStorage/client';
import { inferBucketRegion } from '../../features/bucketStorage/paths';
import { isBucketPublishing } from '../../features/bucketStorage/publishDataset';
import { getButtonClass, inputStyles, modalStyles, panelStyles, Z_INDEX } from '../../theme';
import { BucketIcon, CloseIcon } from '../../icons';
import { copyToClipboard } from '../../utils/clipboard';

const fieldClass = `${inputStyles.base} ${inputStyles.sizes.sm} w-full min-w-0`;
const primary = getButtonClass('primary', 'sm');
const secondary = getButtonClass('secondary', 'sm');
const ghost = getButtonClass('ghost', 'sm');
const emptyPage = (): BucketPage => ({ objects: [], directories: [], nextToken: null });
const loadable = (key: string) => /\.(?:zip|tar|tgz|tar\.gz|json|spz|sog|ply|splat|ksplat)$/i.test(key);

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
  const [objectPath, setObjectPath] = useState('');
  const [folder, setFolder] = useState('dataset');
  const [page, setPage] = useState<BucketPage>(emptyPage);
  const [listing, setListing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const listingRef = useRef<AbortController | null>(null);
  const connected = Boolean(connection.config);
  const busy = isBucketPublishing(publication.phase);
  useEffect(() => () => { listingRef.current?.abort(); }, []);

  const browse = async (nextPrefix: string, token?: string) => {
    const session = bucketConnection.getSession();
    if (!session) return;
    listingRef.current?.abort();
    const controller = new AbortController();
    listingRef.current = controller;
    setListing(true); setError(null); setPrefix(nextPrefix);
    if (!token) setPage(emptyPage());
    try {
      const result = await listBucketPage(session, nextPrefix, controller.signal, { token });
      if (controller.signal.aborted || bucketConnection.getSession() !== session) return;
      setPage(current => token ? { objects: [...current.objects, ...result.objects],
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
      void browse('');
    } catch (failure) { setError(bucketErrorMessage(failure)); }
  };
  const changePrefix = (value: string) => {
    listingRef.current?.abort(); listingRef.current = null;
    setListing(false); setPage(emptyPage()); setError(null); setPrefix(value);
  };
  const disconnect = () => {
    listingRef.current?.abort(); listingRef.current = null; setListing(false);
    bucketConnection.disconnect(); setPage(emptyPage()); setError(null);
    setAccessKeyId(''); setSecretAccessKey(''); setSessionToken('');
  };
  const load = (url: string) => { onClose(); onLoadUrl(url); };
  const loadObject = (key: string) => {
    const session = bucketConnection.getSession();
    if (!session) return;
    try { load(bucketKeyUrl(session, key)); } catch (failure) { setError(bucketErrorMessage(failure)); }
  };
  const publish = async () => {
    setError(null); setCopied(false);
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
        <button type="button" className={mode === 'url' ? primary : secondary} aria-pressed={mode === 'url'} onClick={() => setMode('url')}>Public URL</button>
        <button type="button" className={mode === 'bucket' ? primary : secondary} aria-pressed={mode === 'bucket'} onClick={() => setMode('bucket')}>S3 bucket</button>
      </div>
      {mode === 'url' ? <form className="flex flex-col gap-2" onSubmit={event => { event.preventDefault(); if (publicUrl.trim()) load(publicUrl.trim()); }}>
        <p className="m-0 text-ds-secondary">Open a public dataset folder, manifest, ZIP, or TAR. No keys needed.</p>
        <label htmlFor={`${id}-url`}>Dataset URL</label>
        <input id={`${id}-url`} className={fieldClass} type="url" required value={publicUrl} onChange={event => setPublicUrl(event.target.value)} placeholder="https://bucket.example/dataset/manifest.json" />
        <div className="flex justify-end"><button type="submit" className={primary}>Load dataset</button></div>
      </form> : <>
        {!connected ? <form className="flex flex-col gap-2" onSubmit={event => { event.preventDefault(); connect(); }}>
          <p className="m-0 text-ds-secondary">AWS S3, Cloudflare R2, and MinIO. Keys stay in this tab until you disconnect.</p>
          <label htmlFor={`${id}-root`}>Bucket URL</label>
          <input id={`${id}-root`} className={fieldClass} type="url" required value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder="https://endpoint.example/my-bucket/" autoComplete="off" />
          <details>
            <summary className="cursor-pointer text-ds-secondary">Credentials for private reads and uploads</summary>
            <div className="flex flex-col gap-2 mt-2">
              <label htmlFor={`${id}-access`}>Access key ID</label>
              <input id={`${id}-access`} className={fieldClass} value={accessKeyId} onChange={event => setAccessKeyId(event.target.value)} autoComplete="off" spellCheck={false} />
              <label htmlFor={`${id}-secret`}>Secret access key</label>
              <input id={`${id}-secret`} className={fieldClass} type="password" value={secretAccessKey} onChange={event => setSecretAccessKey(event.target.value)} autoComplete="off" />
              <label htmlFor={`${id}-token`}>Session token (optional)</label>
              <input id={`${id}-token`} className={fieldClass} type="password" value={sessionToken} onChange={event => setSessionToken(event.target.value)} autoComplete="off" />
            </div>
          </details>
          <details>
            <summary className="cursor-pointer text-ds-secondary">Region and public URL</summary>
            <div className="flex flex-col gap-2 mt-2">
              <label htmlFor={`${id}-region`}>Region</label>
              <input id={`${id}-region`} className={fieldClass} value={region} onChange={event => setRegion(event.target.value)} placeholder={inferBucketRegion(baseUrl)} autoComplete="off" />
              <label htmlFor={`${id}-public`}>Public bucket URL (optional)</label>
              <input id={`${id}-public`} className={fieldClass} type="url" value={publicBaseUrl} onChange={event => setPublicBaseUrl(event.target.value)} placeholder="https://public.example/" autoComplete="off" />
            </div>
          </details>
          <div className="flex justify-end"><button type="submit" className={primary}>Connect</button></div>
        </form> : <>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-ds-secondary truncate" title={connection.config!.baseUrl}>{connection.canWrite ? 'Connected' : 'Public reads'} · {new URL(connection.config!.baseUrl).host}</span>
            <button type="button" className={`${ghost} ml-auto`} onClick={disconnect}>Disconnect</button>
          </div>
          {facade.retryLink && <button type="button" className={secondary} onClick={() => { onClose(); void facade.retryLink?.(); }}>Retry shared link</button>}
          <section className="flex flex-col gap-2" aria-label="Bucket files">
            <form className="flex gap-2" onSubmit={event => { event.preventDefault(); void browse(prefix); }}>
              <input className={fieldClass} aria-label="Bucket folder" value={prefix} onChange={event => changePrefix(event.target.value)} placeholder="Folder prefix" autoComplete="off" />
              <button type="submit" className={secondary} disabled={listing}>Browse</button>
              <button type="button" className={secondary} disabled={busy} onClick={() => loadObject(prefix.endsWith('/') || !prefix ? prefix : prefix + '/')}>Load folder</button>
            </form>
            {listing && <p role="status" className="m-0 text-ds-secondary">Listing objects…</p>}
            {(page.directories.length > 0 || page.objects.length > 0) && <div className="border border-ds rounded overflow-y-auto" style={{ maxHeight: 192 }} role="list" aria-label="Bucket objects">
              {page.directories.map(key => <div key={key} role="listitem"><button type="button" className="w-full text-left px-3 py-1.5 hover-bg-ds-secondary" onClick={() => { void browse(key); }}>{key.slice(prefix.length) || key}</button></div>)}
              {page.objects.filter(object => !object.key.endsWith('/')).map(object => <div key={object.key} role="listitem" className="flex items-center gap-2 px-3 py-1.5">
                <span className="truncate mr-auto" title={object.key}>{object.key.slice(prefix.length) || object.key}</span>
                <span className="text-ds-secondary">{(object.size / 1024 / 1024).toFixed(1)} MiB</span>
                {loadable(object.key) && <button type="button" className={ghost} disabled={busy} aria-label={`Load ${object.key}`} onClick={() => loadObject(object.key)}>Load</button>}
              </div>)}
            </div>}
            {page.nextToken && <button type="button" className={secondary} disabled={listing} onClick={() => { void browse(prefix, page.nextToken!); }}>More objects</button>}
            <form className="flex gap-2" onSubmit={event => { event.preventDefault(); if (objectPath) loadObject(objectPath); }}>
              <input className={fieldClass} aria-label="Object path" value={objectPath} onChange={event => setObjectPath(event.target.value)} placeholder="manifest.json or dataset.zip" autoComplete="off" />
              <button type="submit" className={secondary} disabled={busy}>Load object</button>
            </form>
          </section>
          {connection.canWrite && <section className="flex flex-col gap-2 border-t border-ds pt-3" aria-label="Bucket upload">
            {publication.phase === 'idle' ? <>
              <p className="m-0 text-ds-secondary">Upload the current dataset, original images, and viewer settings into a new subfolder.</p>
              <form className="flex gap-2" onSubmit={event => { event.preventDefault(); void publish(); }}>
                <input className={fieldClass} aria-label="Upload folder" value={folder} onChange={event => setFolder(event.target.value)} autoComplete="off" />
                <button type="submit" className={primary} disabled={!facade.canPublish}>Upload dataset</button>
              </form>
              {!facade.canPublish && <p className="m-0 text-ds-secondary">{facade.pendingDeletions ? 'Apply or clear pending deletions first.' : 'Load a COLMAP dataset to upload it.'}</p>}
            </> : <>
              <p role="status" className="m-0">{publication.message}</p>
              {busy && <><progress className="w-full" aria-label="Bucket upload progress" max={publication.filesTotal || 1} value={publication.filesDone} />
                <div className="flex items-center gap-2"><span className="text-ds-secondary">{publication.filesDone}/{publication.filesTotal} files · {(publication.bytesDone / 1024 / 1024).toFixed(1)} MiB</span>
                  <button type="button" className={`${secondary} ml-auto`} disabled={publication.phase === 'cancelling'} onClick={bucketPublication.cancel}>Cancel upload</button></div></>}
              {publication.viewerUrl && <>
                <p className="m-0 text-ds-secondary">Public buckets open without keys. Private viewers must connect to the bucket.</p>
                <div className="flex gap-2"><input className={fieldClass} aria-label="Bucket viewer link" readOnly value={publication.viewerUrl} onFocus={event => event.target.select()} />
                  <button type="button" className={primary} onClick={() => { void copyToClipboard(publication.viewerUrl!).then(setCopied); }}>{copied ? 'Copied' : 'Copy link'}</button></div>
              </>}
              {publication.prefix && <p className="m-0 text-ds-secondary break-all">{publication.prefix}</p>}
              {!busy && <button type="button" className={secondary} onClick={bucketPublication.reset}>New upload</button>}
            </>}
          </section>}
        </>}
        <p className="m-0 text-ds-secondary">The bucket must allow this viewer in its CORS policy. <a href="https://developers.cloudflare.com/r2/buckets/cors/" target="_blank" rel="noopener noreferrer" className="underline">Setup</a></p>
      </>}
      {(error || publication.error) && <p role="alert" className="m-0 text-ds-warning">{error || publication.error}</p>}
    </div>
  </ModalDialogShell>;
}
