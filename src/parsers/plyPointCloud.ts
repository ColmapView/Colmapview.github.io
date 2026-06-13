import type { Point3D } from '../types/colmap';

export type PlyCloudKind = 'gaussian-splat' | 'point-cloud' | 'unknown';
export type PlyFormat = 'ascii' | 'binary_little_endian' | 'binary_big_endian';

interface ScalarPlyProperty {
  kind: 'scalar';
  name: string;
  type: string;
}

interface ListPlyProperty {
  kind: 'list';
  name: string;
  countType: string;
  itemType: string;
}

type PlyProperty = ScalarPlyProperty | ListPlyProperty;

interface PlyElement {
  name: string;
  count: number;
  properties: PlyProperty[];
}

interface PlyHeader {
  format: PlyFormat;
  headerByteLength: number;
  elements: PlyElement[];
}

const PLY_HEADER_READ_LIMIT_BYTES = 1024 * 1024;
const GAUSSIAN_PLY_PROPERTIES = [
  'x', 'y', 'z',
  'f_dc_0', 'f_dc_1', 'f_dc_2',
  'opacity',
  'scale_0', 'scale_1', 'scale_2',
  'rot_0', 'rot_1', 'rot_2', 'rot_3',
];
const POINT_POSITION_PROPERTIES = ['x', 'y', 'z'];
const COLOR_PROPERTY_SETS = [
  ['red', 'green', 'blue'],
  ['r', 'g', 'b'],
  ['diffuse_red', 'diffuse_green', 'diffuse_blue'],
];

export async function classifyPlyFile(file: File): Promise<PlyCloudKind> {
  if (!file.name.toLowerCase().endsWith('.ply')) {
    return 'unknown';
  }

  try {
    const header = parsePlyHeader(await readPlyHeaderText(file));
    return classifyPlyHeader(header);
  } catch {
    return 'unknown';
  }
}

export function classifyPlyHeaderText(text: string): PlyCloudKind {
  return classifyPlyHeader(parsePlyHeader(text));
}

export async function parsePointCloudPlyFile(file: File): Promise<Map<bigint, Point3D>> {
  return parsePointCloudPlyBuffer(await readBlobAsArrayBuffer(file));
}

export function parsePointCloudPlyBuffer(buffer: ArrayBuffer): Map<bigint, Point3D> {
  const headerText = decodePlyHeaderText(buffer);
  const header = parsePlyHeader(headerText);
  if (classifyPlyHeader(header) !== 'point-cloud') {
    throw new Error('PLY file does not contain a generic XYZ point cloud');
  }

  const vertexElement = getVertexElement(header);
  const propertyLookup = getPropertyLookup(vertexElement);
  const xIndex = requirePropertyIndex(propertyLookup, 'x');
  const yIndex = requirePropertyIndex(propertyLookup, 'y');
  const zIndex = requirePropertyIndex(propertyLookup, 'z');
  const colorIndices = getColorPropertyIndices(propertyLookup);

  return header.format === 'ascii'
    ? parseAsciiPointCloudPly(new TextDecoder('utf-8').decode(buffer), header, {
      xIndex,
      yIndex,
      zIndex,
      colorIndices,
    })
    : parseBinaryPointCloudPly(buffer, header, {
      xIndex,
      yIndex,
      zIndex,
      colorIndices,
    });
}

async function readPlyHeaderText(file: File): Promise<string> {
  const headerBlob = file.slice(0, Math.min(file.size, PLY_HEADER_READ_LIMIT_BYTES));
  return decodePlyHeaderText(await readBlobAsArrayBuffer(headerBlob));
}

function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }

  if (typeof FileReader !== 'function') {
    return Promise.reject(new Error('FileReader is unavailable'));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read PLY file'));
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
        return;
      }
      reject(new Error('Failed to read PLY file as an ArrayBuffer'));
    };
    reader.readAsArrayBuffer(blob);
  });
}

function decodePlyHeaderText(buffer: ArrayBuffer): string {
  const text = new TextDecoder('utf-8').decode(buffer);
  const match = /end_header(?:\r\n|\n|\r|$)/.exec(text);
  if (!match) {
    throw new Error('PLY header is missing end_header');
  }

  return text.slice(0, match.index + match[0].length);
}

