import type { ReactNode, MouseEvent } from 'react';
import {
  getTouchFabClassName,
  getTouchFabIconClassName,
  getTouchFabStyle,
  type TouchFabPosition,
  type TouchFabSize,
} from './touchFabPolicy';

/**
 * Trigger haptic feedback on touch devices.
 * Uses the Vibration API with a brief 10ms pulse.
 */
function triggerHaptic() {
  if ('vibrate' in navigator) {
    navigator.vibrate(10);
  }
}

interface TouchFABProps {
  icon: ReactNode;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  position?: TouchFabPosition;
  size?: TouchFabSize;
  label?: string;
  className?: string;
}

/**
 * Floating Action Button for touch mode.
 * Primary size: 44px diameter (min tap target)
 * Secondary size: 40px diameter (matches desktop control buttons)
 */
export function TouchFAB({
  icon,
  onClick,
  position = 'bottom-right',
  size = 'primary',
  label,
  className = '',
}: TouchFABProps) {
  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    triggerHaptic();
    onClick(e);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={getTouchFabClassName({ position, size, className })}
      style={getTouchFabStyle(size)}
      aria-label={label}
    >
      <span className={getTouchFabIconClassName(size)}>{icon}</span>
    </button>
  );
}

/**
 * Menu FAB - opens control sheet/hamburger menu.
 */
export function MenuFAB({ onToggle }: { onToggle: () => void }) {
  return (
    <TouchFAB
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      }
      onClick={onToggle}
      position="top-left"
      size="secondary"
      label="Open menu"
    />
  );
}
