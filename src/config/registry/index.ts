/**
 * Property Registry
 *
 * Central registry for all configurable properties.
 * Properties defined here flow to stores, config, validation, and serialization.
 */

import type { SectionDef, PropertyDef } from './types';
import { pointCloudSection } from './definitions/pointCloud';
import { cameraSection } from './definitions/camera';
import { uiSection } from './definitions/ui';
import { exportSection } from './definitions/export';
import { rigSection } from './definitions/rig';

// All registered sections
export const sections: readonly SectionDef[] = [
  pointCloudSection,
  cameraSection,
  uiSection,
  exportSection,
  rigSection,
] as const;

/**
 * Get persisted properties for a section (properties that should be saved)
 */
export function getPersistedProperties(section: SectionDef): PropertyDef[] {
  return section.properties.filter((p) => p.persist && !p.transient);
}

/**
 * Get the store key for a property (uses storeKey if defined, otherwise key)
 */
export function getStoreKey(prop: PropertyDef): string {
  return prop.storeKey ?? prop.key;
}

/**
 * Build shareable fields map from registry.
 * Returns a map of section key -> Set of property keys that should be included in URL sharing.
 * Uses persist flag to determine which properties are shareable.
 */
export function buildShareableFieldsFromRegistry(): Record<string, Set<string>> {
  const result: Record<string, Set<string>> = {};
  for (const section of sections) {
    const persistedProps = getPersistedProperties(section);
    if (persistedProps.length > 0) {
      result[section.key] = new Set(persistedProps.map((p) => getStoreKey(p)));
    }
  }
  return result;
}

// Re-export types
export * from './types';

// Re-export section definitions for direct access
export { pointCloudSection } from './definitions/pointCloud';
export { cameraSection } from './definitions/camera';
export { uiSection } from './definitions/ui';
export { exportSection } from './definitions/export';
export { rigSection } from './definitions/rig';
