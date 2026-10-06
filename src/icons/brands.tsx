import type { IconProps } from './types';

export function GoogleDriveIcon({ className = 'w-4 h-4' }: IconProps) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className={className}>
    <path fill="#0F9D58" d="M8 2h8L5 21l-4-7z" />
    <path fill="#F4B400" d="M16 2l7 12h-8L8 2z" />
    <path fill="#4285F4" d="M5 21l4-7h14l-4 7z" />
  </svg>;
}
