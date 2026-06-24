/**
 * Add-on image-source strategy for the `image_mapping.csv` convention.
 *
 * Some pipelines rename images to sequential names (`0.jpg`, `1.jpg`, …) before
 * running COLMAP and ship a CSV mapping those names back to the original files,
 * e.g.:
 *
 *   colmap_id,colmap_image,raw_path
 *   0,0.jpg,raw/10.07.25 LHS/G0019585.JPG
 *
 * When such a CSV sits in the COLMAP model directory, this resolves each COLMAP
 * image name to its real path (relative to the dataset root). This handles both
 * the renaming and images split across multiple folders, which a single base
 * directory cannot. It is registered ahead of the core strategies, so its
 * per-image overrides take precedence over the base-directory heuristic.
 */

import { getBasename, getParentDir } from './colmapPathResolver';
import type { ImageResolveContext, ImageSourceStrategy } from './imageSourceResolution';

export const IMAGE_MAPPING_CSV_FILENAME = 'image_mapping.csv';
/** Header names that select the COLMAP image name and its real path. */
export const IMAGE_MAPPING_NAME_COLUMN = 'colmap_image';
export const IMAGE_MAPPING_PATH_COLUMN = 'raw_path';

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Tokenize CSV text into records of fields (RFC 4180). A quoted field may contain
 * commas, escaped quotes (`""`), and newlines; record separators are CRLF, LF, or
 * a lone CR. Quotes are resolved here; surrounding whitespace is left to the
 * caller. Field count per record is preserved, so columns can be matched by
 * header position regardless of order.
 */
function parseCsvRecords(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += ch;
        i += 1;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
    } else if (ch === ',') {
      row.push(field);
      field = '';
      i += 1;
    } else if (ch === '\r' || ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
    } else {
      field += ch;
      i += 1;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Parse an image-mapping CSV into a map of COLMAP image name -> dataset-relative
 * path, resolving columns by header (order-independent). Fields that contain a
 * comma, quote, or newline must be quoted per RFC 4180. Surrounding whitespace is
 * trimmed. Returns an empty map when the required headers are absent or there are
 * no data rows.
 */
export function parseImageMappingCsv(text: string): Record<string, string> {
  const map: Record<string, string> = {};
  const rows = parseCsvRecords(stripBom(text));
  if (rows.length < 2) {
    return map;
  }
  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  const nameIdx = header.indexOf(IMAGE_MAPPING_NAME_COLUMN);
  const pathIdx = header.indexOf(IMAGE_MAPPING_PATH_COLUMN);
  if (nameIdx === -1 || pathIdx === -1) {
    return map;
  }

  for (let i = 1; i < rows.length; i += 1) {
    const cells = rows[i];
    const name = (cells[nameIdx] ?? '').trim();
    const rawPath = (cells[pathIdx] ?? '').trim();
    if (name && rawPath) {
      map[name] = rawPath;
    }
  }
  return map;
}

export const imageMappingCsvStrategy: ImageSourceStrategy = {
  id: 'image-mapping-csv',
  async resolve(ctx: ImageResolveContext) {
    if (!ctx.fetchText) {
      return null;
    }
    // Prefer a mapping CSV in the model directory; fall back to any in the tree.
    const candidates = ctx.filePaths.filter(
      (path) => getBasename(path).toLowerCase() === IMAGE_MAPPING_CSV_FILENAME
    );
    const csvPath =
      candidates.find((path) => getParentDir(path) === ctx.modelDir) ?? candidates[0];
    if (!csvPath) {
      return null;
    }

    const text = await ctx.fetchText(csvPath);
    if (!text) {
      return null;
    }
    const imageNameToPath = parseImageMappingCsv(text);
    return Object.keys(imageNameToPath).length > 0
      ? { kind: 'per-image', imageNameToPath }
      : null;
  },
};
