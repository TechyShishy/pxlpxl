import { Tool, ToolType, ToolContext, ToolResult, PixelCoord, pixelOffset } from '../models';
import { GridService } from '../services/grid.service';

const gridService = new GridService();

/**
 * Move tool — shifts the active layer's pixel data by dragging.
 *
 * Strategy:
 * - onPointerDown: record start coord and snapshot the original layer buffer.
 * - onPointerMove: compute delta from start, restore from snapshot, write shifted
 *   pixels directly into layerData for immediate visual feedback. Returns null
 *   (no command yet — the canvas-viewport handles command creation on pointer-up).
 * - onPointerUp: apply the final shift, expose the before-snapshot via
 *   getOriginalData() for the canvas-viewport to build a LayerCommand, then reset.
 *
 * For peyote grids, the shift operates in visual space: buffer coords are converted
 * to visual (col, beadRow), the delta is applied in visual space, then converted
 * back to buffer coords. This ensures that visual shifts map correctly despite the
 * dense row-based buffer layout.
 *
 * Pixels shifted beyond the canvas boundary are clipped (transparent). No wrapping.
 */
export class MoveTool implements Tool {
  readonly type = ToolType.Move;
  readonly icon = 'open_with';
  readonly label = 'Move';
  readonly cursor = 'move';

  private startCoord: PixelCoord | null = null;
  private originalData: Uint8ClampedArray | null = null;

  /**
   * Returns the snapshot taken at pointer-down so the canvas-viewport
   * can build a LayerCommand (before/after). Null if no drag is in progress.
   */
  getOriginalData(): Uint8ClampedArray | null {
    return this.originalData;
  }

  onPointerDown(ctx: ToolContext, layerData: Uint8ClampedArray): ToolResult | null {
    this.startCoord = { ...ctx.coord };
    this.originalData = new Uint8ClampedArray(layerData);
    return null;
  }

  onPointerMove(ctx: ToolContext, layerData: Uint8ClampedArray): ToolResult | null {
    if (!this.startCoord || !this.originalData) return null;
    const dx = ctx.coord.x - this.startCoord.x;
    const dy = ctx.coord.y - this.startCoord.y;
    this.applyShift(dx, dy, ctx, layerData);
    return null;
  }

  onPointerUp(ctx: ToolContext, layerData: Uint8ClampedArray): ToolResult | null {
    if (!this.startCoord || !this.originalData) return null;
    const dx = ctx.coord.x - this.startCoord.x;
    const dy = ctx.coord.y - this.startCoord.y;
    this.applyShift(dx, dy, ctx, layerData);
    // Reset start coord but keep originalData alive so canvas-viewport can read it.
    this.startCoord = null;
    return null;
  }

  /** Called by canvas-viewport after it has consumed getOriginalData(). */
  resetSnapshot(): void {
    this.originalData = null;
  }

  // ---------------------------------------------------------------------------

  private applyShift(
    dx: number,
    dy: number,
    ctx: ToolContext,
    layerData: Uint8ClampedArray,
  ): void {
    if (!this.originalData) return;

    const width = ctx.canvasWidth;
    const height = ctx.canvasHeight;
    const src = this.originalData;

    // Clear the destination buffer to transparent.
    layerData.fill(0);

    if (!gridService.isPeyote(ctx.gridType) && !gridService.isTriangular(ctx.gridType)) {
      // Square grid: simple buffer-space shift
      for (let y = 0; y < height; y++) {
        const srcY = y - dy;
        if (srcY < 0 || srcY >= height) continue;
        for (let x = 0; x < width; x++) {
          const srcX = x - dx;
          if (srcX < 0 || srcX >= width) continue;
          const srcOff = pixelOffset(srcX, srcY, width);
          const dstOff = pixelOffset(x, y, width);
          layerData[dstOff] = src[srcOff];
          layerData[dstOff + 1] = src[srcOff + 1];
          layerData[dstOff + 2] = src[srcOff + 2];
          layerData[dstOff + 3] = src[srcOff + 3];
        }
      }
      return;
    }

    if (gridService.isTriangular(ctx.gridType)) {
      // Triangular grid: shift in buffer space, per-row bounds
      const a = ctx.triangularA ?? 1;
      const d = ctx.triangularD ?? 1;
      const totalRows = height;
      for (let y = 0; y < totalRows; y++) {
        const rowWidth = a + d * y;
        const srcY = y - dy;
        if (srcY < 0 || srcY >= totalRows) continue;
        const srcRowWidth = a + d * srcY;
        for (let x = 0; x < rowWidth; x++) {
          const srcX = x - dx;
          if (srcX < 0 || srcX >= srcRowWidth) continue;
          const srcOff = pixelOffset(srcX, srcY, width, 'triangular', a, d);
          const dstOff = pixelOffset(x, y, width, 'triangular', a, d);
          layerData[dstOff] = src[srcOff];
          layerData[dstOff + 1] = src[srcOff + 1];
          layerData[dstOff + 2] = src[srcOff + 2];
          layerData[dstOff + 3] = src[srcOff + 3];
        }
      }
      return;
    }

    // Peyote grid: shift in visual space
    // Convert buffer delta to visual delta
    const startVisual = gridService.bufferToVisual(0, 0);
    const endVisual = gridService.bufferToVisual(dx, dy);
    const visualDx = endVisual.col - startVisual.col;
    const visualDy = endVisual.beadRow - startVisual.beadRow;

    const visCols = ctx.visualColumns;
    const beadsPerCol = height / 2;

    for (let by = 0; by < height; by++) {
      for (let bx = 0; bx < width; bx++) {
        if (!gridService.isValidPixel(bx, by, width, height, ctx.gridType, visCols)) continue;

        // Convert destination buffer pos to visual
        const dstVisual = gridService.bufferToVisual(bx, by);

        // Compute the source visual pos by subtracting the visual delta
        const srcCol = dstVisual.col - visualDx;
        const srcBeadRow = dstVisual.beadRow - visualDy;

        if (srcCol < 0 || srcCol >= visCols) continue;
        if (srcBeadRow < 0 || srcBeadRow >= beadsPerCol) continue;

        // Convert source visual back to buffer
        const srcBuf = gridService.visualToBuffer(srcCol, srcBeadRow);
        if (!gridService.isValidPixel(srcBuf.bx, srcBuf.by, width, height, ctx.gridType, visCols)) continue;

        const srcOff = pixelOffset(srcBuf.bx, srcBuf.by, width);
        const dstOff = pixelOffset(bx, by, width);
        layerData[dstOff] = src[srcOff];
        layerData[dstOff + 1] = src[srcOff + 1];
        layerData[dstOff + 2] = src[srcOff + 2];
        layerData[dstOff + 3] = src[srcOff + 3];
      }
    }
  }
}
