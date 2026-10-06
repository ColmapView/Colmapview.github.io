import { appendFileSync } from 'node:fs';
import { validatePreviewConfiguration, validateReleaseConfiguration } from './profiles.mjs';

const preview = process.argv.includes('--preview');
const result = preview
  ? (validatePreviewConfiguration(process.env), { customEnabled: false })
  : validateReleaseConfiguration(process.env, process.env.GITHUB_REF_TYPE === 'tag');
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `custom_enabled=${result.customEnabled}\n`);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, preview
    ? 'Preview uses a separate Pages project and disables Google Drive and provider sign-in.\n'
    : result.customEnabled
      ? 'Both production artifacts will be validated before uploading. Public checks must pass on both hosts for a completed dual-host release.\n'
      : 'GitHub Pages only: custom production deployment is disabled for this run. This run does not publish or verify the custom host.\n');
}
console.log(preview ? 'Preview configuration validated.' : `Deployment configuration validated; custom production ${result.customEnabled ? 'enabled' : 'disabled'}.`);
