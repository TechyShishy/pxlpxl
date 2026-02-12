import { Injectable } from '@angular/core';
import { GridType, PixelCoord } from '../models';

/**
 * Utility service for grid-type-aware coordinate mapping and neighbor lookups.
 *
 * Row 0 is even (0-based indexing). Odd rows (1, 3, 5…) are shifted right by
 * half a bead in peyote grids. In peyote-odd, odd rows also have 1 fewer pixel.
 */
@Injectable({ providedIn: 'root' })
export class GridService {
  /** Whether a given row index is an odd row (shifted in peyote grids). */
  isOddRow(y: number): boolean {
    return y % 2 === 1;
  }

  /** Number of pixels in a given row, accounting for grid type. */
  rowWidth(y: number, baseWidth: number, gridType: GridType): number {
    if (gridType === 'peyote-odd' && this.isOddRow(y)) {
      return baseWidth - 1;
    }
    return baseWidth;
  }

  /** Whether a pixel coordinate is within the canvas bounds for the grid type. */
  isValidPixel(
    x: number,
    y: number,
    baseWidth: number,
    height: number,
    gridType: GridType,
  ): boolean {
    if (y < 0 || y >= height || x < 0) return false;
    return x < this.rowWidth(y, baseWidth, gridType);
  }

  /**
   * Convert a logical pixel coordinate to its top-left screen position
   * (before viewport pan/offset, but after scale).
   */
  pixelToScreen(
    x: number,
    y: number,
    scale: number,
    gridType: GridType,
  ): { sx: number; sy: number } {
    const offsetX = this.isPeyote(gridType) && this.isOddRow(y) ? scale / 2 : 0;
    return {
      sx: x * scale + offsetX,
      sy: y * scale,
    };
  }

  /**
   * Convert a screen-space position (relative to canvas origin, before viewport offset)
   * to the nearest logical pixel coordinate. Returns null if out of bounds.
   */
  screenToPixel(
    localX: number,
    localY: number,
    scale: number,
    baseWidth: number,
    height: number,
    gridType: GridType,
  ): PixelCoord | null {
    const y = Math.floor(localY / scale);
    if (y < 0 || y >= height) return null;

    let effectiveX = localX;
    if (this.isPeyote(gridType) && this.isOddRow(y)) {
      effectiveX -= scale / 2;
    }
    const x = Math.floor(effectiveX / scale);

    if (!this.isValidPixel(x, y, baseWidth, height, gridType)) return null;
    return { x, y };
  }

  /**
   * Return the valid neighbor coordinates for a pixel, accounting for grid type.
   *
   * Square: 4-connected (up, down, left, right).
   * Peyote: 6-connected (left, right, upper-left, upper-right, lower-left, lower-right).
   *
   * In a peyote grid, the diagonal neighbors depend on row parity:
   * - Even row (not shifted): upper-left = (x-1, y-1), upper-right = (x, y-1)
   * - Odd row (shifted right): upper-left = (x, y-1), upper-right = (x+1, y-1)
   * Same pattern applies to the row below.
   */
  getNeighbors(
    x: number,
    y: number,
    gridType: GridType,
    baseWidth: number,
    height: number,
  ): PixelCoord[] {
    const neighbors: PixelCoord[] = [];

    if (!this.isPeyote(gridType)) {
      // Square grid: 4-connected
      const candidates: PixelCoord[] = [
        { x: x - 1, y },
        { x: x + 1, y },
        { x, y: y - 1 },
        { x, y: y + 1 },
      ];
      for (const c of candidates) {
        if (this.isValidPixel(c.x, c.y, baseWidth, height, gridType)) {
          neighbors.push(c);
        }
      }
      return neighbors;
    }

    // Peyote grid: 6-connected
    // Left and right on the same row
    const candidates: PixelCoord[] = [
      { x: x - 1, y },
      { x: x + 1, y },
    ];

    if (this.isOddRow(y)) {
      // Current row is odd (shifted right)
      // Neighbors in the row above (even, not shifted):
      candidates.push({ x, y: y - 1 }); // upper-left
      candidates.push({ x: x + 1, y: y - 1 }); // upper-right
      // Neighbors in the row below (even, not shifted):
      candidates.push({ x, y: y + 1 }); // lower-left
      candidates.push({ x: x + 1, y: y + 1 }); // lower-right
    } else {
      // Current row is even (not shifted)
      // Neighbors in the row above (odd, shifted right):
      candidates.push({ x: x - 1, y: y - 1 }); // upper-left
      candidates.push({ x, y: y - 1 }); // upper-right
      // Neighbors in the row below (odd, shifted right):
      candidates.push({ x: x - 1, y: y + 1 }); // lower-left
      candidates.push({ x, y: y + 1 }); // lower-right
    }

    for (const c of candidates) {
      if (this.isValidPixel(c.x, c.y, baseWidth, height, gridType)) {
        neighbors.push(c);
      }
    }
    return neighbors;
  }

  /** Convert a screen-space point to the nearest logical pixel (for shape tool mapping). */
  visualToLogical(
    visualX: number,
    visualY: number,
    scale: number,
    baseWidth: number,
    height: number,
    gridType: GridType,
  ): PixelCoord | null {
    return this.screenToPixel(visualX, visualY, scale, baseWidth, height, gridType);
  }

  /** Whether the grid type is any peyote variant. */
  isPeyote(gridType: GridType): boolean {
    return gridType === 'peyote-even' || gridType === 'peyote-odd';
  }
}
