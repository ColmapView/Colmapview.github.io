import { useId, useState } from 'react';
import { bucketConnection } from '../../features/bucketStorage/connection';
import { inferBucketRegion } from '../../features/bucketStorage/paths';
import { BucketError, bucketErrorMessage } from '../../features/bucketStorage/types';
import { getButtonClass, inputStyles } from '../../theme';
import '../upload/upload.css';
import { BucketCorsHelp } from './BucketCorsHelp';

const fieldClass = `${inputStyles.base} ${inputStyles.sizes.sm} w-full min-w-0`;

/** Public reads allow unsigned access; private reads and publishing require tab-only keys. */
export function BucketConnectionForm({ access, onConnected, initialBaseUrl, submitLabel = 'Connect' }: {
  access: 'read' | 'private-read' | 'write'; onConnected?: () => void; initialBaseUrl?: string; submitLabel?: string;
}) {
  const id = useId();
  const requireCredentials = access !== 'read';
  const config = bucketConnection.getSnapshot().config;
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl ?? config?.baseUrl ?? '');
  const sameBucket = !initialBaseUrl || config?.baseUrl === initialBaseUrl;
  const [region, setRegion] = useState(sameBucket ? config?.region ?? '' : '');
  const [publicBaseUrl, setPublicBaseUrl] = useState(sameBucket ? config?.publicBaseUrl ?? '' : '');
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const connect = () => {
    setError(null);
    try {
      if (requireCredentials && (!accessKeyId.trim() || !secretAccessKey.trim())) {
        throw new BucketError(`Enter an access key and secret to ${access === 'write' ? 'upload' : 'connect'}.`);
      }
      bucketConnection.connect({ baseUrl, region: region || inferBucketRegion(baseUrl), publicBaseUrl },
        { accessKeyId, secretAccessKey, sessionToken });
      setAccessKeyId(''); setSecretAccessKey(''); setSessionToken('');
      onConnected?.();
    } catch (failure) { setError(bucketErrorMessage(failure)); }
  };
  return <form className="flex flex-col gap-3" aria-label="Bucket connection" onSubmit={event => { event.preventDefault(); connect(); }}>
    <p className="publication-note">{access === 'write' ? 'Connect with a key that permits uploads. Keys stay in this tab.'
      : requireCredentials ? 'Connect with a key that permits reads. Keys stay in this tab.' : 'Keys are optional and stay in this tab.'}</p>
    <div className="publication-fields">
      <label htmlFor={`${id}-root`}>Bucket URL</label>
      <input id={`${id}-root`} className={fieldClass} type="url" required value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder="https://endpoint.example/my-bucket/" autoComplete="off" />
      <label htmlFor={`${id}-access`}>Access key ID</label>
      <input id={`${id}-access`} className={fieldClass} required={requireCredentials} value={accessKeyId} onChange={event => setAccessKeyId(event.target.value)} autoComplete="off" spellCheck={false} />
      <label htmlFor={`${id}-secret`}>Secret key</label>
      <input id={`${id}-secret`} aria-label="Secret access key" className={fieldClass} required={requireCredentials} type="password" value={secretAccessKey} onChange={event => setSecretAccessKey(event.target.value)} autoComplete="off" />
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
    <div className="flex flex-wrap items-start justify-between gap-2">
      <BucketCorsHelp />
      <button type="submit" className={`${getButtonClass('primary', 'sm')} flex-shrink-0 ml-auto`}>{submitLabel}</button>
    </div>
    {error && <p role="alert" className="m-0 text-ds-error">{error}</p>}
  </form>;
}
