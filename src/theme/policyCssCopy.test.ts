import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The ColmapView Hub serves a byte-for-byte copy of public/policy.css (colmapview_hub/public/hub/colmapview.css)
// and pins the same hash in colmapview_hub/scripts/check-colmapview-css.mjs. Change both files and both hashes together.
const PINNED = '3f4a63e60475947785a400fc0e804ffe1b011f558beca064d127db266ed1409e';

describe('public/policy.css', () => {
  it('matches the copy the ColmapView Hub pins', () => {
    const text = readFileSync(resolve(__dirname, '../../public/policy.css'), 'utf8').replace(/\r\n/g, '\n');
    expect(createHash('sha256').update(text).digest('hex'),
      'Copy public/policy.css to colmapview_hub/public/hub/colmapview.css, then update this hash and the Hub script\'s hash.').toBe(PINNED);
  });
});
