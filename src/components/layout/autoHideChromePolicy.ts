export function shouldHideChromeWithButtons({
  autoHideButtons,
  isIdle,
  showAutoHideEditor,
}: {
  autoHideButtons: boolean;
  isIdle: boolean;
  showAutoHideEditor: boolean;
}): boolean {
  return autoHideButtons && (isIdle || showAutoHideEditor);
}
