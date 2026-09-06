/** Shared loading, empty, error, and mobile message presentation. */
import { buttonStyles } from './buttonStyles';

const progressTrack = 'h-2 bg-ds-tertiary rounded-full overflow-hidden';

export const loadingStyles = {
  overlay: 'absolute inset-0 bg-black/50 backdrop-blur-sm z-overlay flex items-center justify-center',
  container: 'flex flex-col items-center text-center',
  dots: 'flex justify-center mb-4 space-x-2',
  dot: 'w-3 h-3 rounded-full bg-ds-accent animate-bounce',
  progressTrack,
  progressBar: `w-64 ${progressTrack}`,
  progressFill: 'h-full bg-ds-accent transition-all duration-300',
  text: 'text-sm mb-4 text-ds-primary max-w-md break-words',
  percentage: 'text-sm text-ds-secondary mt-2',
} as const;

export const emptyStateStyles = {
  container: 'h-full flex items-center justify-center text-ds-muted bg-ds-secondary',
  containerFull: 'flex flex-col items-center justify-center h-full p-8 text-center bg-ds-secondary',
  icon: 'text-ds-error text-6xl mb-4',
  title: 'm-0 text-xl font-semibold text-ds-primary mb-2',
  message: 'text-ds-secondary text-sm mb-4 max-w-md',
  button: `${buttonStyles.base} ${buttonStyles.sizes.lg} ${buttonStyles.variants.primary}`,
} as const;

// ============================================
// MOBILE MESSAGE STYLES
// ============================================

export const mobileMessageStyles = {
  container: 'h-screen flex flex-col items-center justify-center bg-ds-primary p-6 text-center',
  title: 'm-0 text-xl font-semibold text-ds-primary mb-3',
  message: 'text-ds-secondary text-sm mb-4',
  badge: 'mt-6 px-4 py-2 bg-ds-tertiary rounded-lg text-sm text-ds-muted',
} as const;


export const errorStateStyles = {
  container: 'flex flex-col items-center justify-center h-full p-4 text-center bg-ds-secondary',
  icon: 'text-ds-error text-2xl mb-2',
  title: 'm-0 text-sm font-semibold text-ds-primary mb-2',
  message: 'text-xs text-ds-secondary mb-4 max-w-xs',
} as const;
