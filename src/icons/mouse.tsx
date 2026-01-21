import type { IconProps } from './types';

/**
 * Mouse icon with left button highlighted (for left-click hints)
 */
export function MouseLeftIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="6" y="2" width="12" height="20" rx="6"/>
      <path d="M12 2v8"/>
      <rect x="6" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
    </svg>
  );
}

/**
 * Mouse icon with right button highlighted (for right-click hints)
 */
export function MouseRightIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="6" y="2" width="12" height="20" rx="6"/>
      <path d="M12 2v8"/>
      <rect x="12" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
    </svg>
  );
}

/**
 * Mouse icon with scroll wheel highlighted (for scroll hints)
 */
export function MouseScrollIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="6" y="2" width="12" height="20" rx="6"/>
      <path d="M12 6v4M12 14v4M9 8l3-3 3 3M9 16l3 3 3-3"/>
    </svg>
  );
}

/**
 * Mouse icon with double-click indicator (left button + "2")
 */
export function MouseDoubleClickIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="6" y="2" width="12" height="20" rx="6"/>
      <path d="M12 2v8"/>
      <rect x="6" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
      <text x="18" y="18" fontSize="8" fill="currentColor" stroke="none">2</text>
    </svg>
  );
}
