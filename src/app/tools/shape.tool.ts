import {
  Tool,
  ToolType,
  ToolContext,
  ToolResult,
  ModifiedPixel,
  PixelCoord,
  Color,
  BeadSize,
  pixelOffset,
} from '../models';
import { GridService } from '../services/grid.service';

const gridService = new GridService();

/**
 * Abstract base class for shape-drawing tools (rectangle, ellipse, line).
 *
 * Subclasses provide only a shape-specific algorithm via `computeShapePoints()`.
 * The base class handles pointer lifecycle, visual-space mapping for
 * non-square grids, pixel commit, and preview management.
 */
export abstract class ShapeTool implements Tool {
  abstract readonly type: ToolType;
  abstract readonly icon: string;
  abstract readonly label: string;
  readonly cursor = 'crosshair';

  private startCoord: PixelCoord | null = null;
  private previewPixels: PixelCoord[] = [];

  /**
   * Compute the shape outline in simple pixel space (square grid).
   * E.g., Bresenham line, rectangle edges, or parametric ellipse.
   */
  protected abstract computeShapePoints(from: PixelCoord, to: PixelCoord): PixelCoord[];

  onPointerDown(ctx: ToolContext, _layerData: Uint8ClampedArray): ToolResult | null {
    this.startCoord = { ...ctx.coord };
    this.previewPixels = [{ ...ctx.coord }];
    return null;
  }

  onPointerMove(ctx: ToolContext, _layerData: Uint8ClampedArray): ToolResult | null {
    if (!this.startCoord) return null;
    this.previewPixels = this.mapShapePixels(this.startCoord, ctx.coord, ctx);
    return null;
  }

  onPointerUp(ctx: ToolContext, layerData: Uint8ClampedArray): ToolResult | null {
    if (!this.startCoord) return null;

    const color = ctx.isSecondary ? ctx.secondaryColor : ctx.primaryColor;
    const pixels = this.mapShapePixels(this.startCoord, ctx.coord, ctx);
    const modifiedPixels: ModifiedPixel[] = [];

    for (const coord of pixels) {
      if (
        !gridService.isValidPixel(
          coord.x, coord.y,
          ctx.canvasWidth, ctx.canvasHeight,
          ctx.gridType, ctx.visualColumns,
          ctx.triangularA, ctx.triangularD,
          ctx.triangularDNum, ctx.triangularDDen,
          ctx.triangularShift,
        )
      ) {
        continue;
      }

      const offset = pixelOffset(
        coord.x, coord.y, ctx.canvasWidth,
        ctx.gridType, ctx.triangularA, ctx.triangularD,
        ctx.triangularDNum, ctx.triangularDDen, ctx.triangularShift,
      );
      const oldColor: Color = {
        r: layerData[offset],
        g: layerData[offset + 1],
        b: layerData[offset + 2],
        a: layerData[offset + 3],
      };

      layerData[offset] = color.r;
      layerData[offset + 1] = color.g;
      layerData[offset + 2] = color.b;
      layerData[offset + 3] = color.a;

      modifiedPixels.push({ coord, oldColor, newColor: color });
    }

    this.startCoord = null;
    this.previewPixels = [];
    return modifiedPixels.length > 0 ? { modifiedPixels } : null;
  }

  getPreview(): PixelCoord[] {
    return this.previewPixels;
  }

  /**
   * Map shape points through visual space for non-square grids,
   * or return them directly for square grids.
   */
  private mapShapePixels(from: PixelCoord, to: PixelCoord, ctx: ToolContext): PixelCoord[] {
    if (!gridService.isPeyote(ctx.gridType) && !gridService.isAnyTriangular(ctx.gridType)) {
      return this.computeShapePoints(from, to);
    }

    // Map buffer coords to visual-space centers, compute shape there, map back
    const beadSize: BeadSize = { width: 100, height: 100 };
    const fromV = gridService.pixelToScreen(
      from.x, from.y, beadSize,
      ctx.gridType, ctx.triangularA, ctx.triangularD,
      ctx.canvasHeight, ctx.triangularDNum, ctx.triangularDDen,
      ctx.triangularShift,
    );
    const toV = gridService.pixelToScreen(
      to.x, to.y, beadSize,
      ctx.gridType, ctx.triangularA, ctx.triangularD,
      ctx.canvasHeight, ctx.triangularDNum, ctx.triangularDDen,
      ctx.triangularShift,
    );
    const fromCenter = { x: fromV.sx + beadSize.width / 2, y: fromV.sy + beadSize.height / 2 };
    const toCenter = { x: toV.sx + beadSize.width / 2, y: toV.sy + beadSize.height / 2 };

    const visualPoints = this.computeShapePoints(
      { x: Math.round(fromCenter.x), y: Math.round(fromCenter.y) },
      { x: Math.round(toCenter.x), y: Math.round(toCenter.y) },
    );

    const seen = new Set<string>();
    const result: PixelCoord[] = [];
    for (const vp of visualPoints) {
      const lp = gridService.screenToPixel(
        vp.x, vp.y, beadSize,
        ctx.canvasWidth, ctx.canvasHeight,
        ctx.gridType, ctx.visualColumns,
        ctx.triangularA, ctx.triangularD,
        ctx.triangularDNum, ctx.triangularDDen,
        ctx.triangularShift,
      );
      if (!lp) continue;
      const key = `${lp.x},${lp.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(lp);
    }
    return result;
  }
}
