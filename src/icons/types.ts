/**
 * Common types for icon components.
 */

import type { ReactNode } from 'react';

// Standard props for all icon components
export interface IconProps {
  className?: string;
}

// Props for the HoverIcon wrapper
export interface HoverIconProps {
  icon: ReactNode;
  label: string;
}
