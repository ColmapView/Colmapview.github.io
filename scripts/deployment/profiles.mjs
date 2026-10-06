import { execFileSync } from 'node:child_process';
import path from 'node:path';

export const CUSTOM_ORIGIN = 'https://colmapview.opsiclear.com';
export const WRANGLER_VERSION = '4.147.0';
export const FIXTURE_GOOGLE_CONFIG = {
  CUSTOM_GOOGLE_DRIVE_API_KEY: 'colmapview_artifact_fixture_key',
  CUSTOM_GOOGLE_DRIVE_CLIENT_ID: '123456789012-artifactfixture.apps.googleusercontent.com',
  CUSTOM_GOOGLE_DRIVE_APP_ID: '123456789012',
};

const GOOGLE_NAMES = ['API_KEY', 'CLIENT_ID', 'APP_ID'];
const HF_NAMES = ['AUTH_ENABLED', 'PUBLISH_ENABLED', 'OAUTH_CLIENT_ID', 'OAUTH_REDIRECT_URI'];

export function strictFlag(value, name, fallback = false) {
  if (value === undefined || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false.`);
}

function requireValue(env, name, pattern) {
  const value = env[name]?.trim();
  if (!value || (pattern && !pattern.test(value))) throw new Error(`${name} is missing or invalid.`);
  return value;
}

export function validateCustomConfiguration(env) {
  requireValue(env, 'CUSTOM_GOOGLE_DRIVE_API_KEY', /^[A-Za-z0-9_-]{1,256}$/);
  requireValue(env, 'CUSTOM_GOOGLE_DRIVE_CLIENT_ID', /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/);
  requireValue(env, 'CUSTOM_GOOGLE_DRIVE_APP_ID', /^[1-9]\d{0,29}$/);
  const auth = strictFlag(env.CUSTOM_HF_AUTH_ENABLED, 'CUSTOM_HF_AUTH_ENABLED');
  const publish = strictFlag(env.CUSTOM_HF_PUBLISH_ENABLED, 'CUSTOM_HF_PUBLISH_ENABLED');
  if (auth || publish) {
    requireValue(env, 'CUSTOM_HF_OAUTH_CLIENT_ID', /^[A-Za-z0-9_-]+$/);
    const redirect = requireValue(env, 'CUSTOM_HF_OAUTH_REDIRECT_URI');
    const url = new URL(redirect);
    if (url.origin !== CUSTOM_ORIGIN || url.pathname !== '/hf-callback' || url.username || url.password || url.search || url.hash) {
      throw new Error('CUSTOM_HF_OAUTH_REDIRECT_URI must use the production custom origin and /hf-callback without query or fragment.');
    }
  }
}

export function validateReleaseConfiguration(env, isRelease) {
  const enabled = strictFlag(env.CLOUDFLARE_PAGES_ENABLED, 'CLOUDFLARE_PAGES_ENABLED');
  if (!enabled || !isRelease) return { customEnabled: false };
  if (!strictFlag(env.CLOUDFLARE_API_TOKEN_CONFIGURED, 'CLOUDFLARE_API_TOKEN_CONFIGURED')) throw new Error('CLOUDFLARE_API_TOKEN is missing.');
  requireValue(env, 'CLOUDFLARE_ACCOUNT_ID', /^[a-f0-9]{32}$/i);
  requireValue(env, 'CLOUDFLARE_PAGES_PROJECT', /^[a-z0-9][a-z0-9-]{0,57}[a-z0-9]$/);
  validateCustomConfiguration(env);
  return { customEnabled: true };
}

export function validatePreviewConfiguration(env) {
  if (!strictFlag(env.CLOUDFLARE_API_TOKEN_CONFIGURED, 'CLOUDFLARE_API_TOKEN_CONFIGURED')) throw new Error('CLOUDFLARE_API_TOKEN is missing.');
  requireValue(env, 'CLOUDFLARE_ACCOUNT_ID', /^[a-f0-9]{32}$/i);
  const preview = requireValue(env, 'CLOUDFLARE_PREVIEW_PROJECT', /^[a-z0-9][a-z0-9-]{0,57}[a-z0-9]$/);
  const production = requireValue(env, 'CLOUDFLARE_PAGES_PROJECT', /^[a-z0-9][a-z0-9-]{0,57}[a-z0-9]$/);
  if (preview === production) throw new Error('Preview must use a separate Pages project.');
}

/** Explicit empty values prevent ignored local .env files from leaking into a hosted build. */
export function profileEnvironment(profile, source = process.env, fixture = false) {
  if (!['github', 'custom', 'preview'].includes(profile)) throw new Error('Unknown deployment profile.');
  const env = { ...source };
  env.VITE_GOOGLE_DRIVE_ENABLED = 'false';
  env.VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN = '';
  for (const name of GOOGLE_NAMES) {
    env[`VITE_GOOGLE_DRIVE_${name}`] = '';
    env[`GOOGLE_DRIVE_${name}`] = '';
  }
  if (profile !== 'github' || fixture) {
    for (const name of HF_NAMES) env[`VITE_HF_${name}`] = name.endsWith('ENABLED') ? 'false' : '';
  }
  // Unprefixed aliases may be used by setup scripts; never inherit them in a custom/preview build.
  if (profile !== 'github' || fixture) {
    for (const name of HF_NAMES) env[`HF_${name}`] = '';
  }
  if (profile === 'custom') {
    const custom = fixture ? FIXTURE_GOOGLE_CONFIG : source;
    validateCustomConfiguration(custom);
    env.VITE_GOOGLE_DRIVE_ENABLED = 'true';
    env.VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN = CUSTOM_ORIGIN;
    for (const name of GOOGLE_NAMES) env[`VITE_GOOGLE_DRIVE_${name}`] = custom[`CUSTOM_GOOGLE_DRIVE_${name}`];
    for (const name of HF_NAMES) env[`VITE_HF_${name}`] = custom[`CUSTOM_HF_${name}`] || (name.endsWith('ENABLED') ? 'false' : '');
  }
  return env;
}

export function sourceSha(env = process.env) {
  const sha = env.DEPLOYMENT_SHA || env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (!/^[a-f0-9]{40}$/i.test(sha)) throw new Error('Deployment source SHA must be a complete Git commit SHA.');
  return sha;
}

export function validateBase(profile, base) {
  if (profile !== 'github' && base !== '/') throw new Error('Custom and preview builds must use the root base.');
  if (!/^\/(?:[A-Za-z0-9.+_-]+\/)*$/.test(base) || base.split('/').some(part => part === '.' || part === '..')) throw new Error('Build base must be an absolute directory path.');
  return base;
}

export function safeOutputDirectory(value, cwd = process.cwd()) {
  const output = path.resolve(cwd, value);
  const scratch = path.resolve(cwd, '.tmp');
  if (output !== path.resolve(cwd, 'dist') && !output.startsWith(`${scratch}${path.sep}`)) {
    throw new Error('Deployment output must be dist or a child of .tmp.');
  }
  return output;
}
