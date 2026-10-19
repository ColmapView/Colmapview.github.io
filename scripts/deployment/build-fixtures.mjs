import { spawnSync } from 'node:child_process';
import { PROFILES } from './profiles.mjs';

for (const profile of PROFILES) {
  const result = spawnSync(process.execPath, ['scripts/deployment/build-profile.mjs', profile, '--fixture', '--skip-typecheck', `--out=.tmp/deployment-smoke/${profile}`], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
const root = spawnSync(process.execPath, ['scripts/deployment/build-github-root.mjs', '--out=.tmp/deployment-smoke/root'], { stdio: 'inherit' });
if (root.status !== 0) process.exit(root.status || 1);
