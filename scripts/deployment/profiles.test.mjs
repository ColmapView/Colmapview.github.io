import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import path from 'node:path';
import yaml from 'js-yaml';
import { CUSTOM_ORIGIN, FIXTURE_GOOGLE_CONFIG, WRANGLER_VERSION, previewAliasUrl, profileEnvironment, safeOutputDirectory, validateBase, validateGithubHfConfiguration, validatePreviewConfiguration, validateReleaseConfiguration } from './profiles.mjs';
import { fetchVerifiedArtifact, htmlSha256, verifyPolicyHtml } from './artifact-verification.mjs';
import { cloudflareStaticHeaders } from './headers.mjs';
import { startArtifactServer } from './static-server.mjs';

const release = {
  CLOUDFLARE_PAGES_ENABLED: 'true', CLOUDFLARE_API_TOKEN_CONFIGURED: 'true',
  CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_PAGES_PROJECT: 'colmapview-production',
  ...FIXTURE_GOOGLE_CONFIG,
};

test('disabled profiles erase inherited test credentials and preview erases provider auth', () => {
  const inherited = { VITE_GOOGLE_DRIVE_API_KEY: 'private-fixture', GOOGLE_DRIVE_API_KEY: 'private-alias', VITE_GOOGLE_DRIVE_ENABLED: 'true', VITE_HF_AUTH_ENABLED: 'true', VITE_HF_OAUTH_CLIENT_ID: 'test-app' };
  for (const profile of ['github', 'preview']) {
    const env = profileEnvironment(profile, inherited);
    assert.equal(env.VITE_GOOGLE_DRIVE_ENABLED, 'false');
    assert.equal(env.VITE_GOOGLE_DRIVE_API_KEY, '');
    assert.equal(env.GOOGLE_DRIVE_API_KEY, '');
    assert.equal(env.VITE_GOOGLE_DRIVE_CLIENT_ID, '');
    assert.equal(env.VITE_GOOGLE_DRIVE_APP_ID, '');
  }
  assert.equal(profileEnvironment('preview', inherited).VITE_HF_AUTH_ENABLED, 'false');
  assert.equal(profileEnvironment('preview', inherited).VITE_HF_OAUTH_CLIENT_ID, '');
  // The job env holds the channel HF settings deploy.yml selected: only real GitHub builds may keep them.
  const devHf = { VITE_HF_PUBLISH_ENABLED: 'true', VITE_HF_AUTH_ENABLED: 'true', VITE_HF_OAUTH_CLIENT_ID: 'dev-id', VITE_HF_OAUTH_REDIRECT_URI: 'https://colmapview.github.io/dev/hf-callback.html' };
  const hfOf = env => [env.VITE_HF_PUBLISH_ENABLED, env.VITE_HF_AUTH_ENABLED, env.VITE_HF_OAUTH_CLIENT_ID, env.VITE_HF_OAUTH_REDIRECT_URI];
  assert.deepEqual(hfOf(profileEnvironment('github', devHf)), Object.values(devHf));
  assert.deepEqual(hfOf(profileEnvironment('github', devHf, true)), ['false', 'false', '', '']);
  for (const profile of ['preview', 'custom']) {
    assert.deepEqual(hfOf(profileEnvironment(profile, { ...FIXTURE_GOOGLE_CONFIG, ...devHf })), ['false', 'false', '', ''], profile);
  }
});

