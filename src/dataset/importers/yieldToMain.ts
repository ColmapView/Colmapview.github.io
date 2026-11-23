export async function yieldToMain(): Promise<void> {
  const scheduler = 'scheduler' in globalThis
    ? (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler
    : undefined;

  if (typeof scheduler?.yield === 'function') {
    await scheduler.yield();
    return;
  }

  await new Promise<void>(done => setTimeout(done, 0));
}
