import { Color } from './color.model';
import { GridType } from './project.model';

// ── .pxl file format (version 1) ──────────────────────────────────────

export const PXL_FORMAT_VERSION = 1;

export interface PxlFile {
  version: number;
  name: string;
  width: number;
  height: number;
  gridType: GridType;
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

export type HistoryEntryType = 'draw' | 'fill' | 'layer' | 'duplicate-layer';

export interface SerializedHistoryEntry {
  type: HistoryEntryType;
  description: string;
  layerIndex: number;
  canvasWidth: number;
  /** For 'draw' and 'fill' commands */
  modifiedPixels?: SerializedModifiedPixel[];
  /** For 'layer' commands — base64-encoded Uint8ClampedArray */
  previousData?: string;
  /** For 'layer' commands — base64-encoded Uint8ClampedArray */
  newData?: string;
  /** For 'duplicate-layer' commands */
  insertIndex?: number;
  /** For 'duplicate-layer' commands — the full layer snapshot */
  duplicatedLayer?: PxlLayer;
}

export interface SerializedModifiedPixel {
  coord: { x: number; y: number };
  oldColor: Color;
  newColor: Color;
}

// ── base64 helpers ────────────────────────────────────────────────────

export function uint8ArrayToBase64(data: Uint8ClampedArray): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

export function base64ToUint8Array(b64: string): Uint8ClampedArray {
  const binary = atob(b64);
  const bytes = new Uint8ClampedArray(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
