import { z } from 'zod';
import { Color } from './color.model';
import { GridType } from './project.model';

// ── .pxl file format (version 1) ──────────────────────────────────────

export const PXL_FORMAT_VERSION = 2;

export interface PxlFile {
  version: number;
  name: string;
  width: number;
  height: number;
  gridType: GridType;
  /** First-row width for triangular grids. */
  triangularA?: number;
  /** Per-row growth for triangular grids. */
  triangularD?: number;
  /** Fractional growth numerator for triangular grids. */
  triangularDNum?: number;
  /** Fractional growth denominator for triangular grids. */
  triangularDDen?: number;
  /** Phase shift (0..dDen-1) for triangular grids. */
  triangularShift?: number;
  palette: Color[];
  layers: PxlLayer[];
  history?: PxlHistory;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

export interface PxlLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  data: string; // base64-encoded RGBA Uint8ClampedArray
}

export interface PxlHistory {
  undoStack: SerializedHistoryEntry[];
  redoStack: SerializedHistoryEntry[];
}

export type HistoryEntryType =
  | 'draw'
  | 'fill'
  | 'layer'
  | 'duplicate-layer'
  | 'move-layer'
  | 'replace-color'
  | 'move-palette'
  | 'sort-palette'
  | 'flatten-layer';

/** Common fields shared by all serialized history entries. */
interface SerializedHistoryEntryBase {
  description: string;
  layerIndex: number;
  canvasWidth: number;
}

/** Shared fields for pixel-based commands (draw, fill). */
interface SerializedPixelEntryFields extends SerializedHistoryEntryBase {
  gridType?: GridType;
  triangularA?: number;
  triangularD?: number;
  triangularDNum?: number;
  triangularDDen?: number;
  triangularShift?: number;
  modifiedPixels?: SerializedModifiedPixel[];
}

export interface SerializedDrawEntry extends SerializedPixelEntryFields {
  type: 'draw';
}

export interface SerializedFillEntry extends SerializedPixelEntryFields {
  type: 'fill';
}

export interface SerializedLayerEntry extends SerializedHistoryEntryBase {
  type: 'layer';
  previousData?: string;
  newData?: string;
}

export interface SerializedDuplicateLayerEntry extends SerializedHistoryEntryBase {
  type: 'duplicate-layer';
  insertIndex?: number;
  duplicatedLayer?: PxlLayer;
}

export interface SerializedMoveLayerEntry extends SerializedHistoryEntryBase {
  type: 'move-layer';
  fromIndex?: number;
  toIndex?: number;
}

export interface SerializedMovePaletteEntry extends SerializedHistoryEntryBase {
  type: 'move-palette';
  fromIndex?: number;
  toIndex?: number;
}

export interface SerializedSortPaletteEntry extends SerializedHistoryEntryBase {
  type: 'sort-palette';
  beforePalette?: Color[];
  afterPalette?: Color[];
}

export interface SerializedReplaceColorEntry extends SerializedHistoryEntryBase {
  type: 'replace-color';
  paletteIndex?: number;
  oldColor?: Color;
  newColor?: Color;
  affected?: Array<{ layerIndex: number; byteOffset: number }>;
}

export interface SerializedFlattenLayerEntry extends SerializedHistoryEntryBase {
  type: 'flatten-layer';
  sourceLayerSnapshot?: PxlLayer;
  previousAboveData?: string;
  previousAboveOpacity?: number;
  mergedData?: string;
  canvasHeight?: number;
}

/** Pixel-based commands that support triangular grid params. */
export type SerializedPixelEntry = SerializedDrawEntry | SerializedFillEntry;

/** Discriminated union of all serialized history entry types. */
export type SerializedHistoryEntry =
  | SerializedDrawEntry
  | SerializedFillEntry
  | SerializedLayerEntry
  | SerializedDuplicateLayerEntry
  | SerializedMoveLayerEntry
  | SerializedMovePaletteEntry
  | SerializedSortPaletteEntry
  | SerializedReplaceColorEntry
  | SerializedFlattenLayerEntry;

export interface SerializedModifiedPixel {
  coord: { x: number; y: number };
  oldColor: Color;
  newColor: Color;
}

// ── PxlFile zod schema (used for import dispatch) ───────────────────────

export const PxlFileSchema = z.object({
  version: z.number().int(),
  name: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  gridType: z.enum(['square', 'peyote', 'triangular', 'triangular-slow']),
  triangularA: z.number().int().positive().optional(),
  triangularD: z.number().int().nonnegative().optional(),
  triangularDNum: z.number().int().positive().optional(),
  triangularDDen: z.number().int().positive().optional(),
  triangularShift: z.number().int().nonnegative().optional(),
  palette: z.array(
    z.object({ r: z.number(), g: z.number(), b: z.number(), a: z.number() }),
  ),
  layers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      visible: z.boolean(),
      opacity: z.number(),
      data: z.string(),
    }),
  ),
  createdAt: z.string(),
  updatedAt: z.string(),
  history: z
    .object({
      undoStack: z.array(
        z.object({
          type: z.enum([
            'draw',
            'fill',
            'layer',
            'duplicate-layer',
            'move-layer',
            'replace-color',
            'move-palette',
            'sort-palette',
            'flatten-layer',
          ]),
          description: z.string(),
          layerIndex: z.number().int(),
          canvasWidth: z.number().int(),
        }).passthrough(),
      ),
      redoStack: z.array(
        z.object({
          type: z.enum([
            'draw',
            'fill',
            'layer',
            'duplicate-layer',
            'move-layer',
            'replace-color',
            'move-palette',
            'sort-palette',
            'flatten-layer',
          ]),
          description: z.string(),
          layerIndex: z.number().int(),
          canvasWidth: z.number().int(),
        }).passthrough(),
      ),
    })
    .optional(),
});

// ── base64 helpers ────────────────────────────────────────────────────

export function uint8ArrayToBase64(data: Uint8ClampedArray): string {
  // Process in chunks to avoid call-stack overflow with String.fromCharCode.apply
  const CHUNK = 8192;
  const parts: string[] = [];
  for (let i = 0; i < data.length; i += CHUNK) {
    parts.push(String.fromCharCode(...data.subarray(i, i + CHUNK)));
  }
  return btoa(parts.join(''));
}

export function base64ToUint8Array(b64: string): Uint8ClampedArray {
  let binary: string;
  try {
    binary = atob(b64);
  } catch {
    throw new Error('Invalid base64 data in project file');
  }
  const bytes = new Uint8ClampedArray(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
