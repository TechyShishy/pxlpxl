import { GridType, PixelCoord, triangularRowWidth, resolveTriangularD } from '../models';

/**
 * Convert a byte offset in a flat layer Uint8ClampedArray back to a pixel
 * coordinate (x, y) in buffer-space. This is the inverse of pixelOffset().
 *
 * For square and peyote grids: row-major layout, linearIndex = byteOffset / 4.
 * For triangular grids: variable-width rows — walks each row using
 * triangularRowWidth() until the containing row is found.
 *
 * `bufferHeight` bounds the row search for triangular grids and must match
 * the height used when the buffer was allocated.
 */
export function byteOffsetToPixelCoord(
  byteOffset: number,
  bufferWidth: number,
  gridType: GridType | undefined,
  bufferHeight: number,
  triangularA?: number,
  triangularD?: number,
  triangularDNum?: number,
  triangularDDen?: number,
  triangularShift?: number,
): PixelCoord {
  const linearIndex = byteOffset >> 2;

  if (gridType !== 'triangular' || triangularA === undefined) {
    return {
      x: linearIndex % bufferWidth,
      y: Math.floor(linearIndex / bufferWidth),
    };
  }

  const { dNum, dDen } = resolveTriangularD(triangularD, triangularDNum, triangularDDen);
  const shift = triangularShift ?? 0;

  let cumulative = 0;
  for (let row = 0; row < bufferHeight; row++) {
    const rowWidth = triangularRowWidth(row, triangularA, dNum, dDen, shift);
    if (linearIndex < cumulative + rowWidth) {
      return { x: linearIndex - cumulative, y: row };
    }
    cumulative += rowWidth;
  }

  throw new Error(`byteOffsetToPixelCoord: offset ${byteOffset} is out of bounds for bufferHeight ${bufferHeight}`);
}
