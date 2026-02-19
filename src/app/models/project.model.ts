import { Color, DEFAULT_PALETTE } from './color.model';
import { Layer } from './layer.model';
import { SerializedHistoryEntry } from './pxl-file.model';

export type GridType = 'square' | 'peyote';

/**
 * Compute the buffer dimensions for a given set of visual dimensions and grid type.
 *
 * For square grids, the buffer dimensions match the visual dimensions.
 * For peyote grids, width (visual columns) and height (visible bead rows) are
 * re-packed into a dense row-based layout:
 *   bufferWidth  = ceil(visualColumns / 2)
 *   bufferHeight = height (= number of visible bead rows)
 *
 * In the buffer, even rows hold even-visual-column beads and odd rows hold odd-
 * visual-column beads.  beadsPerColumn = ceil(height / 2) for even columns and
 * floor(height / 2) for odd columns.
 *
 * The user-facing "height" value corresponds to the number of visible horizontal
 * bead rows (counting both even-column and odd-column rows), so entering 32×32
 * in the new-project dialog produces a 32-column × 32-visible-row peyote grid.
 */
export function computeBufferDimensions(
  width: number,
  height: number,
  gridType: GridType,
): { bufferWidth: number; bufferHeight: number } {
  if (gridType === 'peyote') {
    return {
      bufferWidth: Math.ceil(width / 2),
      bufferHeight: height,
    };
  }
  return { bufferWidth: width, bufferHeight: height };
}

export interface Project {
  id?: number;
  name: string;
  width: number;
  height: number;
  gridType: GridType;
  layers: SerializedLayer[];
  palette: Color[];
  /** Serialized undo/redo history (optional for backward compatibility) */
  history?: {
    undoStack: SerializedHistoryEntry[];
    redoStack: SerializedHistoryEntry[];
  };
  createdAt: Date;
  updatedAt: Date;
}

/** Layer with data stored as a plain array for IndexedDB serialization */
export interface SerializedLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  data: number[]; // Plain array for Dexie storage
}

export function serializeLayer(layer: Layer): SerializedLayer {
  return {
    id: layer.id,
    name: layer.name,
    visible: layer.visible,
    opacity: layer.opacity,
    data: Array.from(layer.data),
  };
}

export function deserializeLayer(serialized: SerializedLayer): Layer {
  return {
    id: serialized.id,
    name: serialized.name,
    visible: serialized.visible,
    opacity: serialized.opacity,
    data: new Uint8ClampedArray(serialized.data),
  };
}

export function createDefaultProject(
  name: string,
  width: number,
  height: number,
  gridType: GridType = 'square',
): Project {
  const { bufferWidth, bufferHeight } = computeBufferDimensions(width, height, gridType);
  return {
    name,
    width,
    height,
    gridType,
    layers: [
      {
        id: crypto.randomUUID(),
        name: 'Layer 1',
        visible: true,
        opacity: 1,
        data: Array.from(new Uint8ClampedArray(bufferWidth * bufferHeight * 4)),
      },
    ],
    palette: [...DEFAULT_PALETTE],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
