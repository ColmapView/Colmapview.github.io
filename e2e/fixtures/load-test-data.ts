import { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_DATA_DIR = path.join(__dirname, 'test-data');

interface FileEntry {
  /** Relative path for the file key, e.g. "sparse/cameras.txt" */
  relativePath: string;
  /** Base64-encoded file contents */
  base64: string;
  /** Filename only, e.g. "cameras.txt" */
  name: string;
}

/**
 * Recursively collect files from a directory, returning relative paths.
 */
function collectFiles(dir: string, prefix: string = ''): FileEntry[] {
  const entries: FileEntry[] = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, item.name);
    const relPath = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isDirectory()) {
      entries.push(...collectFiles(fullPath, relPath));
    } else {
      entries.push({
        relativePath: relPath,
        base64: fs.readFileSync(fullPath).toString('base64'),
        name: item.name,
      });
    }
  }
  return entries;
}

/**
 * Load the minimal test dataset by dispatching a synthetic drop event
 * with mock FileSystemEntry objects that preserve directory structure.
 *
 * The app's scanEntry() traverses FileSystemDirectoryEntry / FileSystemFileEntry,
 * so we mock that API in the browser context.
 */
export async function loadTestDataset(page: Page): Promise<void> {
  const files = collectFiles(TEST_DATA_DIR);

  await page.evaluate(async (fileData: FileEntry[]) => {
    // Helper: build a nested tree from flat paths
    type TreeNode = { name: string; children: Map<string, TreeNode>; file?: File };
    const root: TreeNode = { name: '', children: new Map() };

    for (const entry of fileData) {
      const bytes = Uint8Array.from(atob(entry.base64), c => c.charCodeAt(0));
      const file = new File([bytes], entry.name);
      const parts = entry.relativePath.split('/');

      let node = root;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!node.children.has(parts[i])) {
          node.children.set(parts[i], { name: parts[i], children: new Map() });
        }
        node = node.children.get(parts[i])!;
      }
      const fileName = parts[parts.length - 1];
      node.children.set(fileName, { name: fileName, children: new Map(), file });
    }

    // Helper: convert tree node to FileSystemEntry
    function makeFileEntry(node: TreeNode): FileSystemEntry {
      if (node.file) {
        // FileSystemFileEntry
        return {
          isFile: true,
          isDirectory: false,
          name: node.name,
          fullPath: '/' + node.name,
          filesystem: {} as FileSystem,
          getParent: () => {},
          file: (cb: (f: File) => void) => cb(node.file!),
        } as unknown as FileSystemFileEntry;
      } else {
        // FileSystemDirectoryEntry
        const children = Array.from(node.children.values()).map(makeFileEntry);
        let read = false;
        return {
          isFile: false,
          isDirectory: true,
          name: node.name,
          fullPath: '/' + node.name,
          filesystem: {} as FileSystem,
          getParent: () => {},
          createReader: () => ({
            readEntries: (cb: (entries: FileSystemEntry[]) => void) => {
              if (!read) {
                read = true;
                cb(children);
              } else {
                cb([]); // Signal end of entries
              }
            },
          }),
        } as unknown as FileSystemDirectoryEntry;
      }
    }

    // Build top-level entries (simulate dropping the test-data folder contents)
    const topEntries = Array.from(root.children.values()).map(makeFileEntry);

    // Create DataTransfer with dummy files (needed for types check)
    const dt = new DataTransfer();
    for (const entry of fileData) {
      const bytes = Uint8Array.from(atob(entry.base64), c => c.charCodeAt(0));
      dt.items.add(new File([bytes], entry.name));
    }

    // Dispatch drop event with mock dataTransfer
    const dropZone = document.querySelector('[data-testid="drop-zone"]');
    if (!dropZone) throw new Error('Drop zone not found');

    const dropEvent = new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
    });

    // Override dataTransfer to provide our mock entries
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: {
        items: topEntries.map((entry, i) => ({
          kind: 'file',
          type: '',
          getAsFile: () => dt.files[i] || null,
          webkitGetAsEntry: () => entry,
        })),
        files: dt.files,
        types: ['Files'],
      },
    });

    dropZone.dispatchEvent(dropEvent);
  }, files);
}
