import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PolicyLinks } from './PolicyLinks';

afterEach(cleanup);

describe('policy links DOM', () => {
  it.each([
    { name: 'account', aboutLabel: undefined, className: '', labels: ['Privacy', 'Terms'] },
    { name: 'About panel', aboutLabel: 'Website', className: 'hotkey-help-about-policies', labels: ['Website', 'Privacy', 'Terms'] },
  ])('preserves the $name navigation and links', ({ aboutLabel, className, labels }) => {
    render(<PolicyLinks aboutLabel={aboutLabel} className={className} />);
    const nav = screen.getByRole('navigation', { name: 'Information and policies' });
    expect(nav.className).toBe(`flex flex-wrap items-center justify-start gap-x-3 text-xs text-ds-muted ${className}`);
    const links = within(nav).getAllByRole('link');
    expect(links.map(link => link.textContent)).toEqual(labels);
    expect(links.map(link => link.getAttribute('href'))).toEqual(aboutLabel
      ? ['/about.html', '/privacy.html', '/terms.html'] : ['/privacy.html', '/terms.html']);
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(link).toHaveAttribute('class', 'policy-link');
    }
  });
});
