import { GridType } from './project.model';

/**
 * Compute the byte offset into a layer's Uint8ClampedArray for pixel (x, y).
 *
 * For square and peyote grids: standard row-major `(y * bufferWidth + x) * 4`.
 * For triangular grids with parameters `a` (first-row width) and `d` (per-row growth):
 *   offset = (a * y + d * y * (y - 1) / 2 + x) * 4
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
): number {
  if (gridType === 'triangular' && triangularA !== undefined && triangularD !== undefined) {
    return (triangularA * y + triangularD * y * (y - 1) / 2 + x) * 4;
  }
  return (y * bufferWidth + x) * 4;
}
