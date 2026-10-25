import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('self-hosted font distribution', () => {
  for (const [family, license] of [
    ['ibm-plex-sans', 'OFL.txt'],
    ['jetbrains-mono', 'JetBrainsMono-OFL.txt'],
  ]) {
    it(`ships the complete upstream copyright and license for ${family}`, () => {
      expect(readFileSync(resolve('public/fonts', license), 'utf8').replace(/\r\n/g, '\n')).toEqual(
        readFileSync(resolve('node_modules/@fontsource-variable', family, 'LICENSE'), 'utf8').replace(/\r\n/g, '\n'),
      );
      expect(readFileSync(resolve('public/about.html'), 'utf8')).toContain(`href="./fonts/${license}"`);
    });
  }

  it('redistributes the public-page font unchanged from the licensed package', () => {
    const font = 'ibm-plex-sans-latin-wght-normal.woff2';
    expect(readFileSync(resolve('public/fonts', font))).toEqual(
      readFileSync(resolve('node_modules/@fontsource-variable/ibm-plex-sans/files', font)),
    );
  });
});
