/**
 * YAML Template Generator
 *
 * Generates YAML configuration template from property registry definitions.
 */

import type { PropertyDef, SectionDef } from '../types';
import { sections, getPersistedProperties } from '../index';

/**
 * Convert camelCase to snake_case
 */
function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Format a section key for display (e.g., 'pointCloud' -> 'Point cloud')
 */
function formatSectionName(key: string): string {
  const words = key.replace(/([A-Z])/g, ' $1').trim();
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

/**
 * Format a value for YAML output
 */
function formatYamlValue(value: unknown): string {
  if (value === null) {
    return '~'; // YAML null
  }
  if (typeof value === 'string') {
    // Quote strings that contain special characters or start with #
    if (value.startsWith('#') || /[:#[\]{}&*!|>'"@`]/.test(value)) {
      return `"${value}"`;
    }
    return value;
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return String(value);
}

/**
 * Generate a comment for a property
 */
function generatePropertyComment(prop: PropertyDef): string {
  const parts: string[] = [];

  // Add description if available
  if (prop.description) {
    parts.push(prop.description);
  } else {
    // Generate description from constraints
    if (prop.type === 'number') {
      if (prop.min !== undefined && prop.max !== undefined) {
        parts.push(`Range: ${prop.min} - ${prop.max}`);
      } else if (prop.min !== undefined) {
        parts.push(`Min: ${prop.min}`);
      } else if (prop.max !== undefined) {
        parts.push(`Max: ${prop.max}`);
      }
    }
  }

  return parts.length > 0 ? `  # ${parts.join(', ')}` : '';
}

/**
 * Generate YAML template for a section
 */
export function generateSectionTemplate(section: SectionDef): string {
  const lines: string[] = [];
  const sectionKey = toSnakeCase(section.key);

  lines.push(`# ${formatSectionName(section.key)} settings`);
  lines.push(`${sectionKey}:`);

  for (const prop of getPersistedProperties(section)) {
    const yamlKey = toSnakeCase(prop.key);
    const value = formatYamlValue(prop.default);
    const comment = generatePropertyComment(prop);
    lines.push(`  ${yamlKey}: ${value}${comment}`);
  }

  return lines.join('\n');
}

/**
 * Generate the full YAML configuration template
 */
export function generateConfigTemplate(): string {
  const lines: string[] = [
    '# ColmapView Configuration',
    '# All fields are optional - only include settings you want to customize.',
    '',
    'version: 1',
    '',
  ];

  for (const section of sections) {
    lines.push(generateSectionTemplate(section));
    lines.push('');
  }

  return lines.join('\n');
}
