import { useId, useState, useSyncExternalStore } from 'react';
import { bucketConnection } from '../../features/bucketStorage/connection';
import { inferBucketRegion, validateBucketConfig } from '../../features/bucketStorage/paths';
import { BucketError, bucketErrorMessage } from '../../features/bucketStorage/types';
import { getButtonClass, inputStyles } from '../../theme';
import '../upload/upload.css';
import { BucketCorsHelp } from './BucketCorsHelp';
import { accountSessions, accountSessionsSupported } from '../../features/accountSessions/api';

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
  const [remember, setRemember] = useState(false);
  const [saving, setSaving] = useState(false);
  const sessions = useSyncExternalStore(accountSessions.subscribe, accountSessions.getSnapshot);
  const canRemember = accountSessionsSupported() && sessions.capabilities.bucket;
  const willRemember = remember && canRemember && Boolean(accessKeyId.trim() && secretAccessKey.trim());
  const connect = async () => {
    if (saving) return;
    setError(null);
    try {
      if (requireCredentials && (!accessKeyId.trim() || !secretAccessKey.trim())) {
        throw new BucketError(`Enter an access key and secret to ${access === 'write' ? 'upload' : 'connect'}.`);
      }
      const config = validateBucketConfig({ baseUrl, region: region || inferBucketRegion(baseUrl), publicBaseUrl });
      const credentials = { accessKeyId, secretAccessKey, sessionToken };
      if (willRemember) {
        setSaving(true);
        await accountSessions.rememberBucket(config, credentials, access === 'write');
        bucketConnection.connect(config, undefined, access === 'write');
      } else bucketConnection.connect(config, credentials);
      setAccessKeyId(''); setSecretAccessKey(''); setSessionToken('');
      onConnected?.();
    } catch (failure) { setError(failure instanceof Error && remember ? failure.message : bucketErrorMessage(failure)); }
    finally { setSaving(false); }
  };
  return <form className="flex flex-col gap-3" aria-label="Bucket connection" onSubmit={event => { event.preventDefault(); void connect(); }}>
    <p className="publication-note">{willRemember ? 'Credentials are encrypted on ColmapView’s server for up to 30 days. Disconnect forgets this connection.'
      : access === 'write' ? 'Connect with a key that permits uploads. Keys stay in this tab.'
      : requireCredentials ? 'Connect with a key that permits reads. Keys stay in this tab.' : 'Keys are optional and stay in this tab.'}</p>
    <div className="publication-fields">
      <label htmlFor={`${id}-root`}>Bucket URL</label>
      <input id={`${id}-root`} className={fieldClass} type="url" required value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder="https://endpoint.example/my-bucket/" autoComplete="off" />
      <label htmlFor={`${id}-access`}>Access key ID</label>
      <input id={`${id}-access`} className={fieldClass} required={requireCredentials} value={accessKeyId} onChange={event => setAccessKeyId(event.target.value)} autoComplete="off" spellCheck={false} />
      <label htmlFor={`${id}-secret`}>Secret key</label>
      <input id={`${id}-secret`} className={fieldClass} required={requireCredentials} type="password" value={secretAccessKey} onChange={event => setSecretAccessKey(event.target.value)} autoComplete="off" />
    </div>
    <details>
      <summary className="cursor-pointer text-ds-secondary">More options</summary>
      <div className="publication-fields mt-2">
        <label htmlFor={`${id}-region`}>Region</label>
        <input id={`${id}-region`} className={fieldClass} value={region} onChange={event => setRegion(event.target.value)} placeholder={inferBucketRegion(baseUrl)} autoComplete="off" />
        <label htmlFor={`${id}-public`}>Public URL (optional)</label>
        <input id={`${id}-public`} className={fieldClass} type="url" value={publicBaseUrl} onChange={event => setPublicBaseUrl(event.target.value)} placeholder="https://public.example/" autoComplete="off" />
        <label htmlFor={`${id}-token`}>Session token (optional)</label>
        <input id={`${id}-token`} className={fieldClass} type="password" value={sessionToken} onChange={event => setSessionToken(event.target.value)} autoComplete="off" />
      </div>
    </details>
    {canRemember && (requireCredentials || accessKeyId || secretAccessKey) && <label className="flex items-center gap-2 text-ds-secondary">
      <input type="checkbox" checked={remember} disabled={saving} onChange={event => setRemember(event.target.checked)} />Remember this connection
    </label>}
    <div className="flex flex-wrap items-start justify-between gap-2">
      <BucketCorsHelp />
      <button type="submit" disabled={saving} className={`${getButtonClass('primary', 'sm')} flex-shrink-0 ml-auto`}>{saving ? 'Connecting…' : submitLabel}</button>
    </div>
    {error && <p role="alert" className="m-0 text-ds-error">{error}</p>}
  </form>;
}
