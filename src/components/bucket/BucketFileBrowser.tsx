import { ChevronRightIcon } from '../../icons';
import { getButtonClass } from '../../theme';
import { bucketBrowsePrefix, bucketFolderPath, isBucketDatasetKey, type useBucketBrowser } from './useBucketBrowser';

/** Dataset loading filters to loadable objects; upload inspection shows every file without load actions. */
export function BucketFileList({ browser, onLoad, rootPrefix = '' }: {
  browser: ReturnType<typeof useBucketBrowser>; onLoad?: (key: string) => void; rootPrefix?: string;
}) {
  const { prefix, page, listing, browse } = browser;
  const objects = page?.objects.filter(object => !onLoad || isBucketDatasetKey(object.key)) ?? [];
  const ghost = getButtonClass('ghost', 'sm');
  return <div className="flex flex-col gap-2">
    {!onLoad && <p className="publication-note" title={prefix}>{prefix.slice(rootPrefix.length) || 'Upload folder'}</p>}
    <div className="flex gap-2">
      {prefix !== rootPrefix && <button type="button" className={ghost} onClick={() => { void browse(bucketFolderPath(prefix.replace(/\/+$/, '').split('/').slice(0, -1).join('/'))); }}>Up one folder</button>}
      <button type="button" className={`${ghost} ml-auto`} disabled={listing} onClick={() => { void browse(bucketBrowsePrefix(prefix)); }}>Refresh</button>
    </div>
    {listing && <p role="status" className="m-0 text-ds-secondary">Listing files…</p>}
    {page && (page.directories.length > 0 || objects.length > 0) && <div className="border border-ds rounded overflow-y-auto" style={{ maxHeight: 192 }} role="list" aria-label={onLoad ? 'Bucket objects' : 'Uploaded files'}>
      {page.directories.map(key => <div key={key} role="listitem"><button type="button" className="flex w-full items-center justify-between gap-2 text-left px-3 py-1.5 hover-bg-ds-secondary" title={key} onClick={() => { void browse(key); }}>
        <span className="truncate">{key.slice(prefix.length) || key}</span><ChevronRightIcon className="w-3.5 h-3.5 flex-shrink-0" />
      </button></div>)}
      {objects.map(object => <div key={object.key} role="listitem">
        {onLoad ? <button type="button" className="w-full truncate text-left px-3 py-1.5 hover-bg-ds-secondary" title={`${object.key} · ${(object.size / 1024 / 1024).toFixed(1)} MiB`} aria-label={`Load ${object.key}`} onClick={() => onLoad(object.key)}>{object.key.slice(prefix.length) || object.key}</button>
          : <span className="block truncate px-3 py-1.5 text-ds-secondary" title={`${object.key} · ${(object.size / 1024 / 1024).toFixed(1)} MiB`}>{object.key.slice(prefix.length) || object.key}</span>}
      </div>)}
    </div>}
    {page && !listing && !page.directories.length && !objects.length && <p className="m-0 text-ds-secondary">{onLoad ? (page.nextToken ? 'No datasets on this page.' : 'No datasets in this folder.') : 'No uploaded files in this folder.'}</p>}
    {page?.nextToken && <button type="button" className={getButtonClass('secondary', 'sm')} disabled={listing} onClick={() => { void browse(prefix, page.nextToken!); }}>More files</button>}
    {browser.error && <p role="alert" className="m-0 text-ds-error">{browser.error}</p>}
  </div>;
}
