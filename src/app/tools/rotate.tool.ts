import { Tool, ToolType, ToolContext, ToolResult, pixelOffset } from '../models';

const TWO_PI = 2 * Math.PI;
const HALF_PI = Math.PI / 2;

/**
 * Rotate tool — rotates the active layer's pixel data by dragging.
 *
 * Strategy:
 * - onPointerDown: snapshot the layer buffer and record the start angle
 *   (angle from canvas center to pointer-down position, in buffer space).
 * - onPointerMove: compute the angle swept from the start angle, apply
 *   nearest-neighbour rotation from the snapshot into layerData for live
 *   preview. If ctx.shiftKey, snap to the nearest 90° increment. Returns null.
 * - onPointerUp: apply the final rotation; canvas-viewport builds the
 *   LayerCommand (before/after snapshot) for undo/redo.
 *
 * Pixels rotated outside the canvas bounds are clipped to transparent.
 * Canvas dimensions do not change. Works across all grid types
 * (nearest-neighbour on the raw buffer — best-effort for non-square grids).
 */
export class RotateTool implements Tool {
  readonly type = ToolType.Rotate;
  readonly icon = 'rotate_right';
  readonly label = 'Rotate';
  readonly cursor = 'crosshair';

  private startAngle: number | null = null;
  private originalData: Uint8ClampedArray | null = null;

  /**
   * Returns the snapshot taken at pointer-down so the canvas-viewport
   * can build a LayerCommand (before/after). Null if no drag is in progress.
   */
  getOriginalData(): Uint8ClampedArray | null {
    return this.originalData;
  }

  /** Called by canvas-viewport after it has consumed getOriginalData(). */
  resetSnapshot(): void {
    this.originalData = null;
    this.startAngle = null;
  }

  onPointerDown(ctx: ToolContext, layerData: Uint8ClampedArray): ToolResult | null {
    this.originalData = new Uint8ClampedArray(layerData);
    const cx = (ctx.canvasWidth - 1) / 2;
    const cy = (ctx.canvasHeight - 1) / 2;
    this.startAngle = Math.atan2(ctx.coord.y - cy, ctx.coord.x - cx);
    return null;
  }

  onPointerMove(ctx: ToolContext, layerData: Uint8ClampedArray): ToolResult | null {
    if (this.startAngle === null || !this.originalData) return null;
    const theta = this.computeTheta(ctx);
    this.applyRotation(theta, ctx, layerData);
    return null;
  }

  onPointerUp(ctx: ToolContext, layerData: Uint8ClampedArray): ToolResult | null {
    if (this.startAngle === null || !this.originalData) return null;
    const theta = this.computeTheta(ctx);
    this.applyRotation(theta, ctx, layerData);
    // Keep originalData alive — canvas-viewport reads it to build LayerCommand.
    // Reset startAngle so a stale coord can't re-trigger rotation.
    this.startAngle = null;
    return null;
  }

  // ---------------------------------------------------------------------------

  /** Angle swept from start to current pointer position, optionally snapped. */
  computeTheta(ctx: ToolContext): number {
    const cx = (ctx.canvasWidth - 1) / 2;
    const cy = (ctx.canvasHeight - 1) / 2;
    const currentAngle = Math.atan2(ctx.coord.y - cy, ctx.coord.x - cx);
    let theta = currentAngle - this.startAngle!;
    // Normalise to (-π, π]
    while (theta > Math.PI) theta -= TWO_PI;
    while (theta <= -Math.PI) theta += TWO_PI;
    if (ctx.shiftKey) {
      theta = Math.round(theta / HALF_PI) * HALF_PI;
    }
    return theta;
  }

  applyRotation(
    theta: number,
    ctx: ToolContext,
    layerData: Uint8ClampedArray,
  ): void {
    if (!this.originalData) return;

    const width = ctx.canvasWidth;
    const height = ctx.canvasHeight;
    const src = this.originalData;
    const cx = (width - 1) / 2;
    const cy = (height - 1) / 2;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    // Clear the destination buffer to transparent.
    layerData.fill(0);

    for (let dstY = 0; dstY < height; dstY++) {
      for (let dstX = 0; dstX < width; dstX++) {
        // Translate to centre, apply inverse rotation, translate back.
        // Inverse of a rotation by θ is a rotation by -θ:
        //   srcX = (dstX-cx)*cos(θ) + (dstY-cy)*sin(θ) + cx
        //   srcY = -(dstX-cx)*sin(θ) + (dstY-cy)*cos(θ) + cy
        const dx = dstX - cx;
        const dy = dstY - cy;
        const srcXf = dx * cosT + dy * sinT + cx;
        const srcYf = -dx * sinT + dy * cosT + cy;
        const srcX = Math.round(srcXf);
        const srcY = Math.round(srcYf);
        if (srcX < 0 || srcX >= width || srcY < 0 || srcY >= height) continue;
        const srcOff = pixelOffset(srcX, srcY, width);
        const dstOff = pixelOffset(dstX, dstY, width);
        layerData[dstOff] = src[srcOff];
        layerData[dstOff + 1] = src[srcOff + 1];
        layerData[dstOff + 2] = src[srcOff + 2];
        layerData[dstOff + 3] = src[srcOff + 3];
      }
    }
  }
}
