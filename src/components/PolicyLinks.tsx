import { publicAsset } from '../utils/paths';
import './policyLinks.css';

/** Open policy pages separately so reviewing them preserves the current dataset. */
export function PolicyLinks({ aboutLabel, className = '' }: {
  aboutLabel?: string;
  className?: string;
}) {
  const links = [
    ...(aboutLabel ? [{ label: aboutLabel, file: 'about.html' }] : []),
    { label: 'Privacy', file: 'privacy.html' },
    { label: 'Terms', file: 'terms.html' },
  ];
  return <nav aria-label="Information and policies"
    className={`flex flex-wrap items-center justify-start gap-x-3 text-xs text-ds-muted ${className}`}>
    {links.map(link => <a key={link.file} href={publicAsset(link.file)} target="_blank" rel="noopener noreferrer"
      className="policy-link">
      {link.label}
    </a>)}
  </nav>;
}