test('custom builds require their own production configuration and exact fixed origin', () => {
  assert.throws(() => profileEnvironment('custom', { VITE_GOOGLE_DRIVE_API_KEY: 'legacy-test' }), /CUSTOM_GOOGLE_DRIVE_API_KEY/);
  const env = profileEnvironment('custom', { ...FIXTURE_GOOGLE_CONFIG, VITE_GOOGLE_DRIVE_API_KEY: 'legacy-test', VITE_HF_AUTH_ENABLED: 'true' });
  assert.equal(env.VITE_GOOGLE_DRIVE_API_KEY, FIXTURE_GOOGLE_CONFIG.CUSTOM_GOOGLE_DRIVE_API_KEY);
  assert.equal(env.VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN, CUSTOM_ORIGIN);
  assert.equal(env.VITE_GOOGLE_DRIVE_ENABLED, 'true');
  assert.equal(env.VITE_HF_AUTH_ENABLED, 'false');
  assert.throws(() => profileEnvironment('custom', { ...FIXTURE_GOOGLE_CONFIG, CUSTOM_HF_AUTH_ENABLED: 'true', CUSTOM_HF_OAUTH_CLIENT_ID: 'fixture', CUSTOM_HF_OAUTH_REDIRECT_URI: 'https://colmapview.github.io/latest/' }), /custom origin/);
  assert.throws(() => profileEnvironment('custom', { ...FIXTURE_GOOGLE_CONFIG, CUSTOM_HF_AUTH_ENABLED: 'true', CUSTOM_HF_OAUTH_CLIENT_ID: 'fixture', CUSTOM_HF_OAUTH_REDIRECT_URI: `${CUSTOM_ORIGIN}/` }), /hf-callback/);
  assert.throws(() => profileEnvironment('custom', { ...FIXTURE_GOOGLE_CONFIG, CUSTOM_HF_AUTH_ENABLED: 'true', CUSTOM_HF_OAUTH_CLIENT_ID: 'fixture', CUSTOM_HF_OAUTH_REDIRECT_URI: `${CUSTOM_ORIGIN}/hf-callback.html` }), /hf-callback/);
  assert.equal(profileEnvironment('custom', { ...FIXTURE_GOOGLE_CONFIG, CUSTOM_HF_AUTH_ENABLED: 'true', CUSTOM_HF_OAUTH_CLIENT_ID: 'fixture', CUSTOM_HF_OAUTH_REDIRECT_URI: `${CUSTOM_ORIGIN}/hf-callback` }).VITE_HF_AUTH_ENABLED, 'true');
});

