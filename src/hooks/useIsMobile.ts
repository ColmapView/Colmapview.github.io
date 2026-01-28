import { useState, useEffect } from 'react';
import { BREAKPOINTS } from '../theme';

/**
 * Hook to detect if the current viewport is mobile-sized.
 * @param breakpoint - The width threshold below which is considered mobile (default: BREAKPOINTS.mobile)
 * @returns true if viewport width is below the breakpoint
 */
export function useIsMobile(breakpoint: number = BREAKPOINTS.mobile): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < breakpoint
  );

  useEffect(() => {
    function checkMobile(): void {
      setIsMobile(window.innerWidth < breakpoint);
    }
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [breakpoint]);

  return isMobile;
}
