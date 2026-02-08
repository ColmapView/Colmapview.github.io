import type { ReactNode, MouseEvent } from 'react';
import { TOUCH } from '../../theme/sizing';
import { Z_INDEX } from '../../theme/zIndex';

/**
 * Trigger haptic feedback on touch devices.
 * Uses the Vibration API with a brief 10ms pulse.
 */
function triggerHaptic() {
  if ('vibrate' in navigator) {
    navigator.vibrate(10);
  }
}

type FABPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
type FABSize = 'primary' | 'secondary';

interface TouchFABProps {
  icon: ReactNode;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  position?: FABPosition;
  size?: FABSize;
  label?: string;
  className?: string;
}

const positionClasses: Record<FABPosition, string> = {
  'bottom-right': 'bottom-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'top-right': 'top-4 right-4',
  'top-left': 'top-4 left-4',
};

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
  const isPrimary = size === 'primary';
  const diameter = isPrimary ? TOUCH.minTapTarget : TOUCH.fabSecondarySize;

  const baseClasses = `
    fixed
    rounded-full shadow-lg
    flex items-center justify-center
    transition-all duration-200
    active:scale-95
    ${positionClasses[position]}
  `;

  const sizeClasses = isPrimary
    ? 'bg-ds-accent text-ds-void hover:bg-ds-accent/90'
    : 'bg-ds-tertiary text-ds-primary border border-ds hover:bg-ds-hover';

  const iconSize = isPrimary ? 'w-5 h-5' : 'w-4 h-4';

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    triggerHaptic();
    onClick(e);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`${baseClasses} ${sizeClasses} ${className}`}
      style={{ width: diameter, height: diameter, zIndex: Z_INDEX.fab }}
      aria-label={label}
    >
      <span className={iconSize}>{icon}</span>
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
