import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The Spatial Hub serves a byte-for-byte copy of public/policy.css (colmapview_hub/public/hub/colmapview.css)
// and pins the same hash in colmapview_hub/scripts/check-colmapview-css.mjs. Change both files and both hashes together.
const PINNED = '0f45f4f10386496861760fe68b396e530084fc29714741800a96f5e03200a247';

describe('public/policy.css', () => {
  it('matches the copy the Spatial Hub pins', () => {
    const text = readFileSync(resolve(__dirname, '../../public/policy.css'), 'utf8').replace(/\r\n/g, '\n');
    expect(createHash('sha256').update(text).digest('hex'),
      'Copy public/policy.css to colmapview_hub/public/hub/colmapview.css, then update this hash and the Hub script\'s hash.').toBe(PINNED);
  });
});