test('enabled release fails before publication if any required field is missing', () => {
  assert.deepEqual(validateReleaseConfiguration(release, true), { customEnabled: true });
  for (const name of ['CLOUDFLARE_API_TOKEN_CONFIGURED', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_PAGES_PROJECT', ...Object.keys(FIXTURE_GOOGLE_CONFIG)]) {
    assert.throws(() => validateReleaseConfiguration({ ...release, [name]: '' }, true), new RegExp(name.replace('_CONFIGURED', '')));
  }
  assert.throws(() => validateReleaseConfiguration({ ...release, CLOUDFLARE_PAGES_PROJECT: 'project; echo unsafe' }, true), /PROJECT/);
  assert.throws(() => validateReleaseConfiguration({ ...release, CLOUDFLARE_PAGES_ENABLED: 'yes' }, true), /true or false/);
  assert.deepEqual(validateReleaseConfiguration({}, true), { customEnabled: false });
  assert.deepEqual(validateReleaseConfiguration(release, false), { customEnabled: false });
});

test('manual preview requires a separate project and bounded output/base paths', () => {
  assert.throws(() => validatePreviewConfiguration({ ...release, CLOUDFLARE_PREVIEW_PROJECT: release.CLOUDFLARE_PAGES_PROJECT }), /separate/);
  validatePreviewConfiguration({ ...release, CLOUDFLARE_PREVIEW_PROJECT: 'colmapview-preview' });
  assert.throws(() => safeOutputDirectory('..'), /dist or a child/);
  assert.throws(() => safeOutputDirectory('.tmp'), /dist or a child/);
  assert.throws(() => validateBase('custom', '/latest/'), /root base/);
  assert.throws(() => validateBase('github', '/../../'), /absolute directory/);
});

const PUBLICATION_GATES = ['Preflight deployment configuration', 'Build version or dev', 'Build latest', 'Build custom production', 'Smoke prepared artifacts'];
const UNCONDITIONAL_GATES = new Set(['Preflight deployment configuration', 'Build version or dev', 'Smoke prepared artifacts']);

/** Each gate must exist exactly once, by exact name, before the first gh-pages push or Wrangler upload. */
function assertGatesPrecedePublication(workflow) {
  const steps = workflow.jobs.deploy.steps;
  const mutations = steps.flatMap((step, index) =>
    step.uses?.startsWith('peaceiris/actions-gh-pages@') || /\bwrangler\b/.test(step.run ?? '') ? [index] : []);
  assert.ok(mutations.length > 0, 'deploy.yml must publish through gh-pages or Wrangler');
  const firstMutation = Math.min(...mutations);
  for (const name of PUBLICATION_GATES) {
    const matches = steps.flatMap((step, index) => step.name === name ? [index] : []);
    assert.equal(matches.length, 1, `deploy.yml must contain exactly one "${name}" step`);
    assert.ok(matches[0] < firstMutation, `${name} must precede publication`);
    if (UNCONDITIONAL_GATES.has(name)) assert.equal(steps[matches[0]].if, undefined, `${name} must always run`);
  }
}

test('release workflow gates both real artifacts before first publish and pins Wrangler', () => {
  const workflow = yaml.load(readFileSync('.github/workflows/deploy.yml', 'utf8'));
  assertGatesPrecedePublication(workflow);
  const steps = workflow.jobs.deploy.steps;
  const customDeploy = steps.find(step => step.name === 'Deploy custom production');
  assert.match(customDeploy.if, /custom_enabled/);
  assert.match(customDeploy.run, /wrangler@4\.147\.0/);
  assert.match(customDeploy.run, /--branch main/);
  assert.ok(!steps.some(step => step.run?.includes('cp public/google')));
  assert.equal(workflow.jobs.deploy.env.CUSTOM_GOOGLE_DRIVE_CLIENT_ID, '${{ vars.CUSTOM_GOOGLE_DRIVE_CLIENT_ID }}');
  const validation = yaml.load(readFileSync('.github/workflows/e2e.yml', 'utf8'));
  assert.ok(validation.jobs.artifacts.steps.some(step => step.run === 'npm run test:deployment'));
});

test('publication gate check rejects renamed, removed, moved or conditional gates', () => {
  const workflow = yaml.load(readFileSync('.github/workflows/deploy.yml', 'utf8'));
  const smoke = steps => steps.findIndex(step => step.name === 'Smoke prepared artifacts');
  const variants = [
    steps => { steps[smoke(steps)].name = 'Smoke artifacts'; },
    steps => { steps.splice(steps.findIndex(step => step.name === 'Preflight deployment configuration'), 1); },
    steps => { steps.push(...steps.splice(smoke(steps), 1)); },
    steps => { steps[smoke(steps)].if = "github.ref_type == 'tag'"; },
  ];
  for (const mutate of variants) {
    const copy = structuredClone(workflow);
    mutate(copy.jobs.deploy.steps);
    assert.throws(() => assertGatesPrecedePublication(copy), /exactly one|must precede publication|must always run/);
  }
});

test('deployment smoke report and traces land in the uploaded .tmp/deployment-smoke directory', () => {
  const config = readFileSync('scripts/deployment/playwright.config.ts', 'utf8');
  const fromConfig = pattern => path.relative(process.cwd(), path.resolve('scripts/deployment', config.match(pattern)[1])).split(path.sep).join('/');
  assert.equal(fromConfig(/outputFolder: '([^']+)'/), '.tmp/deployment-smoke/report');
  assert.equal(fromConfig(/outputDir: '([^']+)'/), '.tmp/deployment-smoke/results');
  const uploads = ['e2e.yml', 'deploy.yml', 'deploy-preview.yml']
    .flatMap(file => Object.values(yaml.load(readFileSync(`.github/workflows/${file}`, 'utf8')).jobs))
    .flatMap(job => job.steps ?? [])
    .filter(step => step.uses?.startsWith('actions/upload-artifact@') && /smoke/.test(step.with.name));
  assert.equal(uploads.length, 4);
  for (const step of uploads) assert.match(step.with.path, /^\.tmp\/deployment-smoke\/report\/$/m, step.with.name);
  for (const step of uploads) assert.match(step.with.path, /^\.tmp\/deployment-smoke\/results\/$/m, step.with.name);
});

test('Cloudflare deployment token is scoped only to trusted upload steps', () => {
  const releaseWorkflow = yaml.load(readFileSync('.github/workflows/deploy.yml', 'utf8'));
  assert.equal(releaseWorkflow.jobs.deploy.env.CLOUDFLARE_API_TOKEN, undefined);
  for (const step of releaseWorkflow.jobs.deploy.steps) {
    if (step.env?.CLOUDFLARE_API_TOKEN) assert.equal(step.name, 'Deploy custom production');
  }
  const preview = yaml.load(readFileSync('.github/workflows/deploy-preview.yml', 'utf8'));
  assert.equal(preview.jobs.build.env?.CLOUDFLARE_API_TOKEN, undefined);
  assert.ok(!JSON.stringify(preview.jobs.build).includes('secrets.CLOUDFLARE_API_TOKEN'));
  assert.equal(preview.jobs.publish.needs, 'build');
  assert.equal(preview.jobs.publish.steps[0].with.ref, '${{ github.event.repository.default_branch }}');
  assert.equal(preview.jobs.publish.env.CLOUDFLARE_API_TOKEN, undefined);
  for (const step of preview.jobs.publish.steps) {
    if (step.env?.CLOUDFLARE_API_TOKEN) assert.equal(step.name, 'Upload preview only');
  }
  assert.ok(preview.jobs.publish.steps.some(step => step.name === 'Smoke downloaded preview with trusted tests'));
  // Selected-ref code runs in the default branch's cache scope: it must neither restore nor save the npm cache.
  const buildSetup = preview.jobs.build.steps.find(step => step.uses?.startsWith('actions/setup-node@'));
  assert.equal(buildSetup.with.cache, undefined);
  assert.equal(buildSetup.with['package-manager-cache'], false);
  assert.ok(!preview.jobs.build.steps.some(step => step.uses?.startsWith('actions/cache')));
  // Steps holding the token resolve the pinned Wrangler from a fresh job-local npm cache, never a restored ~/.npm.
  const tokenSteps = [...releaseWorkflow.jobs.deploy.steps, ...preview.jobs.publish.steps].filter(step => step.env?.CLOUDFLARE_API_TOKEN);
  assert.deepEqual(tokenSteps.map(step => step.name), ['Deploy custom production', 'Upload preview only']);
  for (const step of tokenSteps) {
    assert.ok(step.run.startsWith(`npx --yes wrangler@${WRANGLER_VERSION} pages deploy `), step.name);
    assert.equal(step.env.npm_config_cache, '${{ runner.temp }}/wrangler-npm-cache', step.name);
  }
  // Untrusted preview code can write default-branch cache entries directly, and a restored archive can write
  // outside ~/.npm, so no job that references the token (even its presence check) restores a dependency cache.
  const tokenJobs = readdirSync('.github/workflows').filter(file => /\.ya?ml$/.test(file)).sort()
    .flatMap(file => Object.entries(yaml.load(readFileSync(`.github/workflows/${file}`, 'utf8')).jobs).map(([name, job]) => [`${file}:${name}`, job]))
    .filter(([, job]) => /CLOUDFLARE_API_TOKEN/i.test(JSON.stringify(job)));
  assert.deepEqual(tokenJobs.map(([id]) => id), ['deploy-preview.yml:publish', 'deploy.yml:deploy']);
  for (const [id, job] of tokenJobs) {
    const setups = job.steps.filter(step => step.uses?.startsWith('actions/setup-node@'));
    assert.ok(setups.length > 0, id);
    for (const setup of setups) {
      assert.equal(setup.with?.cache, undefined, id);
      assert.equal(setup.with?.['package-manager-cache'], false, id);
    }
    assert.ok(!job.steps.some(step => step.uses?.startsWith('actions/cache')), id);
  }
});

test('GitHub Pages builds read release HF settings on tags and development HF settings on branches', () => {
  const deploy = yaml.load(readFileSync('.github/workflows/deploy.yml', 'utf8')).jobs.deploy;
  const env = deploy.env;
  // Pinned verbatim: dropping the `ref_type != 'tag'` guard (`tag && A || B`) would give an unset release value the /dev/ one.
  const flag = (releaseHf, devHf) => `\${{ github.ref_type == 'tag' && vars.${releaseHf} == 'true' || github.ref_type != 'tag' && vars.${devHf} == 'true' }}`;
  const value = (releaseHf, devHf) => `\${{ github.ref_type == 'tag' && vars.${releaseHf} || github.ref_type != 'tag' && vars.${devHf} || '' }}`;
  assert.equal(env.VITE_HF_PUBLISH_ENABLED, flag('HF_PUBLISH_ENABLED', 'HF_DEV_PUBLISH_ENABLED'));
  assert.equal(env.VITE_HF_AUTH_ENABLED, flag('HF_AUTH_ENABLED', 'HF_DEV_AUTH_ENABLED'));
  assert.equal(env.VITE_HF_OAUTH_CLIENT_ID, value('HF_OAUTH_CLIENT_ID', 'HF_DEV_OAUTH_CLIENT_ID'));
  assert.equal(env.VITE_HF_OAUTH_REDIRECT_URI, value('HF_OAUTH_REDIRECT_URI', 'HF_DEV_OAUTH_REDIRECT_URI'));
  assert.ok(!Object.keys(env).some(name => name.startsWith('VITE_GOOGLE_DRIVE_')), 'GitHub builds receive no Drive configuration');
  // The GitHub builds must see exactly this job env: no step may set VITE_HF_* (in its own env, by inline
  // assignment or through $GITHUB_ENV), and --fixture would clear it.
  for (const step of deploy.steps) {
    const label = step.name ?? step.uses;
    assert.ok(!Object.keys(step.env ?? {}).some(name => name.startsWith('VITE_HF_')), `${label} must not set VITE_HF_* in its env`);
    assert.doesNotMatch(step.run ?? '', /\bVITE_HF_\w*=/, `${label} must not assign VITE_HF_*`);
  }
  const githubBuilds = deploy.steps.filter(step => /(?:build-profile\.mjs|build:deployment)\b.*\bgithub\b/.test(step.run ?? ''));
  assert.deepEqual(githubBuilds.map(step => step.name), ['Build version or dev', 'Build latest']);
  for (const step of githubBuilds) assert.doesNotMatch(step.run, /--fixture\b/, `${step.name} must not build with --fixture`);
  assert.doesNotMatch(readFileSync('.github/workflows/deploy-preview.yml', 'utf8'), /VITE_HF_|vars\.(?:CUSTOM_)?HF_/, 'previews receive no provider configuration');
});

test('GitHub Pages HF preflight accepts each channel and rejects incomplete or swapped settings', () => {
  const devHf = { VITE_HF_PUBLISH_ENABLED: 'true', VITE_HF_AUTH_ENABLED: 'false', VITE_HF_OAUTH_CLIENT_ID: '00000000-0000-4000-8000-000000000000', VITE_HF_OAUTH_REDIRECT_URI: 'https://colmapview.github.io/dev/hf-callback.html' };
  const releaseHf = { ...devHf, VITE_HF_OAUTH_REDIRECT_URI: 'https://colmapview.github.io/latest/hf-callback.html' };
  assert.deepEqual(validateGithubHfConfiguration(devHf, false), { hf: 'publish' });
  assert.deepEqual(validateGithubHfConfiguration(releaseHf, true), { hf: 'publish' });
  assert.deepEqual(validateGithubHfConfiguration({ VITE_HF_PUBLISH_ENABLED: 'false', VITE_HF_AUTH_ENABLED: 'false', VITE_HF_OAUTH_CLIENT_ID: '', VITE_HF_OAUTH_REDIRECT_URI: '' }, false), { hf: 'disabled' });
  assert.deepEqual(validateGithubHfConfiguration({}, true), { hf: 'disabled' });
  assert.deepEqual(validateGithubHfConfiguration({ ...devHf, VITE_HF_PUBLISH_ENABLED: 'false', VITE_HF_AUTH_ENABLED: 'true' }, false), { hf: 'read-only' });
  // Callback and client errors name the repository variable to fix for the channel this run reads.
  assert.throws(() => validateGithubHfConfiguration(releaseHf, false), { message: 'HF_DEV_OAUTH_REDIRECT_URI must be https://colmapview.github.io/dev/hf-callback.html.' });
  assert.throws(() => validateGithubHfConfiguration(devHf, true), { message: 'HF_OAUTH_REDIRECT_URI must be https://colmapview.github.io/latest/hf-callback.html.' });
  assert.throws(() => validateGithubHfConfiguration({ ...devHf, VITE_HF_OAUTH_CLIENT_ID: '' }, false), { message: 'HF_DEV_OAUTH_CLIENT_ID is missing or invalid.' });
  assert.throws(() => validateGithubHfConfiguration({ ...devHf, VITE_HF_PUBLISH_ENABLED: 'yes' }, false), { message: 'VITE_HF_PUBLISH_ENABLED must be true or false.' });
});

test('public verification rejects fresh metadata paired with old HTML and accepts the exact prepared artifact', async () => {
  const preparedHtml = '<html><script type="module" src="/assets/new-entry-hash.js"></script></html>';
  let deliveredHtml = '<html><script type="module" src="/assets/old-entry-hash.js"></script></html>';
  const expected = { schemaVersion: 1, sourceSha: 'f'.repeat(40), version: '0.15.4', release: 'v0.15.4', profile: 'github', base: '/latest/', googleDrive: { enabled: false, allowedOrigin: null }, indexHtmlSha256: htmlSha256(preparedHtml) };
  const server = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': request.url.startsWith('/latest/deployment.json') ? 'application/json' : 'text/html' });
    response.end(request.url.startsWith('/latest/deployment.json') ? JSON.stringify(expected) : deliveredHtml);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}/latest/`;
    await assert.rejects(fetchVerifiedArtifact(base, expected), /Delivered HTML does not match/);
    deliveredHtml = preparedHtml;
    assert.deepEqual(await fetchVerifiedArtifact(base, expected), expected);
    await assert.rejects(fetchVerifiedArtifact(base, { ...expected, sourceSha: 'e'.repeat(40) }), /sourceSha differs/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('public verification also requires the exact public viewer URL to serve the prepared HTML', async () => {
  const preparedHtml = '<html><script type="module" src="/assets/new-entry-hash.js"></script></html>';
  const expected = { schemaVersion: 1, sourceSha: 'f'.repeat(40), version: '0.15.4', release: 'v0.15.4', profile: 'github', base: '/latest/', googleDrive: { enabled: false, allowedOrigin: null }, indexHtmlSha256: htmlSha256(preparedHtml) };
  let bareHtml = '<html><script type="module" src="/assets/old-entry-hash.js"></script></html>';
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const metadata = url.pathname === '/latest/deployment.json';
    response.writeHead(200, { 'Content-Type': metadata ? 'application/json' : 'text/html' });
    response.end(metadata ? JSON.stringify(expected) : url.searchParams.has('verify') ? preparedHtml : bareHtml);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}/latest/`;
    await assert.rejects(fetchVerifiedArtifact(base, expected), /Delivered HTML does not match/);
    bareHtml = preparedHtml;
    assert.deepEqual(await fetchVerifiedArtifact(base, expected), expected);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('public policy verification rejects a hosting SPA fallback even when it returns HTTP 200', () => {
  assert.throws(() => verifyPolicyHtml('privacy.html', '<html lang="en"><title>ColmapView</title></html>'), /SPA fallback/);
  verifyPolicyHtml('privacy.html', '<html lang="en"><title>Privacy policy · ColmapView</title></html>');
});

test('preview verification uses the branch alias Wrangler reports instead of assuming the project subdomain', () => {
  const entry = { type: 'pages-deploy-detailed', version: 1, pages_project: 'colmapview-preview', deployment_id: 'id', url: 'https://21fd00ac.colmapview-preview-4xk.pages.dev', alias: 'https://preview-9129c1d95fb8.colmapview-preview-4xk.pages.dev', environment: 'preview' };
  const output = (overrides = {}) => [{ type: 'wrangler-session', version: 1 }, { type: 'pages-deploy', version: 1, pages_project: 'colmapview-preview' }, { ...entry, ...overrides }].map(line => JSON.stringify(line)).join('\n');
  const options = { project: 'colmapview-preview', branch: 'preview-9129c1d95fb8' };
  assert.equal(previewAliasUrl(output(), options), 'https://preview-9129c1d95fb8.colmapview-preview-4xk.pages.dev/');
  assert.throws(() => previewAliasUrl(output({ environment: 'production' }), options), /not production/);
  assert.throws(() => previewAliasUrl(output({ alias: undefined }), options), /branch alias/);
  for (const alias of ['https://preview-000000000000.colmapview-preview.pages.dev', 'https://preview-9129c1d95fb8.attacker.example', 'https://preview-9129c1d95fb8.colmapview-preview.pages.dev/path?x=1',
    'http://preview-9129c1d95fb8.colmapview-preview.pages.dev', 'https://preview-9129c1d95fb8.x.colmapview-preview.pages.dev', 'https://preview-9129c1d95fb8.colmapview-preview.pages.dev:8443', 'https://user:pass@preview-9129c1d95fb8.colmapview-preview.pages.dev']) {
    assert.throws(() => previewAliasUrl(output({ alias }), options), /unexpected/);
  }
  assert.throws(() => previewAliasUrl(output({ pages_project: 'colmapview-opsiclear' }), options), /did not report/);
  const publish = yaml.load(readFileSync('.github/workflows/deploy-preview.yml', 'utf8')).jobs.publish;
  assert.ok(!JSON.stringify(publish).includes('$CLOUDFLARE_PREVIEW_PROJECT.pages.dev'));
  assert.equal(publish.steps.find(step => step.name === 'Upload preview only').env.WRANGLER_OUTPUT_FILE_PATH, '${{ runner.temp }}/wrangler-preview-output.ndjson');
});

test('preview-url.mjs records only a verified alias in GITHUB_ENV, from the file Wrangler writes', () => {
  mkdirSync('.tmp', { recursive: true });
  const directory = mkdtempSync(path.resolve('.tmp/preview-url-'));
  const output = path.join(directory, 'wrangler-preview-output.ndjson');
  const githubEnv = path.join(directory, 'github-env');
  const run = alias => {
    writeFileSync(output, `${JSON.stringify({ type: 'pages-deploy-detailed', version: 1, pages_project: 'colmapview-preview', alias, environment: 'preview' })}\n`);
    writeFileSync(githubEnv, '');
    const env = { ...process.env, GITHUB_ENV: githubEnv, CLOUDFLARE_PREVIEW_PROJECT: 'colmapview-preview', PREVIEW_BRANCH: 'preview-9129c1d95fb8' };
    return spawnSync(process.execPath, ['scripts/deployment/preview-url.mjs', output], { env, encoding: 'utf8' }).status;
  };
  try {
    assert.equal(run('https://preview-9129c1d95fb8.colmapview-preview-4xk.pages.dev'), 0);
    assert.equal(readFileSync(githubEnv, 'utf8'), 'PREVIEW_URL=https://preview-9129c1d95fb8.colmapview-preview-4xk.pages.dev/\n');
    assert.notEqual(run('https://preview-9129c1d95fb8.attacker.example'), 0);
    assert.equal(readFileSync(githubEnv, 'utf8'), '', 'a rejected alias must not reach GITHUB_ENV');
  } finally { rmSync(directory, { recursive: true }); }
  // RUNNER_TEMP is the shell form of runner.temp: the resolver must read the file the upload step writes.
  const steps = yaml.load(readFileSync('.github/workflows/deploy-preview.yml', 'utf8')).jobs.publish.steps;
  assert.equal(steps.find(step => step.name === 'Resolve preview alias')?.run, 'node scripts/deployment/preview-url.mjs "$RUNNER_TEMP/wrangler-preview-output.ndjson"');
});

test('Cloudflare artifact headers preserve HTML on canonical and alias routes without changing asset or metadata rules', async () => {
  mkdirSync('.tmp', { recursive: true });
  const directory = mkdtempSync(path.resolve('.tmp/deployment-headers-'));
  const htmlRoutes = ['/', '/index', '/index.html', '/about', '/about.html', '/privacy', '/privacy.html', '/terms', '/terms.html', '/hf-callback', '/hf-callback.html'];
  writeFileSync(path.join(directory, '_headers'), cloudflareStaticHeaders());
  for (const name of ['index.html', 'about.html', 'privacy.html', 'terms.html', 'hf-callback.html']) writeFileSync(path.join(directory, name), '<html><body>prepared bytes</body></html>');
  for (const name of ['entry.js', 'style.css', 'worker.wasm', 'deployment.json']) writeFileSync(path.join(directory, name), 'fixture');
  const server = await startArtifactServer(directory);
  try {
    for (const route of htmlRoutes) {
      const response = await fetch(`${server.origin}${route}?url=private-file-identifier`);
      assert.equal(response.status, 200, route);
      assert.equal(response.headers.get('cache-control'), 'public, no-cache, no-transform', route);
      assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups');
      assert.equal(response.headers.get('referrer-policy'), 'strict-origin');
      assert.equal(await response.text(), '<html><body>prepared bytes</body></html>');
    }
    for (const name of ['entry.js', 'style.css', 'worker.wasm']) {
      const response = await fetch(`${server.origin}/${name}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store', `${name} must not inherit no-transform`);
    }
    const metadata = await fetch(`${server.origin}/deployment.json`);
    assert.equal(metadata.headers.get('cache-control'), 'no-cache');
    assert.equal((await fetch(`${server.origin}/missing-file`)).status, 404);
  } finally {
    await server.close();
    rmSync(directory, { recursive: true });
  }
});
