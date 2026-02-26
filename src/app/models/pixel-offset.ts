import { GridType, triangularCumPixels, resolveTriangularD } from './project.model';

/**
 * Compute the byte offset into a layer's Uint8ClampedArray for pixel (x, y).
 *
 * For square and peyote grids: standard row-major `(y * bufferWidth + x) * 4`.
 * For triangular grids: uses cumulative pixel count formula with dNum/dDen.
 *
 * This centralizes the ~20 inline offset calculations throughout the codebase.
 */
export function pixelOffset(
  x: number,
  y: number,
  bufferWidth: number,
  gridType?: GridType,
  triangularA?: number,
  triangularD?: number,
  triangularDNum?: number,
  triangularDDen?: number,
  triangularShift?: number,
): number {
  if (gridType === 'triangular' && triangularA !== undefined) {
    const { dNum, dDen } = resolveTriangularD(triangularD, triangularDNum, triangularDDen);
    return (triangularCumPixels(y, triangularA, dNum, dDen, triangularShift ?? 0) + x) * 4;
  }
  return (y * bufferWidth + x) * 4;
}
