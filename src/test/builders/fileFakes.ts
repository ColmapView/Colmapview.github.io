import type { ArchiveEntry, ArchiveFileEntry, ArchiveReader } from '../../types/libarchive';
import { buildFile } from './colmapBuilders';

interface ArchiveEntryBuilderOptions {
  name?: string;
  size?: number;
  lastModified?: number;
  extract?: ArchiveEntry['extract'];
}

interface ArchiveReaderBuilderOptions {
  getFilesArray?: ArchiveReader['getFilesArray'];
  getFilesObject?: ArchiveReader['getFilesObject'];
  extractFiles?: ArchiveReader['extractFiles'];
  extractSingleFile?: ArchiveReader['extractSingleFile'];
  close?: ArchiveReader['close'];
}

interface FileSystemEntryBuilderOptions {
  name?: string;
  isFile?: boolean;
  isDirectory?: boolean;
}

interface FileSystemFileEntryBuilderOptions {
  name?: string;
  file?: File;
  error?: Error;
}

interface FileSystemDirectoryEntryBuilderOptions {
  name?: string;
  entryBatches?: FileSystemEntry[][];
}

interface FileSystemFileHandleBuilderOptions {
  name?: string;
  file?: File;
  getFile?: FileSystemFileHandle['getFile'];
}

interface FileSystemDirectoryHandleBuilderOptions {
  name?: string;
  entries?: Array<FileSystemFileHandle | FileSystemDirectoryHandle>;
}

interface DataTransferItemBuilderOptions {
  kind?: DataTransferItem['kind'];
  type?: string;
  getAsFile?: DataTransferItem['getAsFile'];
  webkitGetAsEntry?: DataTransferItem['webkitGetAsEntry'];
}

interface DataTransferBuilderOptions {
  types?: string[];
  files?: File[];
  items?: DataTransferItem[];
}

interface ReadableFileBuilderOptions {
  name?: string;
  contents?: string;
  type?: string;
}

interface ReadableBinaryBlobBuilderOptions {
  contents?: Uint8Array;
  type?: string;
}

interface ReadableBinaryFileBuilderOptions extends ReadableBinaryBlobBuilderOptions {
  name?: string;
}

class TestFileSystemEntry implements FileSystemEntry {
  readonly name: string;
  readonly isFile: boolean;
  readonly isDirectory: boolean;

  constructor(
    name: string,
    isFile: boolean,
    isDirectory: boolean,
  ) {
    this.name = name;
    this.isFile = isFile;
    this.isDirectory = isDirectory;
  }

  get filesystem(): FileSystem {
    return TEST_FILE_SYSTEM;
  }

  get fullPath(): string {
    return this.name ? `/${this.name}` : '/';
  }

  getParent(successCallback?: FileSystemEntryCallback): void {
    successCallback?.(TEST_ROOT_DIRECTORY_ENTRY);
  }
}

class TestFileSystemFileEntry extends TestFileSystemEntry implements FileSystemFileEntry {
  private readonly fileValue: File;
  private readonly error?: Error;

  constructor(
    name: string,
    fileValue: File,
    error?: Error,
  ) {
    super(name, true, false);
    this.fileValue = fileValue;
    this.error = error;
  }

  file(successCallback: FileCallback, errorCallback?: ErrorCallback): void {
    if (this.error) {
      errorCallback?.(toDomException(this.error));
      return;
    }

    successCallback(this.fileValue);
  }
}

class TestFileSystemDirectoryEntry extends TestFileSystemEntry implements FileSystemDirectoryEntry {
  private readonly entryBatches: FileSystemEntry[][];

  constructor(
    name: string,
    entryBatches: FileSystemEntry[][] = [[]],
  ) {
    super(name, false, true);
    this.entryBatches = entryBatches;
  }

  createReader(): FileSystemDirectoryReader {
    let readIndex = 0;

    return {
      readEntries: (successCallback: FileSystemEntriesCallback) => {
        successCallback(this.entryBatches[readIndex++] ?? []);
      },
    };
  }

  getDirectory(
    _path?: string | null,
    _options?: FileSystemFlags,
    _successCallback?: FileSystemEntryCallback,
    errorCallback?: ErrorCallback,
  ): void {
    errorCallback?.(new DOMException('Directory lookup is not implemented by this test fake', 'NotFoundError'));
  }

