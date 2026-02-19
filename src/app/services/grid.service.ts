import { Injectable } from '@angular/core';
import { GridType, PixelCoord } from '../models';

/**
 * Utility service for grid-type-aware coordinate mapping and neighbor lookups.
 *
 * In peyote mode, the data buffer uses a dense row-based layout:
 *   - Buffer width  = ceil(visualColumns / 2)
 *   - Buffer height = beadsPerColumn * 2
 *   - Even buffer rows (0, 2, 4…) hold beads from even visual columns (0, 2, 4…)
 *   - Odd  buffer rows (1, 3, 5…) hold beads from odd  visual columns (1, 3, 5…)
 *
 * Visual column parity determines the half-bead offset:
 *   odd visual columns are shifted down by half a bead on screen.
 */
@Injectable({ providedIn: 'root' })
export class GridService {
  // ── Visual ↔ Buffer coordinate conversions ────────────────────────

  /**
   * Convert a buffer coordinate (bx, by) to the visual column and bead-row index.
   * Even buffer rows → even visual columns; odd buffer rows → odd visual columns.
   */
  bufferToVisual(bx: number, by: number): { col: number; beadRow: number } {
    const isOddRow = by % 2 === 1;
    return {
      col: isOddRow ? bx * 2 + 1 : bx * 2,
      beadRow: Math.floor(by / 2),
    };
  }

  /**
   * Convert a visual column and bead-row index to buffer coordinates.
   */
  visualToBuffer(col: number, beadRow: number): { bx: number; by: number } {
    const isOddCol = col % 2 === 1;
    return {
      bx: Math.floor(col / 2),
      by: beadRow * 2 + (isOddCol ? 1 : 0),
    };
  }

  // ── Validity ──────────────────────────────────────────────────────

  /**
   * Whether a buffer coordinate is valid.
   * For peyote, also checks that the buffer position maps to a real visual column
   * (handles the case where visualColumns is odd and the last slot in odd rows is unused).
   */
  isValidPixel(
    bx: number,
    by: number,
    bufferWidth: number,
    bufferHeight: number,
    gridType: GridType,
    visualColumns?: number,
  ): boolean {
    if (bx < 0 || bx >= bufferWidth || by < 0 || by >= bufferHeight) return false;
    if (gridType === 'peyote' && visualColumns !== undefined) {
      const { col } = this.bufferToVisual(bx, by);
      if (col >= visualColumns) return false;
    }
    return true;
  }

  // ── Pixel ↔ Screen coordinate mapping ─────────────────────────────

  /**
   * Convert a buffer coordinate to its top-left screen position
   * (before viewport pan/offset, but after scale).
   *
   * For square grids: sx = bx * scale, sy = by * scale.
   * For peyote grids: maps buffer → visual, then visual → screen with
   * a half-bead Y offset on odd visual columns.
   */
  pixelToScreen(
    bx: number,
    by: number,
    scale: number,
    gridType: GridType,
  ): { sx: number; sy: number } {
    if (gridType !== 'peyote') {
      return { sx: bx * scale, sy: by * scale };
    }
    const { col, beadRow } = this.bufferToVisual(bx, by);
    const isOddCol = col % 2 === 1;
    const offsetY = isOddCol ? scale / 2 : 0;
    return {
      sx: col * scale,
      sy: beadRow * scale + offsetY,
    };
  }