function parsePlyHeader(text: string): PlyHeader {
  const lines = text.split(/\r\n|\n|\r/);
  if (lines[0]?.trim() !== 'ply') {
    throw new Error('PLY header must start with ply');
  }

  let format: PlyFormat | null = null;
  const elements: PlyElement[] = [];
  let currentElement: PlyElement | null = null;

  for (const rawLine of lines.slice(1)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('comment ') || line.startsWith('obj_info ')) {
      continue;
    }
    if (line === 'end_header') {
      break;
    }

    const parts = line.split(/\s+/);
    if (parts[0] === 'format') {
      if (!isPlyFormat(parts[1])) {
        throw new Error(`Unsupported PLY format: ${parts[1] ?? ''}`);
      }
      format = parts[1];
      continue;
    }

    if (parts[0] === 'element') {
      const count = Number(parts[2]);
      if (!parts[1] || !Number.isInteger(count) || count < 0) {
        throw new Error(`Invalid PLY element declaration: ${line}`);
      }
      currentElement = { name: parts[1], count, properties: [] };
      elements.push(currentElement);
      continue;
    }

    if (parts[0] === 'property' && currentElement) {
      if (parts[1] === 'list') {
        if (!parts[2] || !parts[3] || !parts[4]) {
          throw new Error(`Invalid PLY list property declaration: ${line}`);
        }
        currentElement.properties.push({
          kind: 'list',
          countType: parts[2].toLowerCase(),
          itemType: parts[3].toLowerCase(),
          name: parts[4].toLowerCase(),
        });
      } else {
        if (!parts[1] || !parts[2]) {
          throw new Error(`Invalid PLY property declaration: ${line}`);
        }
        currentElement.properties.push({
          kind: 'scalar',
          type: parts[1].toLowerCase(),
          name: parts[2].toLowerCase(),
        });
      }
    }
  }

  if (!format) {
    throw new Error('PLY header is missing format');
  }

  const headerByteLength = new TextEncoder().encode(text).byteLength;
  return { format, headerByteLength, elements };
}

function classifyPlyHeader(header: PlyHeader): PlyCloudKind {
  const vertexElement = getVertexElement(header);
  const propertyNames = new Set(vertexElement.properties.map((property) => property.name));
  if (GAUSSIAN_PLY_PROPERTIES.every((property) => propertyNames.has(property))) {
    return 'gaussian-splat';
  }

  return POINT_POSITION_PROPERTIES.every((property) => propertyNames.has(property))
    ? 'point-cloud'
    : 'unknown';
}

function parseAsciiPointCloudPly(
  text: string,
  header: PlyHeader,
  indices: {
    xIndex: number;
    yIndex: number;
    zIndex: number;
    colorIndices: [number, number, number] | null;
  }
): Map<bigint, Point3D> {
  const vertexElement = getVertexElement(header);
  const dataText = text.slice(header.headerByteLength);
  const lines = dataText.split(/\r\n|\n|\r/);
  const vertexStartLine = getAsciiElementStartLine(header, vertexElement.name);
  const points = new Map<bigint, Point3D>();

  for (let index = 0; index < vertexElement.count; index += 1) {
    const line = lines[vertexStartLine + index];
    if (line === undefined) {
      break;
    }
    const values = line.trim().split(/\s+/).map(Number);
    addPoint(points, index, values, indices);
  }

  return points;
}

function parseBinaryPointCloudPly(
  buffer: ArrayBuffer,
  header: PlyHeader,
  indices: {
    xIndex: number;
    yIndex: number;
    zIndex: number;
    colorIndices: [number, number, number] | null;
  }
): Map<bigint, Point3D> {
  const vertexElement = getVertexElement(header);
  const vertexOffset = getElementDataOffset(header, vertexElement.name);
  const rowLayout = getFixedScalarRowLayout(vertexElement);
  const view = new DataView(buffer, vertexOffset);
  const points = new Map<bigint, Point3D>();
  let offset = 0;
  const littleEndian = header.format === 'binary_little_endian';

  for (let index = 0; index < vertexElement.count; index += 1) {
    const values = rowLayout.properties.map((property) =>
      readScalar(view, offset + property.offset, property.type, littleEndian)
    );
    offset += rowLayout.byteLength;
    addPoint(points, index, values, indices);
  }

  return points;
}

function getVertexElement(header: PlyHeader): PlyElement {
  const vertexElement = header.elements.find((element) => element.name.toLowerCase() === 'vertex');
  if (!vertexElement) {
    throw new Error('PLY header is missing vertex element');
  }
  return vertexElement;
}

function getPropertyLookup(element: PlyElement): Map<string, number> {
  const lookup = new Map<string, number>();
  element.properties.forEach((property, index) => {
    lookup.set(property.name, index);
  });
  return lookup;
}

