import type { Page } from '@playwright/test';

/** Native disk-backed Files: no Node/base64 pixel copies in resource measurements. */
export async function loadDiskDataset(page: Page, directory: string): Promise<void> {
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.setAttribute('webkitdirectory', '');
    input.dataset.trainingDiskFixture = '';
    input.hidden = true;
    document.body.append(input);
  });
  const input = page.locator('input[data-training-disk-fixture]');
  try {
    await input.setInputFiles(directory);
    await input.evaluate(element => {
      const files = [...((element as HTMLInputElement).files ?? [])];
      type Entry = { name: string; isFile: boolean; isDirectory: boolean;
        file?: (done: (file: File) => void) => void;
        createReader?: () => { readEntries: (done: (entries: Entry[]) => void) => void } };
      type Node = { name: string; children: Map<string, Node>; file?: File };
      const root: Node = { name: '', children: new Map() };
      const selected: File[] = [];
      for (const file of files) {
        const parts = file.webkitRelativePath.split('/').slice(1);
        // Fixture roots may contain compiled caches or receipts. Only source
        // model/image/mask directories belong to the user's reconstruction.
        if (!['sparse', 'images', 'masks'].includes(parts[0]) || parts.some(part => part.startsWith('.'))) continue;
        let node = root;
        for (const name of parts) {
          if (!node.children.has(name)) node.children.set(name, { name, children: new Map() });
          node = node.children.get(name)!;
        }
        node.file = file;
        selected.push(file);
      }
      if (!root.children.has('sparse') || !root.children.has('images')) throw new Error('Expected sparse/ and images/ source directories.');
      const entry = (node: Node): Entry => node.file
        ? { name: node.name, isFile: true, isDirectory: false, file: done => done(node.file!) }
        : { name: node.name, isFile: false, isDirectory: true, createReader: () => {
          let read = false;
          return { readEntries: done => {
            const children = read ? [] : [...node.children.values()].map(entry);
            read = true;
            done(children);
          } };
        } };
      const drop = new DragEvent('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(drop, 'dataTransfer', { value: {
        types: ['Files'], files: selected,
        items: [...root.children.values()].map(node => ({
          kind: 'file', type: '', getAsFile: () => null, webkitGetAsEntry: () => entry(node),
        })),
      } });
      const zone = document.querySelector('[data-testid="drop-zone"]');
      if (!zone) throw new Error('Drop zone not found.');
      zone.dispatchEvent(drop);
    });
  } finally { await input.evaluate(element => element.remove()); }
}
