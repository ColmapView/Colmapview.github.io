import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GOOGLE_DRIVE_SCOPE } from './googleDrive/auth';
import { HF_SCOPES } from './huggingface/auth';

/** Visible text only: a scope named in markup or a comment is not a disclosure. */
function privacyPolicyText(): string {
  return readFileSync(resolve('public/privacy.html'), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

describe('privacy policy discloses the provider access the code requests', () => {
  it('names every Hugging Face repository scope, which publishing builds request at every sign-in', () => {
    const policy = privacyPolicyText();
    const repositoryScopes = HF_SCOPES.split(' ').filter(scope => scope.endsWith('-repos'));
    expect(repositoryScopes.length).toBeGreaterThan(0);
    for (const scope of repositoryScopes) expect(policy.includes(scope), `privacy.html must name ${scope}`).toBe(true);
  });

  it('names the Drive scope, the account identifier publication reads and the file marker it writes', () => {
    const policy = privacyPolicyText();
    const driveScope = GOOGLE_DRIVE_SCOPE.split('/').at(-1)!;
    // upload.ts owner() reads about?fields=user(permissionId); start() writes the operation marker.
    for (const term of [driveScope, 'permission ID', 'appProperties']) {
      expect(policy.includes(term), `privacy.html must name ${term}`).toBe(true);
    }
  });
});