  getFile(
    _path?: string | null,
    _options?: FileSystemFlags,
    _successCallback?: FileSystemEntryCallback,
    errorCallback?: ErrorCallback,
  ): void {
    errorCallback?.(new DOMException('File lookup is not implemented by this test fake', 'NotFoundError'));
  }
}

class TestFileSystemFileHandle implements FileSystemFileHandle {
  readonly kind = 'file';
  readonly name: string;
  private readonly getFileImpl: FileSystemFileHandle['getFile'];

  constructor(
    name: string,
    getFile: FileSystemFileHandle['getFile'],
  ) {
    this.name = name;
    this.getFileImpl = getFile;
  }

  createWritable(): Promise<FileSystemWritableFileStream> {
    return Promise.reject(new DOMException('Writable streams are not implemented by this test fake', 'NotSupportedError'));
  }

  getFile(): Promise<File> {
    return this.getFileImpl();
  }

  isSameEntry(other: FileSystemHandle): Promise<boolean> {
    return Promise.resolve(other === this || (other.kind === this.kind && other.name === this.name));
  }
}

class TestFileSystemDirectoryHandle implements FileSystemDirectoryHandle {
  readonly kind = 'directory';
  readonly name: string;
  private readonly entries: Array<FileSystemFileHandle | FileSystemDirectoryHandle>;

  constructor(
    name: string,
    entries: Array<FileSystemFileHandle | FileSystemDirectoryHandle>,
  ) {
    this.name = name;
    this.entries = entries;
  }

  async getDirectoryHandle(name: string): Promise<FileSystemDirectoryHandle> {
    for (const entry of this.entries) {
      if (entry.kind === 'directory' && entry.name === name) {
        return entry;
      }
    }

    throw new DOMException(`Directory handle not found: ${name}`, 'NotFoundError');
  }

  async getFileHandle(name: string): Promise<FileSystemFileHandle> {
    for (const entry of this.entries) {
      if (entry.kind === 'file' && entry.name === name) {
        return entry;
      }
    }

    throw new DOMException(`File handle not found: ${name}`, 'NotFoundError');
  }

  isSameEntry(other: FileSystemHandle): Promise<boolean> {
    return Promise.resolve(other === this || (other.kind === this.kind && other.name === this.name));
  }

  removeEntry(name: string): Promise<void> {
    const index = this.entries.findIndex((entry) => entry.name === name);
    if (index >= 0) {
      this.entries.splice(index, 1);
    }

    return Promise.resolve();
  }

  async resolve(possibleDescendant: FileSystemHandle): Promise<string[] | null> {
    for (const entry of this.entries) {
      if (await entry.isSameEntry(possibleDescendant)) {
        return [entry.name];
      }

      if (entry.kind === 'directory') {
        const nestedPath = await entry.resolve(possibleDescendant);
        if (nestedPath) {
          return [entry.name, ...nestedPath];
        }
      }
    }

    return null;
  }

  async *values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle> {
    for (const entry of this.entries) {
      yield entry;
    }
  }
}

class TestFileList implements FileList {
  [index: number]: File;

  private readonly files: File[];

  constructor(files: File[]) {
    this.files = [...files];
    this.syncIndexes();
  }

  get length(): number {
    return this.files.length;
  }

  item(index: number): File | null {
    return this.files[index] ?? null;
  }

  *[Symbol.iterator](): IterableIterator<File> {
    yield* this.files;
  }

  private syncIndexes(): void {
    this.files.forEach((file, index) => {
      this[index] = file;
    });
  }
}

class TestDataTransferItem implements DataTransferItem {
  readonly kind: string;
  readonly type: string;
  private readonly getAsFileImpl: DataTransferItem['getAsFile'];
  private readonly webkitGetAsEntryImpl: DataTransferItem['webkitGetAsEntry'];
  private readonly stringData: string | null;

  constructor({
    kind,
    type,
    getAsFile,
    webkitGetAsEntry,
    stringData = null,
  }: DataTransferItemBuilderOptions & { stringData?: string | null }) {
    this.kind = kind ?? 'file';
    this.type = type ?? '';
    this.getAsFileImpl = getAsFile ?? (() => null);
    this.webkitGetAsEntryImpl = webkitGetAsEntry ?? (() => null);
    this.stringData = stringData;
  }

