import { appendFileSync, readFileSync } from 'node:fs';
import { previewAliasUrl } from './profiles.mjs';

const url = previewAliasUrl(readFileSync(process.argv[2], 'utf8'), {
  project: process.env.CLOUDFLARE_PREVIEW_PROJECT,
  branch: process.env.PREVIEW_BRANCH,
});
appendFileSync(process.env.GITHUB_ENV, `PREVIEW_URL=${url}\n`);
console.log(`Preview alias: ${url}`);
