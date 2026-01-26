/**
 * Property Registry Type Definitions
 *
 * Central type system for defining configurable properties.
 * Properties defined here flow to stores, config, validation, and serialization.
 */

// Supported property types
export type PropertyType = 'number' | 'boolean' | 'string' | 'enum';

// Base property definition
export interface PropertyDefBase {
  // Identity
  key: string; // Config key (camelCase, used in YAML as snake_case)
  storeKey?: string; // Store key if different (e.g., 'cameraScale' vs 'scale')

  // Behavior
  persist: boolean; // Include in localStorage persistence and config export
  transient?: boolean; // Runtime-only (triggers, selections) - not persisted

  // Documentation
  description?: string; // For YAML template comments
}

// Number property (non-nullable)
export interface NumberPropertyDef extends PropertyDefBase {
  type: 'number';
  default: number;
  min?: number;
  max?: number;
  isInt?: boolean;
  nullable?: false;
}

// Nullable number property (allows null, stored as Infinity in store)
export interface NullableNumberPropertyDef extends PropertyDefBase {
  type: 'number';
  default: number | null;
  min?: number;
  max?: number;
  isInt?: boolean;
  nullable: true;
}

// Boolean property
export interface BooleanPropertyDef extends PropertyDefBase {
  type: 'boolean';
  default: boolean;
}

// String property
export interface StringPropertyDef extends PropertyDefBase {
  type: 'string';
  default: string;
  pattern?: RegExp; // Regex validation (e.g., hex color)
  patternDesc?: string; // Human-readable pattern description for error messages
}

// Enum property
export interface EnumPropertyDef<T extends readonly string[] = readonly string[]>
  extends PropertyDefBase {
  type: 'enum';
  enumValues: T;
  default: T[number];
}

// Union of all property definitions
export type PropertyDef =
  | NumberPropertyDef
  | NullableNumberPropertyDef
  | BooleanPropertyDef
  | StringPropertyDef
  | EnumPropertyDef;

// Store hook names
export type StoreHook =
  | 'usePointCloudStore'
  | 'useCameraStore'
  | 'useUIStore'
  | 'useExportStore'
  | 'useRigStore';

// Section definition
export interface SectionDef {
  key: string; // Section name: 'pointCloud', 'camera', 'ui', 'export'
  storeHook: StoreHook; // Store hook name
  properties: PropertyDef[];
}

/**
 * Helper to create a section definition with type inference
 */
export function defineSection<T extends SectionDef>(def: T): T {
  return def;
}
