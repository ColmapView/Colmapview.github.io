import * as path from 'node:path';

export interface ViteLocalAliasPolicyOptions {
  command: string;
  mode: string;
  env: Record<string, string | undefined>;
  rootDir: string;
  pathExists: (targetPath: string) => boolean;
}

export interface ViteLocalAliasPolicy {
  aliases: Record<string, string>;
  localGsplatWebGpuEnabled: boolean;
  localGsplatWebGpuPath: string;
  localGsToolboxSourcePath: string;
  localGsplatWebGpuAlias: string;
}

export function resolveViteLocalAliasPolicy({
  env,
  rootDir,
  pathExists,
}: ViteLocalAliasPolicyOptions): ViteLocalAliasPolicy {
  const localGsplatWebGpuPath = path.resolve(rootDir, '../../gsplat/webgpu/src');
  const localGsToolboxSourcePath = path.resolve(rootDir, '../../gsplat/packages/gs-toolbox/ts/src/index.ts');
  const unavailableRendererPath = path.resolve(rootDir, './src/splat/webgpu/localGsplatRendererUnavailable.ts');
  const localGsplatWebGpuEnabled = env.VITE_ENABLE_LOCAL_GSPLAT_WEBGPU === '1'
    && pathExists(localGsplatWebGpuPath);
  const localGsplatWebGpuAlias = localGsplatWebGpuEnabled
    ? path.resolve(localGsplatWebGpuPath, 'renderer.ts')
    : unavailableRendererPath;
  const aliases: Record<string, string> = {
    '@': path.resolve(rootDir, './src'),
    '@local-gsplat-webgpu/renderer': localGsplatWebGpuAlias,
  };

  if (
    (localGsplatWebGpuEnabled || env.VITE_USE_LOCAL_GS_TOOLBOX_SOURCE === '1') &&
    pathExists(localGsToolboxSourcePath)
  ) {
    aliases['gs-toolbox'] = localGsToolboxSourcePath;
  }

  return {
    aliases,
    localGsplatWebGpuEnabled,
    localGsplatWebGpuPath,
    localGsToolboxSourcePath,
    localGsplatWebGpuAlias,
  };
}
