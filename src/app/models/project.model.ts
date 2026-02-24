import { Color, DEFAULT_PALETTE } from './color.model';
import { Layer } from './layer.model';
import { SerializedHistoryEntry } from './pxl-file.model';

export type GridType = 'square' | 'peyote' | 'triangular';

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
  triangularA?: number,
  triangularD?: number,
  triangularDNum?: number,
  triangularDDen?: number,
): { bufferWidth: number; bufferHeight: number } {
  if (gridType === 'peyote') {
    return {
      bufferWidth: Math.ceil(width / 2),
      bufferHeight: height,
    };
  }
  if (gridType === 'triangular' && triangularA !== undefined) {
    const { dNum, dDen } = resolveTriangularD(triangularD, triangularDNum, triangularDDen);
    let bufferWidth = 0;
    for (let r = 0; r < height; r++) {
      bufferWidth = Math.max(bufferWidth, triangularRowWidth(r, triangularA, dNum, dDen));
    }
    return { bufferWidth, bufferHeight: height };
  }
  return { bufferWidth: width, bufferHeight: height };
}

/**
 * Compute the total number of pixels for buffer allocation.
 *
 * For square and peyote grids: bufferWidth × bufferHeight.
 * For triangular grids: sum of row widths = R·a + d·R·(R−1)/2.
 */
export function computeBufferPixelCount(
  width: number,
  height: number,
  gridType: GridType,
  triangularA?: number,
  triangularD?: number,
  triangularDNum?: number,
  triangularDDen?: number,
): number {
  if (gridType === 'triangular' && triangularA !== undefined) {
    const { dNum, dDen } = resolveTriangularD(triangularD, triangularDNum, triangularDDen);
    return triangularCumPixels(height, triangularA, dNum, dDen);
  }
  const { bufferWidth, bufferHeight } = computeBufferDimensions(
    width, height, gridType, triangularA, triangularD, triangularDNum, triangularDDen,
  );
  return bufferWidth * bufferHeight;
}

// ── Triangular helpers ─────────────────────────────────────────────────

/**
 * Resolve fractional d parameters for triangular grids.
 *
 * New projects use explicit dNum/dDen. Legacy projects store a single integer d,
 * which is interpreted as dNum = d, dDen = 1 (fast growth) by default.
 */
export function resolveTriangularD(
  triangularD?: number,
  triangularDNum?: number,
  triangularDDen?: number,
): { dNum: number; dDen: number } {
  if (triangularDNum !== undefined && triangularDDen !== undefined) {
    return { dNum: triangularDNum, dDen: triangularDDen };
  }
  const d = triangularD ?? 2;
  return { dNum: d, dDen: 1 };
}

/**
 * Legacy alias — resolves fractional d for old triangular-slow projects
 * where a bare integer d means dNum=1, dDen=d.
 */
export function resolveTriangularSlowD(
  triangularD?: number,
  triangularDNum?: number,
  triangularDDen?: number,
): { dNum: number; dDen: number } {
  if (triangularDNum !== undefined && triangularDDen !== undefined) {
    return { dNum: triangularDNum, dDen: triangularDDen };
  }
  const d = triangularD ?? 2;
  return { dNum: 1, dDen: d };
}

/**
 * Compute the width (number of beads) of a given row in a triangular grid.
 *
 * This is the universal formula for all triangular grids:
 * - When dNum ≥ dDen (fast growth): simple Bresenham, monotonically wider each row.
 * - When dNum < dDen (slow growth): Bresenham-distributed fractional rate with
 *   alternating high/bump pattern within each cycle of L = 2·dDen − dNum rows.
 */