  getAsFile(): File | null {
    return this.getAsFileImpl();
  }

  getAsString(callback: FunctionStringCallback | null): void {
    if (this.kind === 'string' && this.stringData !== null) {
      callback?.(this.stringData);
    }
  }

  webkitGetAsEntry(): FileSystemEntry | null {
    return this.webkitGetAsEntryImpl();
  }
}

class TestDataTransferItemList implements DataTransferItemList {
  [index: number]: DataTransferItem;

  private readonly items: DataTransferItem[];

  constructor(items: DataTransferItem[]) {
    this.items = [...items];
    this.syncIndexes();
  }

  get length(): number {
    return this.items.length;
  }

  add(data: string, type: string): DataTransferItem | null;
  add(data: File): DataTransferItem | null;
  add(data: string | File, type = ''): DataTransferItem | null {
    const previousLength = this.items.length;
    const item = data instanceof File
      ? new TestDataTransferItem({
        kind: 'file',
        type: data.type,
        getAsFile: () => data,
      })
      : new TestDataTransferItem({
        kind: 'string',
        type,
        stringData: data,
      });

    this.items.push(item);
    this.syncIndexes(previousLength);
    return item;
  }

  clear(): void {
    const previousLength = this.items.length;
    this.items.length = 0;
    this.syncIndexes(previousLength);
  }

  item(index: number): DataTransferItem | null {
    return this.items[index] ?? null;
  }

  remove(index: number): void {
    if (index < 0 || index >= this.items.length) {
      return;
    }

    const previousLength = this.items.length;
    this.items.splice(index, 1);
    this.syncIndexes(previousLength);
  }

  *[Symbol.iterator](): IterableIterator<DataTransferItem> {
    yield* this.items;
  }

  private syncIndexes(previousLength = this.items.length): void {
    for (let index = 0; index < previousLength; index += 1) {
      delete this[index];
    }

    this.items.forEach((item, index) => {
      this[index] = item;
    });
  }
}

class TestDataTransfer implements DataTransfer {
  dropEffect: DataTransfer['dropEffect'] = 'none';
  effectAllowed: DataTransfer['effectAllowed'] = 'all';
  readonly files: FileList;
  readonly items: TestDataTransferItemList;
  private readonly dataByFormat = new Map<string, string>();
  private readonly typeList: string[];

  constructor({
    types,
    files,
    items,
  }: Required<DataTransferBuilderOptions>) {
    this.typeList = [...types];
    this.files = new TestFileList(files);
    this.items = new TestDataTransferItemList(items);
  }

  get types(): ReadonlyArray<string> {
    return this.typeList;
  }

  clearData(format?: string): void {
    if (format === undefined) {
      this.dataByFormat.clear();
      this.typeList.length = 0;
      return;
    }

    this.dataByFormat.delete(format);
    const index = this.typeList.indexOf(format);
    if (index >= 0) {
      this.typeList.splice(index, 1);
    }
  }

  getData(format: string): string {
    return this.dataByFormat.get(format) ?? '';
  }

  setData(format: string, data: string): void {
    this.dataByFormat.set(format, data);
    if (!this.typeList.includes(format)) {
      this.typeList.push(format);
    }
  }

  setDragImage(): void {
    return undefined;
  }
}

const TEST_ROOT_DIRECTORY_ENTRY = new TestFileSystemDirectoryEntry('');
const TEST_FILE_SYSTEM: FileSystem = {
  name: 'test-filesystem',
  root: TEST_ROOT_DIRECTORY_ENTRY,
};

export function buildReadableFile({
  name = 'file.txt',
  contents = '',
  type = 'text/plain',
}: ReadableFileBuilderOptions = {}): File {
  const file = buildFile(name, contents, type);

  Object.defineProperties(file, {
    arrayBuffer: {
      configurable: true,
      value: () => Promise.resolve(encodeFileContents(contents)),
    },
    text: {
      configurable: true,
      value: () => Promise.resolve(contents),
    },
  });

  return file;
}

export function buildTextFile(name: string, contents: string): File {
  return buildReadableFile({ name, contents, type: 'text/plain' });
}

