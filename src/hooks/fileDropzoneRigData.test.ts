import { describe, expect, it, vi } from 'vitest';
import { buildBinaryFile, buildRigData, buildTextFile } from '../test/builders';
import type { RigData } from '../types/rig';
import { loadOptionalRigData, type RigDataParsers } from './fileDropzoneRigData';

function createRigData(): RigData {
  return buildRigData();
}

function createParsers(rigData = createRigData()): RigDataParsers {
  return {
    parseRigsBinary: vi.fn(() => rigData.rigs),
    parseRigsText: vi.fn(() => rigData.rigs),
    parseFramesBinary: vi.fn(() => rigData.frames),
    parseFramesText: vi.fn(() => rigData.frames),
  };
}

function textFile(name: string, contents: string): File {
  return buildTextFile(name, contents);
}

function binaryFile(name: string, contents: string): File {
  return buildBinaryFile(name, contents);
}

describe('file dropzone rig data helper', () => {
  it('reuses rig data already produced by the WASM parser', async () => {
    const wasmRigData = createRigData();
    const parsers = createParsers();
    const log = vi.fn();

    await expect(loadOptionalRigData({
      wasmRigData,
      rigsFile: textFile('rigs.txt', 'rig text'),
      framesFile: textFile('frames.txt', 'frame text'),
      parsers,
      log,
    })).resolves.toBe(wasmRigData);

    expect(parsers.parseRigsText).not.toHaveBeenCalled();
    expect(parsers.parseFramesText).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('does not parse when either optional rig file is missing', async () => {
    const parsers = createParsers();

    await expect(loadOptionalRigData({
      rigsFile: textFile('rigs.txt', 'rig text'),
      parsers,
    })).resolves.toBeUndefined();

    expect(parsers.parseRigsText).not.toHaveBeenCalled();
    expect(parsers.parseFramesText).not.toHaveBeenCalled();
  });

  it('parses text rig and frame files', async () => {
    const rigData = createRigData();
    const parsers = createParsers(rigData);
    const log = vi.fn();

    await expect(loadOptionalRigData({
      rigsFile: textFile('rigs.txt', 'rig text'),
      framesFile: textFile('frames.txt', 'frame text'),
      parsers,
      log,
    })).resolves.toEqual(rigData);

    expect(parsers.parseRigsText).toHaveBeenCalledWith('rig text');
    expect(parsers.parseFramesText).toHaveBeenCalledWith('frame text');
    expect(log).toHaveBeenCalledWith('Loaded rig data: 1 rigs, 1 frames');
  });

  it('parses binary rig and frame files', async () => {
    const rigData = createRigData();
    const parsers = createParsers(rigData);
    const log = vi.fn();

    await expect(loadOptionalRigData({
      rigsFile: binaryFile('rigs.bin', 'rig bytes'),
      framesFile: binaryFile('frames.bin', 'frame bytes'),
      parsers,
      log,
    })).resolves.toEqual(rigData);

    expect(vi.mocked(parsers.parseRigsBinary).mock.calls[0][0].byteLength).toBeGreaterThan(0);
    expect(vi.mocked(parsers.parseFramesBinary).mock.calls[0][0].byteLength).toBeGreaterThan(0);
  });

  it('warns and returns no rig data when parsing fails', async () => {
    const error = new Error('bad rig file');
    const parsers = createParsers();
    vi.mocked(parsers.parseRigsText).mockImplementation(() => {
      throw error;
    });
    const warn = vi.fn();

    await expect(loadOptionalRigData({
      rigsFile: textFile('rigs.txt', 'bad'),
      framesFile: textFile('frames.txt', 'frame text'),
      parsers,
      warn,
    })).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith('Failed to parse rig/frame files:', error);
  });
});
