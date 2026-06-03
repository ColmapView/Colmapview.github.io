export function getNextSelectionRainbowHue({
  hue,
  delta,
  animationSpeed,
  speedMultiplier,
}: {
  hue: number;
  delta: number;
  animationSpeed: number;
  speedMultiplier: number;
}): number {
  return (hue + delta * animationSpeed * speedMultiplier) % 1;
}

export function getSelectionBlinkFactor({
  elapsedTime,
  animationSpeed,
}: {
  elapsedTime: number;
  animationSpeed: number;
}): number {
  return (Math.sin(elapsedTime * animationSpeed * 2) + 1) / 2;
}

export function getSelectionBlinkOpacity(blinkFactor: number): number {
  return 0.3 + 0.7 * blinkFactor;
}
