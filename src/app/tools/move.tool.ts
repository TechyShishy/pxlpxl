import { Tool, ToolType, ToolContext, ToolResult, PixelCoord } from '../models';

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
    this.applyShift(dx, dy, ctx.canvasWidth, ctx.canvasHeight, layerData);
    return null;
  }

  onPointerUp(ctx: ToolContext, layerData: Uint8ClampedArray): ToolResult | null {
    if (!this.startCoord || !this.originalData) return null;
    const dx = ctx.coord.x - this.startCoord.x;
    const dy = ctx.coord.y - this.startCoord.y;
    this.applyShift(dx, dy, ctx.canvasWidth, ctx.canvasHeight, layerData);
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
    width: number,
    height: number,
    layerData: Uint8ClampedArray,
  ): void {
    if (!this.originalData) return;

    // Restore the buffer from the snapshot first, then write the shifted version.
    // This approach avoids accumulated drift across multiple move events.
    const src = this.originalData;

    // Clear the destination buffer to transparent.
    layerData.fill(0);

    for (let y = 0; y < height; y++) {
      const srcY = y - dy;
      if (srcY < 0 || srcY >= height) continue;
      for (let x = 0; x < width; x++) {
        const srcX = x - dx;
        if (srcX < 0 || srcX >= width) continue;
        const srcOffset = (srcY * width + srcX) * 4;
        const dstOffset = (y * width + x) * 4;
        layerData[dstOffset] = src[srcOffset];
        layerData[dstOffset + 1] = src[srcOffset + 1];
        layerData[dstOffset + 2] = src[srcOffset + 2];
        layerData[dstOffset + 3] = src[srcOffset + 3];
      }
    }
  }
}
