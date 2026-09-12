import type { LoadedFiles } from '../types/colmap';
import type { Sim3dEuler } from '../types/sim3d';
import { composeSim3d, createSim3dFromEuler, inverseSim3d, sim3dToEuler } from './sim3dTransforms';

/** Map source bytes into the current baked COLMAP space without changing history. */
export function getSplatSourceTransform(history: Sim3dEuler, files: LoadedFiles | null): Sim3dEuler {
  const baseline = files?.splatFileSources?.find((source) => source.file === files.splatFile)?.transformBaseline;
  if (!baseline) return history;
  return sim3dToEuler(composeSim3d(createSim3dFromEuler(history), inverseSim3d(createSim3dFromEuler(baseline))));
}
