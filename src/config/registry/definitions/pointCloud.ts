/**
 * Point Cloud Property Definitions
 */
import { defineSection } from '../types';
import { COLOR_MODES } from '../../../store/types';

export const pointCloudSection = defineSection({
  key: 'pointCloud',
  storeHook: 'usePointCloudStore',
  properties: [
    {
      key: 'pointSize',
      type: 'number',
      min: 0.1,
      max: 50,
      default: 2,
      persist: true,
      description: 'Point size (0.1 - 50)',
    },
    {
      key: 'colorMode',
      type: 'enum',
      enumValues: COLOR_MODES,
      default: 'rgb',
      persist: true,
      description: 'rgb | error | trackLength',
    },
    {
      key: 'minTrackLength',
      type: 'number',
      min: 1,
      isInt: true,
      default: 2,
      persist: true,
      description: 'Minimum observations for a point',
    },
    {
      key: 'maxReprojectionError',
      type: 'number',
      min: 0,
      nullable: true,
      default: null,
      persist: true,
      description: 'null = show all points',
    },
    // Note: selectedPointId is a transient bigint property managed directly by the store
    // It's not included here as it doesn't participate in config persistence
  ],
});
