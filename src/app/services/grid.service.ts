import { Injectable } from '@angular/core';
import { BeadSize, GridType, PixelCoord, triangularRowWidth, resolveTriangularD } from '../models';

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
    triangularDNum?: number,
    triangularDDen?: number,
    triangularShift?: number,
  ): boolean {
    if (by < 0 || by >= bufferHeight) return false;

    if (gridType === 'triangular' && triangularA !== undefined) {
      const { dNum, dDen } = resolveTriangularD(triangularD, triangularDNum, triangularDDen);
      const rowWidth = triangularRowWidth(by, triangularA, dNum, dDen, triangularShift ?? 0);
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
    beadSize: BeadSize,
    gridType: GridType,
    triangularA?: number,
    triangularD?: number,
    totalRows?: number,
    triangularDNum?: number,
    triangularDDen?: number,
    triangularShift?: number,
  ): { sx: number; sy: number } {
    if (gridType === 'triangular' && triangularA !== undefined && totalRows !== undefined) {
      const { dNum, dDen } = resolveTriangularD(triangularD, triangularDNum, triangularDDen);
      const shift = triangularShift ?? 0;
      const maxWidth = this.getTriangularMaxWidth(totalRows, triangularA, dNum, dDen, shift);
      const rowWidth = triangularRowWidth(by, triangularA, dNum, dDen, shift);

      if (this.usesPeyoteStagger(gridType, triangularD ?? 1, triangularDNum, triangularDDen)) {
        // Peyote-style: 2-stride spacing + half-row interleaving
        const centerOffset = maxWidth - rowWidth;
        const sx = (centerOffset + bx * 2) * beadSize.width;
        const sy = by * (beadSize.height / 2);
        return { sx, sy };
      }
      // Even effective d: uniform layout, no gaps.
      const centerOffset = (maxWidth - rowWidth) / 2;
      const sx = (centerOffset + bx) * beadSize.width;
      return { sx, sy: by * beadSize.height };
    }

    if (gridType !== 'peyote') {
      return { sx: bx * beadSize.width, sy: by * beadSize.height };
    }
    const { col, beadRow } = this.bufferToVisual(bx, by);
    const isOddCol = col % 2 === 1;
    const offsetY = isOddCol ? beadSize.height / 2 : 0;
    return {
      sx: col * beadSize.width,
      sy: beadRow * beadSize.height + offsetY,
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
    beadSize: BeadSize,
    bufferWidth: number,
    bufferHeight: number,
    gridType: GridType,
    visualColumns?: number,
    triangularA?: number,
    triangularD?: number,
    triangularDNum?: number,
    triangularDDen?: number,
    triangularShift?: number,
  ): PixelCoord | null {
    if (gridType === 'triangular' && triangularA !== undefined) {
      const { dNum, dDen } = resolveTriangularD(triangularD, triangularDNum, triangularDDen);
      return this.screenToPixelTriangular(
        localX, localY, beadSize, bufferHeight, triangularA, dNum, dDen, triangularShift ?? 0,
      );
    }

    if (gridType !== 'peyote') {
      const x = Math.floor(localX / beadSize.width);
      const y = Math.floor(localY / beadSize.height);
      if (x < 0 || x >= bufferWidth || y < 0 || y >= bufferHeight) return null;
      return { x, y };
    }

    const visCols = visualColumns ?? bufferWidth * 2;
    const col = Math.floor(localX / beadSize.width);
    if (col < 0 || col >= visCols) return null;

    const isOddCol = col % 2 === 1;
    let effectiveY = localY;
    if (isOddCol) {
      effectiveY -= beadSize.height / 2;
    }
    const beadRow = Math.floor(effectiveY / beadSize.height);
    const beadsPerCol = bufferHeight / 2;
    if (beadRow < 0 || beadRow >= beadsPerCol) return null;

    const { bx, by } = this.visualToBuffer(col, beadRow);
    if (!this.isValidPixel(bx, by, bufferWidth, bufferHeight, gridType, visCols)) return null;
    return { x: bx, y: by };
  }

  /**
   * screenToPixel implementation for triangular grids (unified).
   * Uses dNum/dDen fractional growth. Dispatches to peyote-style or
   * square-style layout based on usesPeyoteStagger.
   */
  private screenToPixelTriangular(
    localX: number,
    localY: number,
    beadSize: BeadSize,
    totalRows: number,
    a: number,
    dNum: number,
    dDen: number,
    shift = 0,
  ): PixelCoord | null {
    const maxWidth = this.getTriangularMaxWidth(totalRows, a, dNum, dDen, shift);
    const effectiveD = Math.floor(dNum / dDen);
    const usePeyote = dNum < dDen || effectiveD % 2 !== 0;

    if (!usePeyote) {
      // Even effective d: square-style uniform row height
      const by = Math.floor(localY / beadSize.height);
      if (by < 0 || by >= totalRows) return null;
      const rowWidth = triangularRowWidth(by, a, dNum, dDen, shift);
      const centerOffset = (maxWidth - rowWidth) / 2;
      const bx = Math.floor(localX / beadSize.width - centerOffset);
      if (bx < 0 || bx >= rowWidth) return null;
      return { x: bx, y: by };
    }

    // Peyote-style half-row interleaving with 2-stride pixel spacing.
    const rowSpacing = beadSize.height / 2;
    const minRow = Math.max(0, Math.ceil((localY - beadSize.height) / rowSpacing));
    const maxRowCandidate = Math.min(totalRows - 1, Math.floor(localY / rowSpacing));

    for (let candidate = minRow; candidate <= maxRowCandidate; candidate++) {
      const rowY = candidate * rowSpacing;
      if (localY >= rowY && localY < rowY + beadSize.height) {
        const rowWidth = triangularRowWidth(candidate, a, dNum, dDen, shift);
        const centerOffset = maxWidth - rowWidth;
        const relativeCol = Math.floor(localX / beadSize.width) - centerOffset;
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
    triangularDNum?: number,
    triangularDDen?: number,
    triangularShift?: number,
  ): PixelCoord[] {
    const neighbors: PixelCoord[] = [];

    if (gridType === 'triangular' && triangularA !== undefined) {
      const { dNum, dDen } = resolveTriangularD(triangularD, triangularDNum, triangularDDen);
      return this.getNeighborsTriangular(bx, by, triangularA, dNum, dDen, bufferHeight, triangularShift ?? 0);
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
   * getNeighbors implementation for triangular grids (unified).
   *
   * Uses peyote stagger rule to decide between 4-connected and 6-connected.
   * - Peyote stagger (6-connected): ±1 row diagonals and ±2 row same-gridCol.
   * - No stagger (4-connected): left, right, one above, one below.
   */
  private getNeighborsTriangular(
    bx: number,
    by: number,
    a: number,
    dNum: number,
    dDen: number,
    totalRows: number,
    shift = 0,
  ): PixelCoord[] {
    const neighbors: PixelCoord[] = [];
    const usePeyote = this.usesPeyoteStagger('triangular', 0, dNum, dDen);

    if (usePeyote) {
      // 6-connected: use visual-space center offsets
      const w = triangularRowWidth(by, a, dNum, dDen, shift);
      const maxWidth = this.getTriangularMaxWidth(totalRows, a, dNum, dDen, shift);
      const co = maxWidth - w; // center offset for current row

      // ±1 rows: visual x of bx is co + 2*bx, neighbor at co_n + 2*nbx = co + 2*bx ± 1
      for (const dy of [-1, 1]) {
        const ny = by + dy;
        if (ny < 0 || ny >= totalRows) continue;
        const nw = triangularRowWidth(ny, a, dNum, dDen, shift);
        const nco = maxWidth - nw;
        for (const dx of [-1, 1]) {
          const num = (co - nco) + 2 * bx + dx;
          if (num % 2 !== 0) continue;
          const nbx = num / 2;
          if (nbx >= 0 && nbx < nw) {
            neighbors.push({ x: nbx, y: ny });
          }
        }
      }

      // ±2 rows: same visual x → nbx = bx + (nw - w) / 2
      for (const dy of [-2, 2]) {
        const ny = by + dy;
        if (ny < 0 || ny >= totalRows) continue;
        const nw = triangularRowWidth(ny, a, dNum, dDen, shift);
        const dw = nw - w;
        if (dw % 2 !== 0) continue;
        const nbx = bx + dw / 2;
        if (nbx >= 0 && nbx < nw) {
          neighbors.push({ x: nbx, y: ny });
        }
      }
    } else {
      // 4-connected with centering shift (even effective d)
      const rowWidth = triangularRowWidth(by, a, dNum, dDen, shift);
      const effectiveD = Math.floor(dNum / dDen);

      const isValid = (x: number, y: number): boolean => {
        if (y < 0 || y >= totalRows) return false;
        const rw = triangularRowWidth(y, a, dNum, dDen, shift);
        return x >= 0 && x < rw;
      };

      if (bx - 1 >= 0) neighbors.push({ x: bx - 1, y: by });
      if (bx + 1 < rowWidth) neighbors.push({ x: bx + 1, y: by });

      if (by > 0) {
        const aboveX = bx - effectiveD / 2;
        if (isValid(aboveX, by - 1)) neighbors.push({ x: aboveX, y: by - 1 });
      }

      if (by < totalRows - 1) {
        const belowX = bx + effectiveD / 2;
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

  /** Whether the grid type is any triangular variant (now just 'triangular'). */
  isAnyTriangular(gridType: GridType): boolean {
    return gridType === 'triangular';
  }

  /** Compute the width (number of pixels) of a given row in a triangular grid. */
  getTriangularRowWidth(row: number, a: number, dNum: number, dDen: number): number {
    return triangularRowWidth(row, a, dNum, dDen);
  }

  /**
   * Compute the row width for any triangular variant.
   * Unified — always uses fractional dNum/dDen formula.
   */
  getAnyTriangularRowWidth(row: number, gridType: GridType, a: number, d: number, dNum?: number, dDen?: number, shift?: number): number {
    const resolved = resolveTriangularD(d, dNum, dDen);
    return triangularRowWidth(row, a, resolved.dNum, resolved.dDen, shift ?? 0);
  }

  /**
   * Compute the max row width across all rows for any triangular variant.
   */
  getAnyTriangularMaxWidth(totalRows: number, gridType: GridType, a: number, d: number, dNum?: number, dDen?: number, shift?: number): number {
    const resolved = resolveTriangularD(d, dNum, dDen);
    return this.getTriangularMaxWidth(totalRows, a, resolved.dNum, resolved.dDen, shift ?? 0);
  }

  /**
   * Compute the max row width for a triangular grid given resolved dNum/dDen.
   */
  private getTriangularMaxWidth(totalRows: number, a: number, dNum: number, dDen: number, shift = 0): number {
    if (totalRows <= 0) return a;
    let max = 0;
    for (let r = 0; r < totalRows; r++) {
      max = Math.max(max, triangularRowWidth(r, a, dNum, dDen, shift));
    }
    return max;
  }

  /**
   * Whether the given triangular grid uses peyote-style stagger (half-height rows, 2-stride).
   * - Effective d < 1 (dNum < dDen): always staggers.
   * - Effective d ≥ 1: staggers if floor(dNum/dDen) is odd.
   */
  usesPeyoteStagger(gridType: GridType, d: number, dNum?: number, dDen?: number): boolean {
    if (gridType !== 'triangular') return false;
    const resolved = resolveTriangularD(d, dNum, dDen);
    if (resolved.dNum < resolved.dDen) return true; // d < 1: always stagger
    const effectiveD = Math.floor(resolved.dNum / resolved.dDen);
    return effectiveD % 2 !== 0;
  }

}
