import { Tool, ToolType, ToolContext, ToolResult, pixelOffset, triangularRowWidth } from '../models';

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

  /**
   * Programmatically rotate the layer by exactly 90° CW or CCW.
   * Intended for touch double/triple-tap gestures.
   * Returns the pre-rotation snapshot so the caller can build a LayerCommand.
   */
  rotate90(direction: 'cw' | 'ccw', ctx: ToolContext, layerData: Uint8ClampedArray): Uint8ClampedArray {
    // Refuse to run while a drag-rotate is in progress to avoid clobbering its snapshot.
    if (this.startAngle !== null) return new Uint8ClampedArray(layerData);
    this.originalData = new Uint8ClampedArray(layerData);
    const snapshot = this.originalData;
    const theta = direction === 'cw' ? Math.PI / 2 : -Math.PI / 2;
    this.applyRotation(theta, ctx, layerData);
    this.resetSnapshot();
    return snapshot;
  }

  onPointerDown(ctx: ToolContext, layerData: Uint8ClampedArray): ToolResult | null {
    this.originalData = new Uint8ClampedArray(layerData);
    const { vcx, vcy } = this.visualCenter(ctx);
    const { vx, vy } = this.toVisual(ctx.coord.x, ctx.coord.y, ctx);
    this.startAngle = Math.atan2(vy - vcy, vx - vcx);
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
    const { vcx, vcy } = this.visualCenter(ctx);
    const { vx, vy } = this.toVisual(ctx.coord.x, ctx.coord.y, ctx);
    const currentAngle = Math.atan2(vy - vcy, vx - vcx);
    let theta = currentAngle - this.startAngle!;
    // Normalise to (-π, π].
    // Both atan2 results are in [-π, π], so their difference is in (-2π, 2π) —
    // at most one correction is ever needed.
    if (theta > Math.PI) theta -= TWO_PI;
    if (theta <= -Math.PI) theta += TWO_PI;
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

    const {
      canvasWidth: width,
      canvasHeight: height,
      gridType,
      visualColumns,
      triangularA,
      triangularDNum,
      triangularDDen,
      triangularShift,
    } = ctx;
    const src = this.originalData;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const isTriangular = gridType === 'triangular' && triangularA !== undefined;
    const isPeyote = gridType === 'peyote';
    const dNum = triangularDNum ?? 1;
    const dDen = triangularDDen ?? 1;
    const shift = triangularShift ?? 0;

    const { vcx, vcy } = this.visualCenter(ctx);

    // Clear the destination buffer to transparent.
    layerData.fill(0);

    for (let dstY = 0; dstY < height; dstY++) {
      // For triangular grids each row has a variable number of pixels;
      // for square and peyote grids every row is `width` pixels wide.
      const dstRowWidth = isTriangular
        ? triangularRowWidth(dstY, triangularA!, dNum, dDen, shift)
        : width;

      for (let dstX = 0; dstX < dstRowWidth; dstX++) {
        let srcX: number;
        let srcY: number;

        if (isPeyote) {
          // Convert destination buffer coordinate to visual (col, beadRow).
          const vDstX = dstX * 2 + (dstY & 1);
          const vDstY = Math.floor(dstY / 2);

          // Translate to visual centre, apply inverse rotation, translate back.
          const dx = vDstX - vcx;
          const dy = vDstY - vcy;
          const vSrcXf = dx * cosT + dy * sinT + vcx;
          const vSrcYf = -dx * sinT + dy * cosT + vcy;

          // Nearest-neighbour: round to nearest visual bead position.
          const vSrcX = Math.round(vSrcXf);
          const vSrcY = Math.round(vSrcYf);

          // Convert visual source position back to buffer coordinates.
          srcX = Math.floor(vSrcX / 2);
          srcY = vSrcY * 2 + (vSrcX & 1);

          // Bounds check in visual and buffer space.
          if (vSrcX < 0 || vSrcX >= visualColumns || vSrcY < 0 || srcY < 0 || srcY >= height) continue;
          if (srcX < 0 || srcX >= width) continue;
        } else {
          // Translate to centre, apply inverse rotation, translate back.
          // Inverse of a rotation by θ is a rotation by -θ:
          //   srcX = (dstX-cx)*cos(θ) + (dstY-cy)*sin(θ) + cx
          //   srcY = -(dstX-cx)*sin(θ) + (dstY-cy)*cos(θ) + cy
          const dx = dstX - vcx;
          const dy = dstY - vcy;
          const srcXf = dx * cosT + dy * sinT + vcx;
          const srcYf = -dx * sinT + dy * cosT + vcy;
          srcX = Math.round(srcXf);
          srcY = Math.round(srcYf);
          if (srcX < 0 || srcY < 0 || srcY >= height) continue;
          const srcRowWidth = isTriangular
            ? triangularRowWidth(srcY, triangularA!, dNum, dDen, shift)
            : width;
          if (srcX >= srcRowWidth) continue;
        }

        const srcOff = pixelOffset(srcX, srcY, width, gridType, triangularA, undefined, triangularDNum, triangularDDen, triangularShift);
        const dstOff = pixelOffset(dstX, dstY, width, gridType, triangularA, undefined, triangularDNum, triangularDDen, triangularShift);
        layerData[dstOff] = src[srcOff];
        layerData[dstOff + 1] = src[srcOff + 1];
        layerData[dstOff + 2] = src[srcOff + 2];
        layerData[dstOff + 3] = src[srcOff + 3];
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers

  /**
   * Convert a buffer coordinate (bx, by) to visual space.
   * For peyote: visual col = bx*2 + (by&1), visual bead row = floor(by/2).
   * For other grid types: identity.
   */
  private toVisual(bx: number, by: number, ctx: ToolContext): { vx: number; vy: number } {
    if (ctx.gridType === 'peyote') {
      return { vx: bx * 2 + (by & 1), vy: Math.floor(by / 2) };
    }
    return { vx: bx, vy: by };
  }

  /**
   * Compute the rotation centre in visual space.
   * For peyote: centre of the visual bead grid (visualColumns × numBeadRows).
   * For other grid types: centre of the buffer (canvasWidth × canvasHeight).
   */
  private visualCenter(ctx: ToolContext): { vcx: number; vcy: number } {
    if (ctx.gridType === 'peyote') {
      // Peyote: buffer row by maps to visual bead row floor(by/2).
      // numBeadRows = ceil(bufferHeight / 2); centre index = (numBeadRows - 1) / 2.
      return {
        vcx: (ctx.visualColumns - 1) / 2,
        vcy: (Math.ceil(ctx.canvasHeight / 2) - 1) / 2,
      };
    }
    return {
      vcx: (ctx.canvasWidth - 1) / 2,
      vcy: (ctx.canvasHeight - 1) / 2,
    };
  }
}