export function triangularRowWidth(row: number, a: number, dNum: number, dDen: number): number {
  if (dNum >= dDen) {
    // Fast growth: simple Bresenham, no dips
    return a + Math.floor(row * dNum / dDen);
  }
  const L = 2 * dDen - dNum;
  const k = Math.floor(row / L);
  const p = row % L;
  const dipRegionSize = 2 * (dDen - dNum);
  const base = a + dNum * k;
  if (p < dipRegionSize) {
    if (p % 2 === 0) {
      // High position in dip region
      const j = p / 2;
      return base + Math.floor(j * dNum / dDen);
    } else {
      // Bump position
      const i = (p - 1) / 2;
      return base + Math.floor((i + 1) * dNum / dDen) + 1;
    }
  } else {
    // Remaining high positions (no dips left in cycle)
    const j = (dDen - dNum) + (p - dipRegionSize);
    return base + Math.floor(j * dNum / dDen);
  }
}

/** Legacy alias for triangularRowWidth — used by old call sites during migration. */
export function triangularSlowRowWidth(row: number, a: number, dNum: number, dDen: number): number {
  return triangularRowWidth(row, a, dNum, dDen);
}

/**
 * Compute the total number of pixels in rows 0..y-1 for a triangular grid.
 * Uses hybrid closed-form (full cycles) + loop (remainder) approach.
 */
export function triangularCumPixels(y: number, a: number, dNum: number, dDen: number): number {
  if (y <= 0) return 0;

  if (dNum >= dDen) {
    // Fast growth: iterate
    let sum = 0;
    for (let r = 0; r < y; r++) {
      sum += a + Math.floor(r * dNum / dDen);
    }
    return sum;
  }

  const L = 2 * dDen - dNum;
  const B = Math.floor(y / L);
  const rem = y % L;

  // F = Σ_{j=0}^{dDen-1} floor(j·dNum/dDen) — sum of Bresenham increments for high positions
  let F = 0;
  for (let j = 0; j < dDen; j++) {
    F += Math.floor(j * dNum / dDen);
  }
  // G = Σ_{j=1}^{dDen-dNum} floor(j·dNum/dDen) — sum of dip-position Bresenham values
  let G = 0;
  for (let j = 1; j <= dDen - dNum; j++) {
    G += Math.floor(j * dNum / dDen);
  }
  const C = F + G + (dDen - dNum);

  // Full cycles: Σ_{k=0}^{B-1} [L·(a + dNum·k) + C]
  const fullSum = L * B * a + L * dNum * B * (B - 1) / 2 + B * C;

  // Remaining rows: iterate the partial cycle
  let remSum = 0;
  const remStart = B * L;
  for (let p = 0; p < rem; p++) {
    remSum += triangularRowWidth(remStart + p, a, dNum, dDen);
  }

  return fullSum + remSum;
}

/** Legacy alias for triangularCumPixels — used by old call sites during migration. */
export function triangularSlowCumPixels(y: number, a: number, dNum: number, dDen: number): number {
  return triangularCumPixels(y, a, dNum, dDen);
}

export interface Project {
  id?: number;
  name: string;
  width: number;
  height: number;
  gridType: GridType;
  /** First-row width for triangular grids. */
  triangularA?: number;
  /** Per-row growth for triangular grids (integer, used by regular triangular and as legacy fallback for triangular-slow). */
  triangularD?: number;
  /** Fractional growth numerator for triangular grids (dNum increases per dDen rows). */
  triangularDNum?: number;
  /** Fractional growth denominator for triangular grids (dNum increases per dDen rows). */
  triangularDDen?: number;
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
  triangularA?: number,
  triangularD?: number,
  triangularDNum?: number,
  triangularDDen?: number,
): Project {
  const pixelCount = computeBufferPixelCount(width, height, gridType, triangularA, triangularD, triangularDNum, triangularDDen);
  return {
    name,
    width,
    height,
    gridType,
    triangularA,
    triangularD,
    triangularDNum,
    triangularDDen,
    layers: [
      {
        id: crypto.randomUUID(),
        name: 'Layer 1',
        visible: true,
        opacity: 1,
        data: Array.from(new Uint8ClampedArray(pixelCount * 4)),
      },
    ],
    palette: [...DEFAULT_PALETTE],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
