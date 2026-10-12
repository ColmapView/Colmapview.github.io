import { getStorageCorsOrigins } from '../../utils/urlCloudStorage';

export function BucketCorsHelp() {
  return <details className="bucket-cors-help min-w-0 text-ds-secondary text-sm">
    <summary className="cursor-pointer">CORS setup</summary>
    <p className="mt-2 mb-0">Whitelist these viewer origins in your bucket's CORS policy:</p>
    <ul className="my-2 pl-4">{getStorageCorsOrigins().map(origin => <li key={origin} className="break-all">{origin}</li>)}</ul>
    <p className="m-0">Allow GET and HEAD for reads; PUT, POST and DELETE for uploads. Allow request headers and expose ETag, Content-Length, Content-Range and Accept-Ranges.</p>
    <a href="https://developers.cloudflare.com/r2/buckets/cors/" target="_blank" rel="noopener noreferrer" className="underline">Cloudflare CORS instructions</a>
  </details>;
}
