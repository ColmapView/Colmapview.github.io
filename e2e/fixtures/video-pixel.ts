export function videoPixel(element: HTMLElement): number[] {
  const video = element as HTMLVideoElement, canvas = document.createElement('canvas');
  if (video.readyState < 2) return [0, 0, 0, 0];
  canvas.width = 1; canvas.height = 1;
  const context = canvas.getContext('2d')!; context.drawImage(video, 0, 0, 1, 1);
  return [...context.getImageData(0, 0, 1, 1).data];
}
