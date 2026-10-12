import { useId, useState } from 'react';
import { bucketConnection } from '../../features/bucketStorage/connection';
import { inferBucketRegion } from '../../features/bucketStorage/paths';
import { BucketError, bucketErrorMessage } from '../../features/bucketStorage/types';
import { getButtonClass, inputStyles } from '../../theme';
import '../upload/upload.css';

const fieldClass = `${inputStyles.base} ${inputStyles.sizes.sm} w-full min-w-0`;

/** Loading allows unsigned reads; publishing needs a signing key. Credentials stay in this tab. */
export function BucketConnectionForm({ access, onConnected }: { access: 'read' | 'write'; onConnected?: () => void }) {
  const id = useId();
  const config = bucketConnection.getSnapshot().config;
  const [baseUrl, setBaseUrl] = useState(config?.baseUrl ?? '');
  const [region, setRegion] = useState(config?.region ?? '');
  const [publicBaseUrl, setPublicBaseUrl] = useState(config?.publicBaseUrl ?? '');
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const connect = () => {
    setError(null);
    try {
      if (access === 'write' && (!accessKeyId.trim() || !secretAccessKey.trim())) {
        throw new BucketError('Enter an access key and secret to upload.');
      }
      bucketConnection.connect({ baseUrl, region: region || inferBucketRegion(baseUrl), publicBaseUrl },
        { accessKeyId, secretAccessKey, sessionToken });
      setAccessKeyId(''); setSecretAccessKey(''); setSessionToken('');
      onConnected?.();
    } catch (failure) { setError(bucketErrorMessage(failure)); }
  };
  return <form className="flex flex-col gap-3" aria-label="Bucket connection" onSubmit={event => { event.preventDefault(); connect(); }}>
    <p className="publication-note">{access === 'write' ? 'Connect with a key that permits uploads. Keys stay in this tab.' : 'Keys are optional and stay in this tab.'}</p>
    <div className="publication-fields">
      <label htmlFor={`${id}-root`}>Bucket URL</label>
      <input id={`${id}-root`} className={fieldClass} type="url" required value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder="https://endpoint.example/my-bucket/" autoComplete="off" />
      <label htmlFor={`${id}-access`}>Access key ID</label>
      <input id={`${id}-access`} className={fieldClass} required={access === 'write'} value={accessKeyId} onChange={event => setAccessKeyId(event.target.value)} autoComplete="off" spellCheck={false} />
      <label htmlFor={`${id}-secret`}>Secret key</label>
      <input id={`${id}-secret`} aria-label="Secret access key" className={fieldClass} required={access === 'write'} type="password" value={secretAccessKey} onChange={event => setSecretAccessKey(event.target.value)} autoComplete="off" />
    </div>
    <details>
      <summary className="cursor-pointer text-ds-secondary">More options</summary>
      <div className="publication-fields mt-2">
        <label htmlFor={`${id}-region`}>Region</label>
        <input id={`${id}-region`} className={fieldClass} value={region} onChange={event => setRegion(event.target.value)} placeholder={inferBucketRegion(baseUrl)} autoComplete="off" />
        <label htmlFor={`${id}-public`}>Public URL</label>
        <input id={`${id}-public`} aria-label="Public bucket URL (optional)" className={fieldClass} type="url" value={publicBaseUrl} onChange={event => setPublicBaseUrl(event.target.value)} placeholder="https://public.example/" autoComplete="off" />
        <label htmlFor={`${id}-token`}>Session token</label>
        <input id={`${id}-token`} aria-label="Session token (optional)" className={fieldClass} type="password" value={sessionToken} onChange={event => setSessionToken(event.target.value)} autoComplete="off" />
      </div>
    </details>
    <div className="flex items-center justify-between gap-2">
      <a href="https://developers.cloudflare.com/r2/buckets/cors/" target="_blank" rel="noopener noreferrer" className="text-ds-secondary underline">CORS setup</a>
      <button type="submit" className={getButtonClass('primary', 'sm')}>Connect</button>
    </div>
    {error && <p role="alert" className="m-0 text-ds-error">{error}</p>}
  </form>;
}
