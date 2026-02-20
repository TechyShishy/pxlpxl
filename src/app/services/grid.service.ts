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
 *
 * In triangular mode, the buffer is packed. Row r has (a + d·r) pixels.
 * The buffer offset for pixel (x, y) is (a·y + d·y·(y−1)/2 + x) × 4.
 * Visual display is an isosceles triangle:
 *   - Even d → square-style cells, 4-connected neighbors
 *   - Odd d  → peyote-style cells with half-row stagger, 6-connected neighbors
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
   * For peyote, also checks that the buffer position maps to a real visual column.
   * For triangular, checks that x is within the row width (a + d·y).
   */
  isValidPixel(
    bx: number,
    by: number,
    bufferWidth: number,
    bufferHeight: number,
    gridType: GridType,
    visualColumns?: number,
    triangularA?: number,
    triangularD?: number,
  ): boolean {
    if (by < 0 || by >= bufferHeight) return false;

    if (gridType === 'triangular' && triangularA !== undefined && triangularD !== undefined) {
      const rowWidth = triangularA + triangularD * by;
      return bx >= 0 && bx < rowWidth;
    }

    if (bx < 0 || bx >= bufferWidth) return false;
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
   * For triangular grids: centers each row horizontally within the max-width
   * bounding box, with peyote-style vertical stagger for odd d.
   * Odd d uses 2-stride spacing (pixel + gap) so the horizontal shift
   * between adjacent rows is a whole pixel, not half a pixel.
   */
  pixelToScreen(
    bx: number,
    by: number,
    scale: number,
    gridType: GridType,
    triangularA?: number,
    triangularD?: number,
    totalRows?: number,
  ): { sx: number; sy: number } {
    if (gridType === 'triangular' && triangularA !== undefined && triangularD !== undefined && totalRows !== undefined) {
      const maxWidth = triangularA + triangularD * Math.max(0, totalRows - 1);
      const rowWidth = triangularA + triangularD * by;
      if (triangularD % 2 !== 0) {
        // Odd d: peyote-style layout with whole-pixel horizontal shift.
        // Pixels have stride 2 (pixel + gap) and rows use half-scale Y.
        const centerOffset = maxWidth - rowWidth;
        const sx = (centerOffset + bx * 2) * scale;
        const sy = by * (scale / 2);
        return { sx, sy };
      }
      // Even d: uniform layout, no gaps.
      const centerOffset = (maxWidth - rowWidth) / 2;
      const sx = (centerOffset + bx) * scale;
      return { sx, sy: by * scale };
    }

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
   * For triangular grids: determines row from screen Y, then checks if the click
   * falls within the centered row of pixels. For odd d, rows overlap vertically
   * due to peyote-style half-row interleaving, so multiple candidate rows are checked.
   */
  screenToPixel(
    localX: number,
    localY: number,
    scale: number,
    bufferWidth: number,
    bufferHeight: number,
    gridType: GridType,
    visualColumns?: number,
    triangularA?: number,
    triangularD?: number,
  ): PixelCoord | null {
    if (gridType === 'triangular' && triangularA !== undefined && triangularD !== undefined) {
      return this.screenToPixelTriangular(
        localX, localY, scale, bufferHeight, triangularA, triangularD,
      );
    }

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

  /**
   * screenToPixel implementation for triangular grids.
   */
  private screenToPixelTriangular(
    localX: number,
    localY: number,
    scale: number,
    totalRows: number,
    a: number,
    d: number,
  ): PixelCoord | null {
    const maxWidth = a + d * Math.max(0, totalRows - 1);

    if (d % 2 === 0) {
      // Even d: square-style uniform row height
      const by = Math.floor(localY / scale);
      if (by < 0 || by >= totalRows) return null;
      const rowWidth = a + d * by;
      const centerOffset = (maxWidth - rowWidth) / 2;
      const bx = Math.floor(localX / scale - centerOffset);
      if (bx < 0 || bx >= rowWidth) return null;
      return { x: bx, y: by };
    }

    // Odd d: peyote-style half-row interleaving with 2-stride pixel spacing.
    // Each row is placed at y = row * (scale / 2) and occupies [y, y + scale).
    // Pixels within a row sit at stride-2 positions (pixel + gap).
    // A click in a gap returns null.
    const rowSpacing = scale / 2;
    const minRow = Math.max(0, Math.ceil((localY - scale) / rowSpacing));
    const maxRow = Math.min(totalRows - 1, Math.floor(localY / rowSpacing));

    for (let candidate = minRow; candidate <= maxRow; candidate++) {
      const rowY = candidate * rowSpacing;
      if (localY >= rowY && localY < rowY + scale) {
        const rowWidth = a + d * candidate;
        const centerOffset = maxWidth - rowWidth;
        const relativeCol = Math.floor(localX / scale) - centerOffset;
        if (relativeCol < 0 || relativeCol % 2 !== 0) continue;
        const bx = relativeCol / 2;
        if (bx < rowWidth) {
          return { x: bx, y: candidate };
        }
      }
    }
    return null;
  }

  // ── Neighbor lookups ──────────────────────────────────────────────

  /**
   * Return the valid neighbor buffer coordinates for a pixel, accounting for grid type.
   *
   * Square: 4-connected (up, down, left, right).
   * Peyote: 6-connected (up, down, upper-left, lower-left, upper-right, lower-right).
   * Triangular (even d): 4-connected with centering shift between rows.
   * Triangular (odd d): 6-connected via 2-stride layout — ±1 row diagonals
   *   and ±2 row same-column (no same-row neighbors).
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
    triangularA?: number,
    triangularD?: number,
  ): PixelCoord[] {
    const neighbors: PixelCoord[] = [];

    if (gridType === 'triangular' && triangularA !== undefined && triangularD !== undefined) {
      return this.getNeighborsTriangular(bx, by, triangularA, triangularD, bufferHeight);
    }

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

  /**
   * getNeighbors implementation for triangular grids.
   *
   * Each row has `a + d * row` pixels, centered. Moving between rows shifts
   * the x-coordinate by d/2 due to centering.
   *
   * Even d → 4-connected: left, right, one above (x - d/2), one below (x + d/2).
   * Odd d → 6-connected with 2-stride layout: no same-row neighbors.
   *   Instead: ±1 row diagonals (gridCol ± 1) and ±2 rows (same gridCol).
   *   Formulas derived from gridCol = centerOffset + bx*2 where
   *   centerOffset = maxWidth - rowWidth.
   */
  private getNeighborsTriangular(
    bx: number,
    by: number,
    a: number,
    d: number,
    totalRows: number,
  ): PixelCoord[] {
    const neighbors: PixelCoord[] = [];
    const rowWidth = a + d * by;

    const isValid = (x: number, y: number): boolean => {
      if (y < 0 || y >= totalRows) return false;
      const rw = a + d * y;
      return x >= 0 && x < rw;
    };

    if (d % 2 !== 0) {
      // Odd d: 2-stride layout. Neighbors are at gridCol ± 1 (±1 row)
      // and same gridCol (±2 rows). No same-row neighbors.

      // 1 row above: bx' = (2*bx ∓ 1 - d) / 2
      if (by > 0) {
        const leftAbove = (2 * bx - 1 - d) / 2;
        const rightAbove = (2 * bx + 1 - d) / 2;
        if (isValid(leftAbove, by - 1)) neighbors.push({ x: leftAbove, y: by - 1 });
        if (isValid(rightAbove, by - 1)) neighbors.push({ x: rightAbove, y: by - 1 });
      }

      // 1 row below: bx' = (2*bx ∓ 1 + d) / 2
      if (by < totalRows - 1) {
        const leftBelow = (2 * bx - 1 + d) / 2;
        const rightBelow = (2 * bx + 1 + d) / 2;
        if (isValid(leftBelow, by + 1)) neighbors.push({ x: leftBelow, y: by + 1 });
        if (isValid(rightBelow, by + 1)) neighbors.push({ x: rightBelow, y: by + 1 });
      }

      // 2 rows above: same gridCol → bx' = bx - d
      if (by >= 2) {
        const above2 = bx - d;
        if (isValid(above2, by - 2)) neighbors.push({ x: above2, y: by - 2 });
      }

      // 2 rows below: same gridCol → bx' = bx + d
      if (by < totalRows - 2) {
        const below2 = bx + d;
        if (isValid(below2, by + 2)) neighbors.push({ x: below2, y: by + 2 });
      }
    } else {
      // Even d: 4-connected. Same-row left/right + one above + one below.
      if (bx - 1 >= 0) neighbors.push({ x: bx - 1, y: by });
      if (bx + 1 < rowWidth) neighbors.push({ x: bx + 1, y: by });

      if (by > 0) {
        const aboveX = bx - d / 2;
        if (isValid(aboveX, by - 1)) neighbors.push({ x: aboveX, y: by - 1 });
      }

      if (by < totalRows - 1) {
        const belowX = bx + d / 2;
        if (isValid(belowX, by + 1)) neighbors.push({ x: belowX, y: by + 1 });
      }
    }

    return neighbors;
  }

  // ── Utility ───────────────────────────────────────────────────────

  /** Whether the grid type is peyote. */
  isPeyote(gridType: GridType): boolean {
    return gridType === 'peyote';
  }

  /** Whether the grid type is triangular. */
  isTriangular(gridType: GridType): boolean {
    return gridType === 'triangular';
  }

  /** Compute the width (number of pixels) of a given row in a triangular grid. */
  triangularRowWidth(row: number, a: number, d: number): number {
    return a + d * row;
  }
}
