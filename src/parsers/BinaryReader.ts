/**
 * Binary reader utility for parsing COLMAP binary files.
 * All COLMAP binary data is stored in little-endian byte order.
 */
export class BinaryReader {
  private view: DataView;
  private offset = 0;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
  }

  get position(): number {
    return this.offset;
  }

  get remaining(): number {
    return this.view.byteLength - this.offset;
  }

  get length(): number {
    return this.view.byteLength;
  }

  readUint8(): number {
    const val = this.view.getUint8(this.offset);
    this.offset += 1;
    return val;
  }

  readUint32(): number {
    const val = this.view.getUint32(this.offset, true); // little-endian
    this.offset += 4;
    return val;
  }

  readInt32(): number {
    const val = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return val;
  }

  readUint64(): bigint {
    const val = this.view.getBigUint64(this.offset, true);
    this.offset += 8;
    return val;
  }

  readUint64AsNumber(): number {
    return Number(this.readUint64());
  }

  readInt64(): bigint {
    const val = this.view.getBigInt64(this.offset, true);
    this.offset += 8;
    return val;
  }

  readFloat64(): number {
    const val = this.view.getFloat64(this.offset, true);
    this.offset += 8;
    return val;
  }

  /**
   * Read a null-terminated string (ASCII)
   */
  readString(): string {
    let str = '';
    let char: number;
    while ((char = this.readUint8()) !== 0) {
      str += String.fromCharCode(char);
    }
    return str;
  }

  skip(bytes: number): void {
    this.offset += bytes;
  }

  seek(position: number): void {
    this.offset = position;
  }

  hasMore(): boolean {
    return this.offset < this.view.byteLength;
  }
}
