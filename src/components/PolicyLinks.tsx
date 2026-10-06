import { publicAsset } from '../utils/paths';
import './policyLinks.css';

/** Open policy pages separately so reviewing them preserves the current dataset. */
export function PolicyLinks({ includeAbout = false, aboutLabel = 'About', align = 'center', className = '' }: {
  includeAbout?: boolean;
  aboutLabel?: string;
  align?: 'start' | 'center';
  className?: string;
}) {
  const links = [
    ...(includeAbout ? [{ label: aboutLabel, file: 'about.html' }] : []),
    { label: 'Privacy', file: 'privacy.html' },
    { label: 'Terms', file: 'terms.html' },
  ];
  const alignment = align === 'start' ? 'justify-start' : 'justify-center';
  return <nav aria-label="Information and policies"
    className={`flex flex-wrap items-center ${alignment} gap-x-3 text-xs text-ds-muted ${className}`}>
    {links.map(link => <a key={link.file} href={publicAsset(link.file)} target="_blank" rel="noopener noreferrer"
      className="policy-link">
      {link.label}
    </a>)}
  </nav>;
}
