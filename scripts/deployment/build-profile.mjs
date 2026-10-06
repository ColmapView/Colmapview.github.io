import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { profileEnvironment, safeOutputDirectory, sourceSha, validateBase } from './profiles.mjs';
import { htmlSha256 } from './artifact-verification.mjs';
import { cloudflareStaticHeaders } from './headers.mjs';

const [profile, ...args] = process.argv.slice(2);
const value = (name, fallback) => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const base = validateBase(profile, value('base', profile === 'github' ? '/latest/' : '/'));
const output = safeOutputDirectory(value('out', ` .tmp/deployment/${profile}`.trim()));
const env = profileEnvironment(profile, process.env, args.includes('--fixture'));
env.VITE_BASE = base;
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const sha = sourceSha();

// The reusable validation job checks TypeScript. Local profile builds also check unless explicitly skipped.
if (!args.includes('--skip-typecheck')) {
  const check = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '-b'], { stdio: 'inherit', env });
  if (check.status !== 0) process.exit(check.status || 1);
}
const build = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', output, '--emptyOutDir'], { stdio: 'inherit', env });
if (build.status !== 0) process.exit(build.status || 1);
if (existsSync(path.join(output, 'CNAME'))) throw new Error('Artifacts must not assign a GitHub Pages custom domain.');

writeFileSync(path.join(output, 'deployment.json'), `${JSON.stringify({
  schemaVersion: 1,
  sourceSha: sha,
  version: pkg.version,
  release: process.env.DEPLOYMENT_RELEASE || '',
  profile,
  base,
  indexHtmlSha256: htmlSha256(readFileSync(path.join(output, 'index.html'))),
  googleDrive: { enabled: profile === 'custom', allowedOrigin: profile === 'custom' ? env.VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN : null },
}, null, 2)}\n`);
if (profile !== 'github') {
  writeFileSync(path.join(output, '_headers'), cloudflareStaticHeaders());
}
console.log(`Prepared ${profile} artifact (${sha.slice(0, 12)}, base ${base}).`);
