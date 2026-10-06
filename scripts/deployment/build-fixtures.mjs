import { spawnSync } from 'node:child_process';

for (const profile of ['github', 'custom', 'preview']) {
  const result = spawnSync(process.execPath, ['scripts/deployment/build-profile.mjs', profile, '--fixture', '--skip-typecheck', `--out=.tmp/deployment-smoke/${profile}`], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