function requirePropertyIndex(lookup: Map<string, number>, name: string): number {
  const index = lookup.get(name);
  if (index === undefined) {
    throw new Error(`PLY vertex property ${name} is required`);
  }
  return index;
}

function getColorPropertyIndices(lookup: Map<string, number>): [number, number, number] | null {
  for (const names of COLOR_PROPERTY_SETS) {
    const indices = names.map((name) => lookup.get(name));
    if (indices.every((index) => index !== undefined)) {
      return indices as [number, number, number];
    }
  }

  return null;
}

function getElementDataOffset(header: PlyHeader, elementName: string): number {
  let offset = header.headerByteLength;
  for (const element of header.elements) {
    if (element.name === elementName) {
      return offset;
    }
    offset += getFixedScalarRowLayout(element).byteLength * element.count;
  }

  throw new Error(`PLY element not found: ${elementName}`);
}

function getAsciiElementStartLine(header: PlyHeader, elementName: string): number {
  let lineOffset = 0;
  for (const element of header.elements) {
    if (element.name === elementName) {
      return lineOffset;
    }
    lineOffset += element.count;
  }

  throw new Error(`PLY element not found: ${elementName}`);
}

function getFixedScalarRowLayout(element: PlyElement): {
  byteLength: number;
  properties: Array<{ type: string; offset: number }>;
} {
  let byteLength = 0;
  const properties: Array<{ type: string; offset: number }> = [];
  for (const property of element.properties) {
    if (property.kind !== 'scalar') {
      throw new Error(`PLY list property ${property.name} is not supported for point cloud parsing`);
    }
    const size = getScalarTypeSize(property.type);
    properties.push({ type: property.type, offset: byteLength });
    byteLength += size;
  }

  return { byteLength, properties };
}

function addPoint(
  points: Map<bigint, Point3D>,
  index: number,
  values: number[],
  indices: {
    xIndex: number;
    yIndex: number;
    zIndex: number;
    colorIndices: [number, number, number] | null;
  }
): void {
  const xyz: [number, number, number] = [
    values[indices.xIndex],
    values[indices.yIndex],
    values[indices.zIndex],
  ];
  if (!xyz.every(Number.isFinite)) {
    return;
  }

  const rgb: [number, number, number] = indices.colorIndices
    ? [
        normalizeColor(values[indices.colorIndices[0]]),
        normalizeColor(values[indices.colorIndices[1]]),
        normalizeColor(values[indices.colorIndices[2]]),
      ]
    : [255, 255, 255];
  const point3DId = BigInt(index + 1);
  points.set(point3DId, {
    point3DId,
    xyz,
    rgb,
    error: 0,
    track: [],
  });
}

function normalizeColor(value: number): number {
  if (!Number.isFinite(value)) {
    return 255;
  }

  const scaled = value >= 0 && value <= 1 ? value * 255 : value;
  return Math.max(0, Math.min(255, Math.round(scaled)));
}

function getScalarTypeSize(type: string): number {
  switch (type) {
    case 'char':
    case 'int8':
    case 'uchar':
    case 'uint8':
      return 1;
    case 'short':
    case 'int16':
    case 'ushort':
    case 'uint16':
      return 2;
    case 'int':
    case 'int32':
    case 'uint':
    case 'uint32':
    case 'float':
    case 'float32':
      return 4;
    case 'double':
    case 'float64':
      return 8;
    default:
      throw new Error(`Unsupported PLY scalar type: ${type}`);
  }
}

function readScalar(view: DataView, offset: number, type: string, littleEndian: boolean): number {
  switch (type) {
    case 'char':
    case 'int8':
      return view.getInt8(offset);
    case 'uchar':
    case 'uint8':
      return view.getUint8(offset);
    case 'short':
    case 'int16':
      return view.getInt16(offset, littleEndian);
    case 'ushort':
    case 'uint16':
      return view.getUint16(offset, littleEndian);
    case 'int':
    case 'int32':
      return view.getInt32(offset, littleEndian);
    case 'uint':
    case 'uint32':
      return view.getUint32(offset, littleEndian);
    case 'float':
    case 'float32':
      return view.getFloat32(offset, littleEndian);
    case 'double':
    case 'float64':
      return view.getFloat64(offset, littleEndian);
    default:
      throw new Error(`Unsupported PLY scalar type: ${type}`);
  }
}

function isPlyFormat(value: string | undefined): value is PlyFormat {
  return value === 'ascii' ||
    value === 'binary_little_endian' ||
    value === 'binary_big_endian';
}
