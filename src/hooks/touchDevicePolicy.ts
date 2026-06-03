export const COARSE_POINTER_QUERY = '(pointer: coarse)';
export const NO_HOVER_QUERY = '(hover: none)';

export const TOUCH_CAPABILITY_MEDIA_QUERIES = [
  COARSE_POINTER_QUERY,
  NO_HOVER_QUERY,
] as const;

export interface TouchCapabilities {
  hasTouch: boolean;
  isCoarsePointer: boolean;
  cannotHover: boolean;
}

export interface TouchMediaState {
  isCoarsePointer: boolean;
  cannotHover: boolean;
}

export interface TouchEnvironment {
  matchMedia?: TouchMediaMatcher;
  maxTouchPoints?: number;
  hasTouchStart?: boolean;
}

export type TouchMediaMatcher = (query: string) => { matches: boolean };

export const NO_TOUCH_CAPABILITIES: TouchCapabilities = {
  hasTouch: false,
  isCoarsePointer: false,
  cannotHover: false,
};

export function getTouchMediaState(matchMedia?: TouchMediaMatcher): TouchMediaState {
  if (!matchMedia) {
    return {
      isCoarsePointer: false,
      cannotHover: false,
    };
  }

  return {
    isCoarsePointer: matchMedia(COARSE_POINTER_QUERY).matches,
    cannotHover: matchMedia(NO_HOVER_QUERY).matches,
  };
}

export function shouldUseTouchMode({
  isCoarsePointer,
  cannotHover,
}: TouchMediaState): boolean {
  return isCoarsePointer && cannotHover;
}

export function getTouchCapabilitiesFromEnvironment({
  matchMedia,
  maxTouchPoints = 0,
  hasTouchStart = false,
}: TouchEnvironment): TouchCapabilities {
  const mediaState = getTouchMediaState(matchMedia);

  return {
    hasTouch: maxTouchPoints > 0 || hasTouchStart,
    isCoarsePointer: mediaState.isCoarsePointer,
    cannotHover: mediaState.cannotHover,
  };
}
