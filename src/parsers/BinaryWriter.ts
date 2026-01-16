/**
 * Binary writer utility for creating COLMAP binary files.
 * All COLMAP binary data is stored in little-endian byte order.
 *
 * This is the counterpart to BinaryReader.ts for export functionality.
 */
export class BinaryWriter {
  private chunks: ArrayBuffer[] = [];
  private currentBuffer: ArrayBuffer;
  private currentView: DataView;
  private offset = 0;
  private readonly chunkSize = 65536; // 64KB chunks

  constructor() {
    this.currentBuffer = new ArrayBuffer(this.chunkSize);
    this.currentView = new DataView(this.currentBuffer);
  }

  /**
   * Ensure there's enough space in the current chunk for the next write.
   * If not, save the current chunk and allocate a new one.
   */
  private ensureCapacity(bytes: number): void {
    if (this.offset + bytes > this.chunkSize) {
      // Save current chunk (trimmed to actual size used)
      this.chunks.push(this.currentBuffer.slice(0, this.offset));
      // Allocate new chunk
      this.currentBuffer = new ArrayBuffer(this.chunkSize);
      this.currentView = new DataView(this.currentBuffer);
      this.offset = 0;
    }
  }

  writeUint8(value: number): void {
    this.ensureCapacity(1);
    this.currentView.setUint8(this.offset, value);
    this.offset += 1;
  }

  writeUint32(value: number): void {
    this.ensureCapacity(4);
    this.currentView.setUint32(this.offset, value, true); // little-endian
    this.offset += 4;
  }

  writeInt32(value: number): void {
    this.ensureCapacity(4);
    this.currentView.setInt32(this.offset, value, true); // little-endian
    this.offset += 4;
  }

  /**
   * Write unsigned 64-bit integer (for point3D_id, counts, etc.)
   * COLMAP uses uint64_t for point3D_t
   */
  writeUint64(value: bigint): void {
    this.ensureCapacity(8);
    this.currentView.setBigUint64(this.offset, value, true); // little-endian
    this.offset += 8;
  }

  /**
   * Convenience method to write a number as uint64
   */
  writeUint64FromNumber(value: number): void {
    this.writeUint64(BigInt(value));
  }

  /**
   * Write signed 64-bit integer
   */
  writeInt64(value: bigint): void {
    this.ensureCapacity(8);
    this.currentView.setBigInt64(this.offset, value, true); // little-endian
    this.offset += 8;
  }

  writeFloat64(value: number): void {
    this.ensureCapacity(8);
    this.currentView.setFloat64(this.offset, value, true); // little-endian
    this.offset += 8;
  }

  /**
   * Write a null-terminated ASCII string.
   * Matches COLMAP's string format in binary files.
   */
  writeString(str: string): void {
    for (let i = 0; i < str.length; i++) {
      this.writeUint8(str.charCodeAt(i));
    }
    this.writeUint8(0); // null terminator
  }

  /**
   * Get the final ArrayBuffer containing all written data.
   * Merges all chunks into a single buffer.
   */
  toArrayBuffer(): ArrayBuffer {
    // Add final chunk if it has data
    if (this.offset > 0) {
      this.chunks.push(this.currentBuffer.slice(0, this.offset));
    }

    // Calculate total size
    const totalSize = this.chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);

    // Merge all chunks into single buffer
    const result = new ArrayBuffer(totalSize);
    const resultView = new Uint8Array(result);
    let position = 0;

    for (const chunk of this.chunks) {
      resultView.set(new Uint8Array(chunk), position);
      position += chunk.byteLength;
    }

    return result;
  }

  /**
   * Get as Blob for download
   */
  toBlob(): Blob {
    return new Blob([this.toArrayBuffer()], { type: 'application/octet-stream' });
  }

  /**
   * Get current total bytes written (across all chunks)
   */
  get bytesWritten(): number {
    const chunksSize = this.chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    return chunksSize + this.offset;
  }
}
