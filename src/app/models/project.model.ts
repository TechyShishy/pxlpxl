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
  triangularShift?: number,
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
      bufferWidth = Math.max(bufferWidth, triangularRowWidth(r, triangularA, dNum, dDen, triangularShift ?? 0));
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
  triangularShift?: number,
): number {
  if (gridType === 'triangular' && triangularA !== undefined) {
    const { dNum, dDen } = resolveTriangularD(triangularD, triangularDNum, triangularDDen);
    return triangularCumPixels(height, triangularA, dNum, dDen, triangularShift ?? 0);
  }
  const { bufferWidth, bufferHeight } = computeBufferDimensions(
    width, height, gridType, triangularA, triangularD, triangularDNum, triangularDDen, triangularShift,
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
 * Count how many of the first `count` deltas in the rotated canonical array are negative.
 *
 * The canonical delta array for slow-growth triangular grids has:
 *   - (dDen-1) positive deltas at positions [0, dDen-2]
 *   - D = (dDen-dNum) negative deltas at positions [dDen-1, n-1]  (n = L-1)
 * After rotating left by `rotateBy`, the negative block lands at
 * [(rotateBy + negStart) mod n, ...]. We count how many of the positions
 * 0..count-1 fall in that range.
 */
function triangularNegDeltaCount(
  rotateBy: number,
  count: number,
  negStart: number,
  n: number,
): number {
  if (count <= 0) return 0;
  if (count >= n) return n - negStart; // full cycle — all D negatives appear
  const end = rotateBy + count - 1;
  if (end < n) {
    // No wrap
    return Math.max(0, end - Math.max(rotateBy, negStart) + 1);
  } else {
    // Wraps around 0
    const wrapEnd = end - n;
    const part1 = Math.max(0, (n - 1) - Math.max(rotateBy, negStart) + 1);
    const part2 = Math.max(0, wrapEnd - negStart + 1);
    return part1 + part2;
  }
}

/**
 * Compute the width (number of beads) of a given row in a triangular grid.
 *
 * - When dNum ≥ dDen (fast growth): simple Bresenham, `shift` is ignored.
 * - When dNum < dDen (slow growth): the cycle of L = 2·dDen − dNum rows
 *   has (dDen−1) +1 deltas and D = (dDen−dNum) −1 deltas. The `shift`
 *   parameter rotates where in the cycle the dip(s) occur:
 *     shift=0  dip(s) come first in the cycle  (rotateBy = dDen-1)
 *     shift=max  dip(s) come last  (rotateBy = 0, classic trailing-dip)
 *   shiftMax = dDen − 1.
 */
export function triangularRowWidth(
  row: number,
  a: number,
  dNum: number,
  dDen: number,
  shift = 0,
): number {
  if (dNum >= dDen) {
    // Fast growth: simple Bresenham, shift ignored
    return a + Math.floor(row * dNum / dDen);
  }
  const L = 2 * dDen - dNum;
  const k = Math.floor(row / L);
  const p = row % L;
  const base = a + dNum * k;
  if (p === 0) return base;

  const n = L - 1; // number of deltas per cycle
  const negStart = dDen - 1; // canonical start of negative-delta block
  const clampedShift = Math.min(Math.max(shift, 0), dDen - 1);
  const rotateBy = (dDen - 1 - clampedShift) % n;
  const negCount = triangularNegDeltaCount(rotateBy, p, negStart, n);
  return Math.max(0, base + p - 2 * negCount);
}

/**
 * Legacy row-width algorithm: within each cycle of L = 2·dDen − dNum rows,
 * widths alternate between `base` and `base+1` (interleaved +1/−1 delta pattern).
 * Used by old call sites; does NOT accept a shift parameter.
 */
export function triangularSlowRowWidth(row: number, a: number, dNum: number, dDen: number): number {
  const L = 2 * dDen - dNum;
  const k = Math.floor(row / L);
  const p = row % L;
  const base = a + dNum * k;
  return p === 0 ? base : base + (p % 2);
}

/**
 * Compute the total number of pixels in rows 0..y-1 for a triangular grid.
 * Uses hybrid closed-form (full cycles) + loop (remainder) approach.
 *
 * The per-cycle sum constant C = Σ_{p=0}^{L-1} offset(p, shift) is computed
 * in O(L) by iterating one cycle with the shift-aware formula.
 */
export function triangularCumPixels(
  y: number,
  a: number,
  dNum: number,
  dDen: number,
  shift = 0,
): number {
  if (y <= 0) return 0;

  if (dNum >= dDen) {
    // Fast growth: closed-form (shift ignored)
    let sum = 0;
    for (let r = 0; r < y; r++) {
      sum += a + Math.floor(r * dNum / dDen);
    }
    return sum;
  }

  // Slow growth: use full-cycle acceleration + remainder loop.
  // Iterate one cycle to compute C = per-cycle width sum (with clamping).
  const L = 2 * dDen - dNum;
  const B = Math.floor(y / L);
  const rem = y % L;

  let C = 0;
  for (let p = 0; p < L; p++) {
    C += triangularRowWidth(p, a, dNum, dDen, shift); // k=0 so base=a
  }
  // C above is for base=a. For cycle k, base=a+dNum*k, so sum = C + L*dNum*k.
  // Σ_{k=0}^{B-1} [C + L*dNum*k] = B*C + L*dNum*B*(B-1)/2
  const fullSum = B * C + L * dNum * B * (B - 1) / 2;

  // Remaining rows at base = a + dNum*B
  let remSum = 0;
  for (let p = 0; p < rem; p++) {
    remSum += triangularRowWidth(p + B * L, a, dNum, dDen, shift);
  }
  return fullSum + remSum;
}

/**
 * Legacy cum-pixel accumulator using the old interleaved row-width algorithm.
 * Used by old call sites; does NOT accept a shift parameter.
 */
export function triangularSlowCumPixels(y: number, a: number, dNum: number, dDen: number): number {
  if (y <= 0) return 0;
  const L = 2 * dDen - dNum;
  const B = Math.floor(y / L);
  const rem = y % L;

  // Sum over one full cycle at base = a + dNum*k:
  //   sum_p=0..L-1 of (base + (p%2)) = L*base + floor(L/2)
  // Across B complete cycles (k=0..B-1):
  //   Σ_k=0..B-1 [L*(a+dNum*k) + floor(L/2)]
  //   = L*B*a + L*dNum*(B*(B-1)/2) + B*floor(L/2)
  const halfL = Math.floor(L / 2);
  let total = L * B * a + L * dNum * ((B * (B - 1)) / 2) + B * halfL;

  // Remainder rows (k=B, base=a+dNum*B):
  const remBase = a + dNum * B;
  for (let p = 0; p < rem; p++) {
    total += p === 0 ? remBase : remBase + (p % 2);
  }
  return total;
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
  /** Phase shift (0..dDen-1) controlling where in the cycle the dip(s) occur. */
  triangularShift?: number;
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
  triangularShift?: number,
): Project {
  const pixelCount = computeBufferPixelCount(width, height, gridType, triangularA, triangularD, triangularDNum, triangularDDen, triangularShift);
  return {
    name,
    width,
    height,
    gridType,
    triangularA,
    triangularD,
    triangularDNum,
    triangularDDen,
    triangularShift,
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
