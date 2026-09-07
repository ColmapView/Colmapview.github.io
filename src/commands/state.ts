import type { StoreApi } from 'zustand';
import { usePointCloudStore } from '../store/stores/pointCloudStore';
import { useCameraStore } from '../store/stores/cameraStore';
import { useUIStore } from '../store/stores/uiStore';
import { useExportStore } from '../store/stores/exportStore';
import { useRigStore } from '../store/stores/rigStore';
import { useTransformStore } from '../store/stores/transformStore';
import { useUITheme } from '../theme/uiTheme';

function bind<T extends object>(store: StoreApi<T>) {
  return {
    read: (): Record<string, unknown> => ({ ...store.getState() }) as Record<string, unknown>,
    restore: (patch: Record<string, unknown>) => store.setState(patch as Partial<T>),
    subscribe: (listener: () => void) => store.subscribe(listener),
  };
}
export const commandStores = [usePointCloudStore, useCameraStore, useUIStore, useExportStore, useRigStore, useTransformStore].map(store => bind(store as StoreApi<object>));
// Theme restoration must also persist and update its normal subscribers.
commandStores.push({ ...bind(useUITheme), restore: patch => {
  if (patch.theme === 'dark' || patch.theme === 'light' || patch.theme === 'system') useUITheme.getState().setTheme(patch.theme);
} });

export const captureStores = () => commandStores.map(store => store.read());
export interface StatePatch { index: number; before: Record<string, unknown>; after: Record<string, unknown> }

/** Capture all setter side effects, including coupled fields such as splat visibility. */
export function diffStores(before: ReturnType<typeof captureStores>): StatePatch[] {
  return commandStores.flatMap((store, index) => {
    const after = store.read();
    const keys = Object.keys(after).filter(key => !Object.is(before[index][key], after[key]) && typeof after[key] !== 'function');
    return keys.length ? [{ index,
      before: Object.fromEntries(keys.map(key => [key, before[index][key]])),
      after: Object.fromEntries(keys.map(key => [key, after[key]])),
    }] : [];
  });
}

export function restorePatches(patches: StatePatch[]) {
  for (const patch of [...patches].reverse()) commandStores[patch.index].restore(patch.before);
}