  /**
   * Convert a screen-space position (relative to canvas origin, before viewport offset)
   * to the nearest buffer coordinate. Returns null if out of bounds.
   *
   * For square grids: standard floor division.
   * For peyote grids: determines the visual column from screen X, applies the
   * peyote half-bead offset to screen Y, computes the bead row, then converts
   * visual → buffer.
   */
  screenToPixel(
    localX: number,
    localY: number,
    scale: number,
    bufferWidth: number,
    bufferHeight: number,
    gridType: GridType,
    visualColumns?: number,
  ): PixelCoord | null {
    if (gridType !== 'peyote') {
      const x = Math.floor(localX / scale);
      const y = Math.floor(localY / scale);
      if (x < 0 || x >= bufferWidth || y < 0 || y >= bufferHeight) return null;
      return { x, y };
    }

    const visCols = visualColumns ?? bufferWidth * 2;
    const col = Math.floor(localX / scale);
    if (col < 0 || col >= visCols) return null;

    const isOddCol = col % 2 === 1;
    let effectiveY = localY;
    if (isOddCol) {
      effectiveY -= scale / 2;
    }
    const beadRow = Math.floor(effectiveY / scale);
    const beadsPerCol = bufferHeight / 2;
    if (beadRow < 0 || beadRow >= beadsPerCol) return null;

    const { bx, by } = this.visualToBuffer(col, beadRow);
    if (!this.isValidPixel(bx, by, bufferWidth, bufferHeight, gridType, visCols)) return null;
    return { x: bx, y: by };
  }

  // ── Neighbor lookups ──────────────────────────────────────────────

  /**
   * Return the valid neighbor buffer coordinates for a pixel, accounting for grid type.
   *
   * Square: 4-connected (up, down, left, right).
   * Peyote: 6-connected (up, down, upper-left, lower-left, upper-right, lower-right).
   *
   * For peyote, operates in visual space then converts back to buffer coords.
   */
  getNeighbors(
    bx: number,
    by: number,
    gridType: GridType,
    bufferWidth: number,
    bufferHeight: number,
    visualColumns?: number,
  ): PixelCoord[] {
    const neighbors: PixelCoord[] = [];

    if (gridType !== 'peyote') {
      // Square grid: 4-connected
      const candidates: PixelCoord[] = [
        { x: bx - 1, y: by },
        { x: bx + 1, y: by },
        { x: bx, y: by - 1 },
        { x: bx, y: by + 1 },
      ];
      for (const c of candidates) {
        if (this.isValidPixel(c.x, c.y, bufferWidth, bufferHeight, gridType)) {
          neighbors.push(c);
        }
      }
      return neighbors;
    }

    // Peyote grid: work in visual space
    const visCols = visualColumns ?? bufferWidth * 2;
    const { col, beadRow } = this.bufferToVisual(bx, by);
    const isOddCol = col % 2 === 1;

    // Up and down in the same visual column
    const visualCandidates: { col: number; beadRow: number }[] = [
      { col, beadRow: beadRow - 1 },
      { col, beadRow: beadRow + 1 },
    ];

    if (isOddCol) {
      // Odd column (shifted down): neighbors in adjacent even columns
      visualCandidates.push({ col: col - 1, beadRow }); // upper-left
      visualCandidates.push({ col: col - 1, beadRow: beadRow + 1 }); // lower-left
      visualCandidates.push({ col: col + 1, beadRow }); // upper-right
      visualCandidates.push({ col: col + 1, beadRow: beadRow + 1 }); // lower-right
    } else {
      // Even column (not shifted): neighbors in adjacent odd columns
      visualCandidates.push({ col: col - 1, beadRow: beadRow - 1 }); // upper-left
      visualCandidates.push({ col: col - 1, beadRow }); // lower-left
      visualCandidates.push({ col: col + 1, beadRow: beadRow - 1 }); // upper-right
      visualCandidates.push({ col: col + 1, beadRow }); // lower-right
    }

    const beadsPerCol = bufferHeight / 2;
    for (const vc of visualCandidates) {
      if (vc.col < 0 || vc.col >= visCols) continue;
      if (vc.beadRow < 0 || vc.beadRow >= beadsPerCol) continue;
      const { bx: nbx, by: nby } = this.visualToBuffer(vc.col, vc.beadRow);
      if (this.isValidPixel(nbx, nby, bufferWidth, bufferHeight, gridType, visCols)) {
        neighbors.push({ x: nbx, y: nby });
      }
    }
    return neighbors;
  }

  // ── Utility ───────────────────────────────────────────────────────

  /** Whether the grid type is peyote. */
  isPeyote(gridType: GridType): boolean {
    return gridType === 'peyote';
  }
}
