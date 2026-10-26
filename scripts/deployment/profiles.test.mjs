import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import path from 'node:path';
import yaml from 'js-yaml';
import { CUSTOM_ORIGIN, FIXTURE_GOOGLE_CONFIG, WRANGLER_VERSION, previewAliasUrl, profileEnvironment, safeOutputDirectory, validateBase, validateGithubHfConfiguration, validatePreviewConfiguration, validateReleaseConfiguration, validateReleaseTag } from './profiles.mjs';
import { fetchVerifiedArtifact, htmlSha256, verifyPolicyHtml } from './artifact-verification.mjs';
import { cloudflareStaticHeaders } from './headers.mjs';
import { startArtifactServer } from './static-server.mjs';
import { githubRootTarget, githubHubTarget, githubShareTarget } from './github-share-redirect.mjs';
import { archivedPage } from './prepare-archived-pages.mjs';

test('archive privacy patches remove only known analytics and remote font integrations', () => {
  const content = '<script type="module" src="/v0.3.3/assets/viewer.js"></script><link href="/v0.3.3/assets/style.css" rel="stylesheet">';
  const html = '<html><head><script async src="https://www.googletagmanager.com/gtag/js?id=G-7K5H83SEMY"></script>'
    + '<script>window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} '
    + 'gtag(\'js\', new Date()); gtag(\'config\', \'G-7K5H83SEMY\');</script>'
    + '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Roboto" rel="stylesheet">'
    + content + '</head><body><div id="root"></div></body></html>';
  const clean = archivedPage(html);
  assert.ok(clean.includes(content));
  assert.ok(clean.includes('<body><div id="root"></div></body>'));
  assert.doesNotMatch(clean, /googletagmanager|fonts\.googleapis|gtag\(/);
  assert.match(clean, /name="colmapview-hosted-privacy-update"/);
  assert.equal(archivedPage(clean), clean);
  assert.equal(archivedPage('<head>' + content + '</head>'), '<head>' + content + '</head>');
  assert.throws(() => archivedPage('<head><script>gtag("config", "unknown"); otherAppCode();</script></head>'), /Unrecognized/);
  const steps = yaml.load(readFileSync('.github/workflows/deploy.yml', 'utf8')).jobs.deploy.steps;
  const preparation = steps.findIndex(step => step.name === 'Prepare archived pages without Google analytics or font requests');
  assert.ok(preparation > steps.findIndex(step => step.name === 'Create root redirect'));
  assert.ok(preparation < steps.findIndex(step => step.name === 'Smoke prepared artifacts'));
  assert.equal(steps[preparation].if, "steps.target.outputs.is_release == 'true'");
});

test('GitHub root forwarding retains dataset queries and fragments at the fixed latest path', () => {
  for (const suffix of ['', '?url=https%3A%2F%2Fexample.org%2Fscene%3Fa%3D1%26b%3D2#view', '?next=https://evil.example#//evil.example']) {
    const location = new URL('https://colmapview.github.io/' + suffix);
    assert.equal(githubRootTarget(location), '/latest/' + location.search + location.hash);
    assert.equal(new URL(githubRootTarget(location), location).origin, location.origin);
  }
  for (const pathname of ['/latest/', '/s/HappyTree', '/unknown', '//evil.example']) {
    assert.equal(githubRootTarget({ pathname, search: '?url=x', hash: '#frame' }), null);
  }
});

test('GitHub short links forward only recognized IDs to the fixed Hub host', () => {
  for (const id of ['HappyTree', 'happytree', 'HAPPYTREE', 'CalmRiver-AAAAAAAAAAAAAAAA', 'CalmRiver-LAAAAAAAAAAAAAAAA']) {
    assert.equal(githubShareTarget(`/s/${id}`), `https://colmapview.opsiclear.com/s/${id}`);
    assert.equal(githubShareTarget(`/s/${id}/`), `https://colmapview.opsiclear.com/s/${id}`);
  }
  assert.equal(githubShareTarget('/s/%48appyTree'), 'https://colmapview.opsiclear.com/s/HappyTree');
  for (const pathname of ['/s/', '/s/tiny', '/s/HappyTree/extra', '/hub/HappyTree', '/latest/',
    '/s/%2f%2fevil.example', '/s/%00HappyTree', '/s/%ZZ', '/s/HappyTree?url=https://evil.example']) {
    assert.equal(githubShareTarget(pathname), null, pathname);
  }
});

test('GitHub Hub entry points preserve catalog filters and select only the GitHub viewer', () => {
  for (const pathname of ['/hub', '/hub/', '/hub/index.html', '/hub/datasets', '/hub/datasets/', '/hub/datasets/index.html']) {
    const search = '?q=two+words&dataset=hf-scene&photos=available&licenseCategory=commercial&sort=new&page=2'
      + '&viewerHost=https://evil.example&url=https://private.example/&code=secret&state=secret&next=https://evil.example';
    const target = new URL(githubHubTarget({ pathname, search, hash: '#delete-key' }));
    assert.equal(target.origin, 'https://colmapview.opsiclear.com');
    assert.equal(target.pathname, '/hub/datasets/');
    assert.deepEqual(Object.fromEntries(target.searchParams), { q: 'two words', dataset: 'hf-scene', licenseCategory: 'commercial',
      sort: 'new', photos: 'available', page: '2', viewerHost: 'github' });
    assert.equal(target.hash, '');
  }
  assert.equal(githubHubTarget({ pathname: '/hub/' }), 'https://colmapview.opsiclear.com/hub/datasets/?viewerHost=github');
  for (const pathname of ['/hub/manage/HappyTree', '/hub/HappyTree', '/hub/datasets/api/entries', '/hub/datasets/individual/index.json',
    '/hub/other', '/hubx/', '/latest/hub/', '/unknown', '//evil.example/hub/']) {
    assert.equal(githubHubTarget({ pathname, search: '?next=https://evil.example' }), null, pathname);
  }
});

test('GitHub root routing is built before smoke checks and publishes the tested artifact', () => {
  const steps = yaml.load(readFileSync('.github/workflows/deploy.yml', 'utf8')).jobs.deploy.steps;
  const build = steps.findIndex(step => step.name === 'Create root redirect');
  assert.ok(build >= 0 && build < steps.findIndex(step => step.name === 'Smoke prepared artifacts'));
  assert.equal(steps[build].run, 'node scripts/deployment/build-github-root.mjs');
  const output = '.tmp/deployment-root-test';
  const result = spawnSync(process.execPath, ['scripts/deployment/build-github-root.mjs', `--out=${output}`]);
  assert.equal(result.status, 0, result.stderr.toString());
  const index = readFileSync(`${output}/index.html`, 'utf8');
  assert.match(index, /<noscript><meta http-equiv="refresh" content="0; url=\/latest\/">/);
  assert.match(index, /src="\/share-redirect.js\?v=[a-f0-9]{12}"/);
  assert.match(readFileSync(`${output}/404.html`, 'utf8'), /src="\/share-redirect.js\?v=[a-f0-9]{12}"/);
  for (const directory of ['hub', 'hub/datasets']) {
    const hub = readFileSync(`${output}/${directory}/index.html`, 'utf8');
    assert.match(hub, /<noscript><meta http-equiv="refresh" content="0; url=https:\/\/colmapview.opsiclear.com\/hub\/datasets\/\?viewerHost=github">/);
    assert.match(hub, /name="referrer" content="no-referrer"/);
    assert.match(hub, /src="\/share-redirect.js\?v=[a-f0-9]{12}"/);
  }
  assert.equal(readFileSync(`${output}/share-redirect.js`, 'utf8'), readFileSync('scripts/deployment/github-share-redirect.mjs', 'utf8'));
  assert.equal(steps.find(step => step.name === 'Deploy root').with.publish_dir, './.tmp/deployment/root');
});

const release = {
  CLOUDFLARE_PAGES_ENABLED: 'true', CLOUDFLARE_API_TOKEN_CONFIGURED: 'true',
  CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_PAGES_PROJECT: 'colmapview-production',
  ...FIXTURE_GOOGLE_CONFIG,
};

test('disabled profiles erase inherited test credentials and preview erases provider auth', () => {
  const inherited = { VITE_GOOGLE_DRIVE_API_KEY: 'private-fixture', GOOGLE_DRIVE_API_KEY: 'private-alias', VITE_GOOGLE_DRIVE_ENABLED: 'true', VITE_HF_AUTH_ENABLED: 'true', VITE_HF_OAUTH_CLIENT_ID: 'test-app', HF_OAUTH_CLIENT_ID: 'inherited-alias', VITE_HUB_BASE_URL: 'http://localhost:5201/hub' };
  for (const profile of ['github', 'preview']) {
    const env = profileEnvironment(profile, inherited);
    assert.equal(env.VITE_GOOGLE_DRIVE_ENABLED, 'false');
    assert.equal(env.VITE_ACCOUNT_SESSIONS_ENABLED, 'false');
    assert.equal(env.VITE_GOOGLE_DRIVE_API_KEY, '');
    assert.equal(env.GOOGLE_DRIVE_API_KEY, '');
    assert.equal(env.VITE_GOOGLE_DRIVE_CLIENT_ID, '');
    assert.equal(env.VITE_GOOGLE_DRIVE_APP_ID, '');
  }
  assert.equal(profileEnvironment('preview', inherited).VITE_HF_AUTH_ENABLED, 'false');
  assert.equal(profileEnvironment('preview', inherited).VITE_HF_OAUTH_CLIENT_ID, '');
  assert.equal(profileEnvironment('github', inherited).HF_OAUTH_CLIENT_ID, 'inherited-alias');
  assert.equal(profileEnvironment('github', inherited, true).HF_OAUTH_CLIENT_ID, '');
  for (const profile of ['preview', 'custom']) {
    assert.equal(profileEnvironment(profile, { ...FIXTURE_GOOGLE_CONFIG, ...inherited }).HF_OAUTH_CLIENT_ID, '', profile);
  }
  // A development Hub endpoint never reaches a hosted build, fixture builds included.
  for (const profile of ['github', 'custom', 'preview']) {
    for (const fixture of [false, true]) {
      assert.equal(profileEnvironment(profile, { ...FIXTURE_GOOGLE_CONFIG, ...inherited }, fixture).VITE_HUB_BASE_URL, '', `${profile} fixture=${fixture}`);
    }
  }
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
  assert.equal(env.VITE_ACCOUNT_SESSIONS_ENABLED, 'false');
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

test('preflight rejects a release tag that is not v plus the package.json version', () => {
  validateReleaseTag('v0.16.0', '0.16.0');
  validateReleaseTag('v0.16.0-beta.1', '0.16.0-beta.1');
  for (const [tag, version] of [['v0.16.0', '0.15.4'], ['v0.16.0-beta', '0.16.0'], ['v0.16.0', '0.16.0-beta'], ['0.16.0', '0.16.0']]) {
    assert.throws(() => validateReleaseTag(tag, version), { message: `Release tag ${tag} must be v plus package.json's version (${version}). Commit the version bump before tagging.` });
  }
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
  // Blank outputs, so a CI run of this test never writes to its own job's outputs or summary.
  const preflight = (env, ...args) => spawnSync(process.execPath, ['scripts/deployment/preflight.mjs', ...args], {
    env: { ...process.env, GITHUB_OUTPUT: '', GITHUB_STEP_SUMMARY: '', CLOUDFLARE_PAGES_ENABLED: 'false', VITE_HF_PUBLISH_ENABLED: 'false', VITE_HF_AUTH_ENABLED: 'false', ...env },
    encoding: 'utf8',
  });
  assert.equal(preflight({ GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: `v${version}` }).status, 0);
  const mismatch = preflight({ GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v999.0.0' });
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /Release tag v999\.0\.0 must be v plus package\.json's version/);
  assert.equal(preflight({ GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'main' }).status, 0);
  // A preview can be started from a tag, but it publishes the selected ref, not a release.
  assert.equal(preflight({ GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v999.0.0', ...release, CLOUDFLARE_PREVIEW_PROJECT: 'colmapview-preview' }, '--preview').status, 0);
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
const stepLabel = step => step.name ?? step.uses ?? step.run;
// A failed gate must stop the job (no continue-on-error), and neither a gate nor a publication step may run after a
// failure, which always(), failure() or cancelled() in its `if` allow. So does success() || …: an explicit status
// function replaces the implicit success() &&.
const runsAfterFailure = step => {
  const condition = String(step.if ?? '');
  return /\b(?:always|failure|cancelled)\s*\(/i.test(condition) || /\bsuccess\s*\(/i.test(condition) && condition.includes('||');
};

/** Each gate must exist exactly once, by exact name, before the first gh-pages push or Wrangler upload, and stop the job if it fails. */
function assertGatesPrecedePublication(workflow) {
  const steps = workflow.jobs.deploy.steps;
  const mutations = steps.flatMap((step, index) =>
    step.uses?.startsWith('peaceiris/actions-gh-pages@') || /\bwrangler\b/.test(step.run ?? '') ? [index] : []);
  assert.ok(mutations.length > 0, 'deploy.yml must publish through gh-pages or Wrangler');
  const firstMutation = Math.min(...mutations);
  for (const index of mutations) assert.ok(!runsAfterFailure(steps[index]), `${stepLabel(steps[index])} must not publish after a failure`);
  for (const name of PUBLICATION_GATES) {
    const matches = steps.flatMap((step, index) => step.name === name ? [index] : []);
    assert.equal(matches.length, 1, `deploy.yml must contain exactly one "${name}" step`);
    assert.ok(matches[0] < firstMutation, `${name} must precede publication`);
    const gate = steps[matches[0]];
    assert.ok([undefined, false].includes(gate['continue-on-error']), `${name} must stop the job when it fails`);
    assert.ok(!runsAfterFailure(gate), `${name} must not run after a failure`);
    if (UNCONDITIONAL_GATES.has(name)) assert.equal(gate.if, undefined, `${name} must always run`);
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

test('publication gate check rejects renamed, removed, moved, conditional or bypassed gates', () => {
  const workflow = yaml.load(readFileSync('.github/workflows/deploy.yml', 'utf8'));
  const smoke = steps => steps.findIndex(step => step.name === 'Smoke prepared artifacts');
  const named = (steps, name) => steps.find(step => step.name === name);
  const variants = [
    steps => { steps[smoke(steps)].name = 'Smoke artifacts'; },
    steps => { steps.splice(steps.findIndex(step => step.name === 'Preflight deployment configuration'), 1); },
    steps => { steps.push(...steps.splice(smoke(steps), 1)); },
    steps => { steps[smoke(steps)].if = "github.ref_type == 'tag'"; },
  ].map(mutate => [mutate, /exactly one|must precede publication|must always run/]);
  const bypasses = [
    [steps => { steps[smoke(steps)]['continue-on-error'] = true; }, /Smoke prepared artifacts must stop the job/],
    [steps => { named(steps, 'Preflight deployment configuration')['continue-on-error'] = "${{ github.ref_type != 'tag' }}"; }, /Preflight deployment configuration must stop the job/],
    [steps => { steps[smoke(steps)].if = 'always()'; }, /Smoke prepared artifacts must not run after a failure/],
    [steps => { const gate = named(steps, 'Build latest'); gate.if = `always() && ${gate.if}`; }, /Build latest must not run after a failure/],
    [steps => { named(steps, 'Deploy to version directory').if = '${{ !cancelled() }}'; }, /Deploy to version directory must not publish after a failure/],
    [steps => { const step = named(steps, 'Deploy custom production'); step.if = `always() && ${step.if}`; }, /Deploy custom production must not publish after a failure/],
    [steps => { named(steps, 'Deploy to latest').if = "success() || github.event_name == 'workflow_dispatch'"; }, /Deploy to latest must not publish after a failure/],
  ];
  for (const [mutate, error] of [...variants, ...bypasses]) {
    const copy = structuredClone(workflow);
    mutate(copy.jobs.deploy.steps);
    assert.throws(() => assertGatesPrecedePublication(copy), error);
  }
});

/**
 * Deploy runs wait in one queue. By default GitHub keeps one pending run per group and cancels it when another
 * arrives, so a later push to main could drop a waiting tag deploy: the only run that updates the custom host.
 */
function assertDeployRunsQueue(workflow, validation) {
  const { concurrency } = workflow;
  assert.ok(concurrency !== null && typeof concurrency === 'object', 'deploy.yml must declare concurrency as a mapping with queue: max');
  assert.equal(concurrency.group, 'pages-deploy', 'every deploy.yml run must share the pages-deploy group so gh-pages pushes take turns');
  assert.equal(concurrency.queue, 'max', 'deploy.yml runs must wait in line (queue: max) so a later push never cancels a waiting deploy');
  assert.ok([undefined, false].includes(concurrency['cancel-in-progress']), 'deploy.yml must never cancel a deploy in progress');
  for (const [name, job] of Object.entries(workflow.jobs)) {
    assert.equal(job.concurrency, undefined, `deploy.yml job ${name} must not add a concurrency group with its own single pending slot`);
  }
  // Every deploy run calls the validation workflow, which may cancel only an older run of the same ref.
  const inner = validation.concurrency;
  if (inner !== null && typeof inner === 'object' && ![undefined, false].includes(inner['cancel-in-progress'])) {
    assert.match(String(inner.group), /\$\{\{\s*github\.ref\s*\}\}/, 'e2e.yml may cancel in progress only within one ref');
  }
}

test('deploy runs queue in one group, so no later push cancels a waiting tag deploy', () => {
  const workflow = yaml.load(readFileSync('.github/workflows/deploy.yml', 'utf8'));
  const validation = yaml.load(readFileSync('.github/workflows/e2e.yml', 'utf8'));
  assertDeployRunsQueue(workflow, validation);
  const variants = [
    [deploy => { delete deploy.concurrency.queue; }, /queue: max/],
    [deploy => { deploy.concurrency.queue = 'single'; }, /queue: max/],
    [deploy => { deploy.concurrency = 'pages-deploy'; }, /mapping/],
    [deploy => { deploy.concurrency.group = 'pages-deploy-${{ github.ref }}'; }, /share the pages-deploy group/],
    [deploy => { deploy.concurrency['cancel-in-progress'] = true; }, /never cancel/],
    [deploy => { deploy.concurrency['cancel-in-progress'] = "${{ github.ref_type != 'tag' }}"; }, /never cancel/],
    [deploy => { deploy.jobs.deploy.concurrency = { group: 'pages-publish' }; }, /job deploy must not add/],
    [(deploy, e2e) => { e2e.concurrency.group = 'validation-${{ github.workflow }}'; }, /within one ref/],
  ];
  for (const [mutate, error] of variants) {
    const deploy = structuredClone(workflow);
    const e2e = structuredClone(validation);
    mutate(deploy, e2e);
    assert.throws(() => assertDeployRunsQueue(deploy, e2e), error);
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
    .filter(step => step.uses?.startsWith('actions/upload-artifact@') && (/smoke/.test(step.with.name) || /deployment-smoke/.test(step.with.path)));
  assert.equal(uploads.length, 4);
  // Exactly the report and traces: the whole .tmp/deployment-smoke/ would upload the fixture builds again.
  for (const step of uploads) {
    const paths = step.with.path.split('\n').map(line => line.trim()).filter(Boolean);
    assert.deepEqual(paths, ['.tmp/deployment-smoke/report/', '.tmp/deployment-smoke/results/'], step.with.name);
  }
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
  // The trusted smoke refuses Worker code, so it must check the uploaded folder and stop the job before the upload.
  const publishSteps = preview.jobs.publish.steps;
  const trustedSmoke = publishSteps.find(step => step.name === 'Smoke downloaded preview with trusted tests');
  const upload = publishSteps.find(step => step.name === 'Upload preview only');
  assert.ok(publishSteps.indexOf(trustedSmoke) >= 0 && publishSteps.indexOf(trustedSmoke) < publishSteps.indexOf(upload), 'The trusted smoke must precede the preview upload.');
  assert.ok(trustedSmoke.if === undefined && [undefined, false].includes(trustedSmoke['continue-on-error']), 'The trusted smoke must always run and stop the job when it fails.');
  assert.equal(`${trustedSmoke.env.DEPLOYMENT_SMOKE_ROOT}/${trustedSmoke.env.DEPLOYMENT_SMOKE_PROFILES}`, '.tmp/deployment/preview');
  // It runs every deployment browser test, artifacts.spec.ts's refusal of _worker.js among them.
  assert.equal(trustedSmoke.run, 'npm run test:deployment:browser');
  assert.equal(JSON.parse(readFileSync('package.json', 'utf8')).scripts['test:deployment:browser'],
    'playwright test --config=scripts/deployment/playwright.config.ts');
  const smokeConfig = readFileSync('scripts/deployment/playwright.config.ts', 'utf8');
  assert.equal(smokeConfig.match(/testDir: '([^']+)'/)?.[1], './tests');
  assert.doesNotMatch(smokeConfig, /\b(?:testMatch|testIgnore|grep|grepInvert)\s*:/);
  assert.match(readFileSync('scripts/deployment/tests/artifacts.spec.ts', 'utf8'), /\['_worker\.js', '_routes\.json', 'functions'\]/);
  assert.match(upload.run, / pages deploy \.tmp\/deployment\/preview /);
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
  // A job also receives what the workflow-level env provides, and `secrets: inherit` or any expression use of
  // `secrets` other than secrets.NAME (toJSON(secrets), secrets[...], secrets.*) can expose every secret.
  const holdsToken = text => /CLOUDFLARE_API_TOKEN|"secrets":"inherit"/i.test(text) || /\$\{\{(?:(?!\}\}).)*\bsecrets\b(?!\s*\.\s*\w)/i.test(text);
  const tokenJobs = readdirSync('.github/workflows').filter(file => /\.ya?ml$/.test(file)).sort()
    .flatMap(file => {
      const workflow = yaml.load(readFileSync(`.github/workflows/${file}`, 'utf8'));
      return Object.entries(workflow.jobs).map(([name, job]) => [`${file}:${name}`, job, JSON.stringify([workflow.env, job])]);
    })
    .filter(([, , text]) => holdsToken(text));
  assert.deepEqual(tokenJobs.map(([id]) => id), ['deploy-preview.yml:publish', 'deploy.yml:deploy']);
  for (const [id, job] of tokenJobs) {
    const setups = job.steps.filter(step => step.uses?.startsWith('actions/setup-node@'));
    assert.ok(setups.length > 0, id);
    for (const setup of setups) {
      assert.equal(setup.with?.cache, undefined, id);
      assert.equal(setup.with?.['package-manager-cache'], false, id);
    }
    assert.ok(!job.steps.some(step => step.uses?.startsWith('actions/cache')), id);
    // Other caching actions and the `cache:` input of other setup-* actions restore archives too.
    for (const step of job.steps) {
      assert.doesNotMatch(step.uses ?? '', /cache/i, `${id}: ${stepLabel(step)} is a caching action`);
      assert.ok(!step.with?.cache || step.with.cache === 'false', `${id}: ${stepLabel(step)} must not enable a cache`);
    }
  }
});

/**
 * Lines of a step script that change VITE_HF_* for its own commands or later steps:
 * - NAME= or NAME+= starting an unquoted word (assignment, inline env, export/declare/env NAME=…);
 * - an unset or env -u/--unset operand;
 * - a $GITHUB_ENV key (NAME= or NAME<<DELIM). A { … } group or here-document can redirect from another line,
 *   so in a step that writes $GITHUB_ENV such a line passes only when it targets the step summary or outputs.
 * The first two rules read the line through maskQuotes, so reads such as
 * echo "NAME=$NAME" >> "$GITHUB_STEP_SUMMARY" pass while unset "NAME" and env "NAME=…" still count.
 */
function viteHfWrites(script = '') {
  const writesEnvFile = /\bGITHUB_ENV\b/.test(script);
  return script.split('\n').filter(line => {
    const code = maskQuotes(line);
    const elsewhere = /\bGITHUB_(?:STEP_SUMMARY|OUTPUT)\b/.test(line) && !/\bGITHUB_ENV\b/.test(line);
    return /(?:^|[\s;&|({!])VITE_HF_\w*\+?=/.test(code)
      || /\bunset\b[^;&|]*\bVITE_HF_|\benv\b[^;&|]*?\s(?:-[a-z]*u\s*|--unset[=\s]\s*)VITE_HF_/.test(code)
      || writesEnvFile && !elsewhere && /(?<![\w$]|\$\{)VITE_HF_[^\s"'=<>|;&]*(?:=|<<)/.test(line);
  });
}

// A quoted NAME=… word still assigns after these commands, and eval or -c runs its quoted argument as a script.
const DECLARES = /(?:^|[\s;&|({!/])(?:env|export|declare|typeset|local|readonly)\s(?:[^;&|()]*\s)?$/;
const RUNS_SCRIPT = /(?:(?:^|[\s;&|({!/])eval|\s-[A-Za-z]*c)\s+$/;

/**
 * Replaces quoted text with "" so data cannot pass for a write, except where the shell still reads it as code:
 * a bare "NAME" (unset "NAME"), a quoted NAME=… word after env, export, declare, typeset, local or readonly,
 * and a script after eval or -c, whose own quotes are masked in turn.
 */
function maskQuotes(text) {
  let code = '';
  let end = 0;
  for (const { 0: quoted, index } of text.matchAll(/'[^']*'|"(?:\\.|[^"\\])*"/g)) {
    code += text.slice(end, index);
    end = index + quoted.length;
    const inner = quoted[0] === '"' ? quoted.slice(1, -1).replace(/\\(["\\$`])/g, '$1') : quoted.slice(1, -1);
    if (RUNS_SCRIPT.test(code)) code += maskQuotes(inner);
    else if (/^VITE_HF_\w*$/.test(inner) || /^VITE_HF_\w*\+?=/.test(inner) && DECLARES.test(code)) code += inner;
    else code += '""';
  }
  return code + text.slice(end);
}

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
  // The GitHub builds must see exactly this job env: no step may set VITE_HF_* in its own env or write it from its
  // run script (assignment, unset, env -u or a $GITHUB_ENV key; see viteHfWrites), and --fixture would clear it.
  for (const step of deploy.steps) {
    assert.ok(!Object.keys(step.env ?? {}).some(name => name.startsWith('VITE_HF_')), `${stepLabel(step)} must not set VITE_HF_* in its env`);
    assert.deepEqual(viteHfWrites(step.run), [], `${stepLabel(step)} must not write VITE_HF_*`);
  }
  const githubBuilds = deploy.steps.filter(step => /(?:build-profile\.mjs|build:deployment)\b.*\bgithub\b/.test(step.run ?? ''));
  assert.deepEqual(githubBuilds.map(step => step.name), ['Build version or dev', 'Build latest']);
  for (const step of githubBuilds) assert.doesNotMatch(step.run, /--fixture\b/, `${step.name} must not build with --fixture`);
  assert.doesNotMatch(readFileSync('.github/workflows/deploy-preview.yml', 'utf8'), /VITE_HF_|vars\.(?:CUSTOM_)?HF_/, 'previews receive no provider configuration');
});

test('VITE_HF_* write detection flags assignments, removals and $GITHUB_ENV keys but not reads', () => {
  const writes = [
    'VITE_HF_AUTH_ENABLED=true node scripts/deployment/build-profile.mjs github',
    'export VITE_HF_PUBLISH_ENABLED=false',
    'unset VITE_HF_OAUTH_CLIENT_ID',
    'env -u VITE_HF_OAUTH_REDIRECT_URI npm run build:deployment -- github',
    'echo "VITE_HF_PUBLISH_ENABLED=false" >> "$GITHUB_ENV"',
    '{\n  echo "VITE_HF_OAUTH_REDIRECT_URI<<EOF"\n  echo "$URI"\n  echo EOF\n} >> "$GITHUB_ENV"',
    // Quoting hides none of these.
    'env "VITE_HF_AUTH_ENABLED=true" node scripts/deployment/build-profile.mjs github',
    "export 'VITE_HF_PUBLISH_ENABLED=false'",
    'declare -x "VITE_HF_OAUTH_CLIENT_ID=other-app"',
    'typeset -x "VITE_HF_OAUTH_CLIENT_ID=other-app"',
    'build() { local "VITE_HF_AUTH_ENABLED=false"; node scripts/deployment/build-profile.mjs github; }; build',
    'readonly "VITE_HF_PUBLISH_ENABLED=false"',
    'eval "export VITE_HF_OAUTH_REDIRECT_URI=https://example.com/hf-callback.html"',
    'bash -c "VITE_HF_AUTH_ENABLED=true node scripts/deployment/build-profile.mjs github"',
  ];
  const reads = [
    'echo "VITE_HF_PUBLISH_ENABLED=$VITE_HF_PUBLISH_ENABLED" >> "$GITHUB_STEP_SUMMARY"',
    'echo "BRANCH=x" >> "$GITHUB_ENV"\necho "Built with VITE_HF_AUTH_ENABLED=$VITE_HF_AUTH_ENABLED" >> "$GITHUB_STEP_SUMMARY"',
    '[[ "${VITE_HF_AUTH_ENABLED}" == true ]] && echo "to disable it, unset VITE_HF_AUTH_ENABLED"',
    'export SUMMARY="VITE_HF_PUBLISH_ENABLED=$VITE_HF_PUBLISH_ENABLED"',
    `bash -c 'echo "VITE_HF_AUTH_ENABLED=$VITE_HF_AUTH_ENABLED" >> "$GITHUB_STEP_SUMMARY"'`,
  ];
  for (const script of writes) assert.notDeepEqual(viteHfWrites(script), [], script);
  for (const script of reads) assert.deepEqual(viteHfWrites(script), [], script);
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
  const previewWorkflow = yaml.load(readFileSync('.github/workflows/deploy-preview.yml', 'utf8'));
  assert.equal(previewWorkflow.jobs.publish.steps.find(step => step.name === 'Upload preview only').env.WRANGLER_OUTPUT_FILE_PATH, '${{ runner.temp }}/wrangler-preview-output.ndjson');
  assertPreviewCheckReadsResolvedAlias(previewWorkflow);
});

/** The public preview check reads the alias preview-url.mjs wrote to GITHUB_ENV, never a rebuilt or overridden URL. */
function assertPreviewCheckReadsResolvedAlias(previewWorkflow) {
  const publish = previewWorkflow.jobs.publish;
  // The subdomain can differ from the project name, so no form ($NAME, ${NAME}, ${{ vars.NAME }}) may build the URL from it.
  assert.doesNotMatch(JSON.stringify(publish), /CLOUDFLARE_PREVIEW_PROJECT\s*\}{0,2}\.pages\.dev/, 'The preview URL must not be built from the project name.');
  const liveChecks = publish.steps.filter(step => /check-live\.mjs/.test(step.run ?? ''));
  assert.deepEqual(liveChecks.map(step => step.name), ['Verify public preview'], 'Only "Verify public preview" may run check-live.mjs.');
  assert.equal(liveChecks[0].run, 'node scripts/deployment/check-live.mjs "$PREVIEW_URL" preview --manifest=.tmp/deployment/preview/deployment.json', 'Verify public preview must read "$PREVIEW_URL".');
  const envs = [previewWorkflow.env, publish.env, ...publish.steps.map(step => step.env)];
  assert.ok(!envs.some(env => env && Object.hasOwn(env, 'PREVIEW_URL')), 'No env block may set PREVIEW_URL.');
  for (const step of publish.steps) assert.doesNotMatch(step.run ?? '', /\bPREVIEW_URL(?:\+?=|<<)/, `${stepLabel(step)} must not write PREVIEW_URL; only preview-url.mjs does.`);
}

test('preview check rejects a rebuilt, re-read, overridden or rewritten preview URL', () => {
  const previewWorkflow = yaml.load(readFileSync('.github/workflows/deploy-preview.yml', 'utf8'));
  const verify = steps => steps.find(step => step.name === 'Verify public preview');
  const insertBeforeVerify = (steps, step) => steps.splice(steps.indexOf(verify(steps)), 0, step);
  const variants = [
    [steps => { verify(steps).run = verify(steps).run.replace('"$PREVIEW_URL"', '"https://${PREVIEW_BRANCH}.${CLOUDFLARE_PREVIEW_PROJECT}.pages.dev/"'); }, /must not be built from the project name/],
    [steps => { insertBeforeVerify(steps, { name: 'Check subdomain', run: 'node scripts/deployment/check-live.mjs "https://${PREVIEW_BRANCH}.colmapview-preview.pages.dev/" preview' }); }, /Only "Verify public preview" may run check-live/],
    [steps => { verify(steps).run = verify(steps).run.replace('"$PREVIEW_URL"', '"${{ env.PREVIEW_URL }}"'); }, /must read "\$PREVIEW_URL"/],
    [steps => { verify(steps).env = { PREVIEW_URL: 'https://preview.colmapview-preview.pages.dev/' }; }, /No env block may set PREVIEW_URL/],
    [steps => { insertBeforeVerify(steps, { name: 'Pin preview URL', run: 'echo "PREVIEW_URL=https://${PREVIEW_BRANCH}.colmapview-preview.pages.dev/" >> "$GITHUB_ENV"' }); }, /Pin preview URL must not write PREVIEW_URL/],
  ];
  for (const [mutate, error] of variants) {
    const copy = structuredClone(previewWorkflow);
    mutate(copy.jobs.publish.steps);
    assert.throws(() => assertPreviewCheckReadsResolvedAlias(copy), error);
  }
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

test('Cloudflare artifact headers prevent callback caching and preserve HTML bytes on canonical and alias routes', async () => {
  mkdirSync('.tmp', { recursive: true });
  const directory = mkdtempSync(path.resolve('.tmp/deployment-headers-'));
  const htmlRoutes = ['/', '/index', '/index.html', '/about', '/about.html', '/privacy', '/privacy.html', '/terms', '/terms.html', '/hf-callback', '/hf-callback.html'];
  writeFileSync(path.join(directory, '_headers'), cloudflareStaticHeaders());
  for (const name of ['index.html', 'about.html', 'privacy.html', 'terms.html', 'hf-callback.html']) writeFileSync(path.join(directory, name), '<html><body>prepared bytes</body></html>');
  for (const name of ['entry.js', 'style.css', 'worker.wasm', 'deployment.json']) writeFileSync(path.join(directory, name), 'fixture');
  const server = await startArtifactServer(directory);
  try {
    for (const route of htmlRoutes) {
      const response = await fetch(`${server.origin}${route}${route.startsWith('/hf-callback') ? '?code=fixture-code&state=fixture-state' : '?url=private-file-identifier'}`);
      assert.equal(response.status, 200, route);
      assert.equal(response.headers.get('cache-control'), route.startsWith('/hf-callback')
        ? 'no-store, no-transform' : 'public, no-cache, no-transform', route);
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
