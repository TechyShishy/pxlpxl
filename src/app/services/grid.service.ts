import { Injectable } from '@angular/core';
import { GridType, PixelCoord } from '../models';

/**
 * Utility service for grid-type-aware coordinate mapping and neighbor lookups.
 *
 * Column 0 is even (0-based indexing). Odd columns (1, 3, 5…) are shifted down by
 * half a bead in peyote grids. In peyote-odd, odd columns also have 1 fewer pixel.
 */
@Injectable({ providedIn: 'root' })
export class GridService {
  /** Whether a given column index is an odd column (shifted in peyote grids). */
  isOddColumn(x: number): boolean {
    return x % 2 === 1;
  }

  /** Number of pixels in a given column, accounting for grid type. */
  colHeight(x: number, baseHeight: number, gridType: GridType): number {
    if (gridType === 'peyote-odd' && this.isOddColumn(x)) {
      return baseHeight - 1;
    }
    return baseHeight;
  }

  /** Whether a pixel coordinate is within the canvas bounds for the grid type. */
  isValidPixel(
    x: number,
    y: number,
    baseWidth: number,
    height: number,
    gridType: GridType,
  ): boolean {
    if (x < 0 || x >= baseWidth || y < 0) return false;
    return y < this.colHeight(x, height, gridType);
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
    const offsetY = this.isPeyote(gridType) && this.isOddColumn(x) ? scale / 2 : 0;
    return {
      sx: x * scale,
      sy: y * scale + offsetY,
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
    const x = Math.floor(localX / scale);
    if (x < 0 || x >= baseWidth) return null;

    let effectiveY = localY;
    if (this.isPeyote(gridType) && this.isOddColumn(x)) {
      effectiveY -= scale / 2;
    }
    const y = Math.floor(effectiveY / scale);

    if (!this.isValidPixel(x, y, baseWidth, height, gridType)) return null;
    return { x, y };
  }

  /**
   * Return the valid neighbor coordinates for a pixel, accounting for grid type.
   *
   * Square: 4-connected (up, down, left, right).
   * Peyote: 6-connected (up, down, upper-left, lower-left, upper-right, lower-right).
   *
   * In a peyote grid, the diagonal neighbors depend on column parity:
   * - Even column (not shifted): upper-left = (x-1, y-1), lower-left = (x-1, y)
   * - Odd column (shifted down): upper-left = (x-1, y), lower-left = (x-1, y+1)
   * Same pattern applies to the column to the right.
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
    // Up and down in the same column
    const candidates: PixelCoord[] = [
      { x, y: y - 1 },
      { x, y: y + 1 },
    ];

    if (this.isOddColumn(x)) {
      // Current column is odd (shifted down by half a bead)
      // Neighbors in the column to the left (even, not shifted):
      candidates.push({ x: x - 1, y }); // upper-left
      candidates.push({ x: x - 1, y: y + 1 }); // lower-left
      // Neighbors in the column to the right (even, not shifted):
      candidates.push({ x: x + 1, y }); // upper-right
      candidates.push({ x: x + 1, y: y + 1 }); // lower-right
    } else {
      // Current column is even (not shifted)
      // Neighbors in the column to the left (odd, shifted down):
      candidates.push({ x: x - 1, y: y - 1 }); // upper-left
      candidates.push({ x: x - 1, y }); // lower-left
      // Neighbors in the column to the right (odd, shifted down):
      candidates.push({ x: x + 1, y: y - 1 }); // upper-right
      candidates.push({ x: x + 1, y }); // lower-right
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