export function buildBinaryFile(name: string, contents: string): File {
  return buildReadableFile({ name, contents, type: 'application/octet-stream' });
}

export function buildReadableBinaryBlob({
  contents = new Uint8Array(),
  type = 'application/octet-stream',
}: ReadableBinaryBlobBuilderOptions = {}): Blob {
  const blob = new Blob([copyBytes(contents)], { type });

  Object.defineProperty(blob, 'arrayBuffer', {
    configurable: true,
    value: () => readBlobAsArrayBuffer(blob),
  });

  return blob;
}

export function buildReadableBinaryFile({
  name = 'file.bin',
  contents = new Uint8Array(),
  type = 'application/octet-stream',
}: ReadableBinaryFileBuilderOptions = {}): File {
  const file = new File([copyBytes(contents)], name, { type });

  Object.defineProperty(file, 'arrayBuffer', {
    configurable: true,
    value: () => readBlobAsArrayBuffer(file),
  });

  return file;
}

export function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
        return;
      }

      reject(new TypeError('Expected FileReader to return an ArrayBuffer'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'));
    reader.readAsArrayBuffer(blob);
  });
}

export function copyBytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return copyBytes(bytes);
}

export function buildArchiveEntry({
  name = 'image.jpg',
  size = 100,
  lastModified = 0,
  extract = () => Promise.resolve(buildFile(name)),
}: ArchiveEntryBuilderOptions = {}): ArchiveEntry {
  return {
    name,
    size,
    lastModified,
    extract,
  };
}

export function buildArchiveReader({
  getFilesArray = () => Promise.resolve<ArchiveFileEntry[]>([]),
  getFilesObject = () => Promise.resolve({}),
  extractFiles = () => Promise.resolve({}),
  extractSingleFile = (path: string) => Promise.resolve(buildFile(path)),
  close = () => Promise.resolve(),
}: ArchiveReaderBuilderOptions = {}): ArchiveReader {
  return {
    getFilesArray,
    getFilesObject,
    extractFiles,
    extractSingleFile,
    close,
  };
}

export function buildFileSystemEntry({
  name = 'entry',
  isFile = true,
  isDirectory = false,
}: FileSystemEntryBuilderOptions = {}): FileSystemEntry {
  return new TestFileSystemEntry(name, isFile, isDirectory);
}

export function buildFileSystemFileEntry({
  name = 'file.txt',
  file = buildFile(name),
  error,
}: FileSystemFileEntryBuilderOptions = {}): FileSystemFileEntry {
  return new TestFileSystemFileEntry(name, file, error);
}

export function buildFileSystemDirectoryEntry({
  name = 'directory',
  entryBatches = [[]],
}: FileSystemDirectoryEntryBuilderOptions = {}): FileSystemDirectoryEntry {
  return new TestFileSystemDirectoryEntry(name, entryBatches);
}

export function buildFileSystemFileHandle({
  name = 'file.txt',
  file = buildFile(name),
  getFile = () => Promise.resolve(file),
}: FileSystemFileHandleBuilderOptions = {}): FileSystemFileHandle {
  return new TestFileSystemFileHandle(name, getFile);
}

export function buildFileSystemDirectoryHandle({
  name = 'directory',
  entries = [],
}: FileSystemDirectoryHandleBuilderOptions = {}): FileSystemDirectoryHandle {
  return new TestFileSystemDirectoryHandle(name, entries);
}

export function buildDataTransferItem({
  kind = 'file',
  type = '',
  getAsFile = () => null,
  webkitGetAsEntry = () => null,
}: DataTransferItemBuilderOptions = {}): DataTransferItem {
  return new TestDataTransferItem({
    kind,
    type,
    getAsFile,
    webkitGetAsEntry,
  });
}

export function buildDataTransfer({
  types = ['Files'],
  files = [],
  items = [],
}: DataTransferBuilderOptions = {}): DataTransfer {
  return new TestDataTransfer({
    types,
    files,
    items,
  });
}

function encodeFileContents(contents: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(contents);
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function copyBytes(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function toDomException(error: Error): DOMException {
  if (error instanceof DOMException) {
    return error;
  }

  return new DOMException(error.message, error.name);
}
