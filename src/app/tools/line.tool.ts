import {
  Tool,
  ToolType,
  ToolContext,
  ToolResult,
  ModifiedPixel,
  PixelCoord,
  Color,
  pixelOffset,
} from '../models';
import { GridService } from '../services/grid.service';

const gridService = new GridService();

export class LineTool implements Tool {
  readonly type = ToolType.Line;
  readonly icon = 'pen_size_1';
  readonly label = 'Line';
  readonly cursor = 'crosshair';

  private startCoord: PixelCoord | null = null;
  private previewPixels: PixelCoord[] = [];

  onPointerDown(ctx: ToolContext, _layerData: Uint8ClampedArray): ToolResult | null {
    this.startCoord = { ...ctx.coord };
    this.previewPixels = [{ ...ctx.coord }];
    return null;
  }

  onPointerMove(ctx: ToolContext, _layerData: Uint8ClampedArray): ToolResult | null {
    if (!this.startCoord) return null;
    this.previewPixels = this.computeLinePixels(this.startCoord, ctx.coord, ctx);
    return null;
  }

  onPointerUp(ctx: ToolContext, layerData: Uint8ClampedArray): ToolResult | null {
    if (!this.startCoord) return null;

    const color = ctx.isSecondary ? ctx.secondaryColor : ctx.primaryColor;
    const pixels = this.computeLinePixels(this.startCoord, ctx.coord, ctx);
    const modifiedPixels: ModifiedPixel[] = [];

    for (const coord of pixels) {
      const offset = pixelOffset(coord.x, coord.y, ctx.canvasWidth, ctx.gridType, ctx.triangularA, ctx.triangularD);
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

  private computeLinePixels(from: PixelCoord, to: PixelCoord, ctx: ToolContext): PixelCoord[] {
    if (!gridService.isPeyote(ctx.gridType) && !gridService.isTriangular(ctx.gridType)) {
      return this.bresenhamLine(from, to);
    }
    // Map buffer coords to visual center positions, run Bresenham there, map back
    const scale = 100; // arbitrary unit scale for visual-space computation
    const fromV = gridService.pixelToScreen(from.x, from.y, scale, ctx.gridType, ctx.triangularA, ctx.triangularD, ctx.canvasHeight);
    const toV = gridService.pixelToScreen(to.x, to.y, scale, ctx.gridType, ctx.triangularA, ctx.triangularD, ctx.canvasHeight);
    // Offset to bead center
    const fromCenter = { x: fromV.sx + scale / 2, y: fromV.sy + scale / 2 };
    const toCenter = { x: toV.sx + scale / 2, y: toV.sy + scale / 2 };

    const visualPoints = this.bresenhamLine(
      { x: Math.round(fromCenter.x), y: Math.round(fromCenter.y) },
      { x: Math.round(toCenter.x), y: Math.round(toCenter.y) },
    );

    // Map back to buffer pixels, dedup
    const seen = new Set<string>();
    const result: PixelCoord[] = [];
    for (const vp of visualPoints) {
      const lp = gridService.screenToPixel(
        vp.x,
        vp.y,
        scale,
        ctx.canvasWidth,
        ctx.canvasHeight,
        ctx.gridType,
        ctx.visualColumns,
        ctx.triangularA,
        ctx.triangularD,
      );
      if (!lp) continue;
      const key = `${lp.x},${lp.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(lp);
    }
    return result;
  }

  private bresenhamLine(from: PixelCoord, to: PixelCoord): PixelCoord[] {
    const points: PixelCoord[] = [];
    let x0 = from.x,
      y0 = from.y;
    const x1 = to.x,
      y1 = to.y;

    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      points.push({ x: x0, y: y0 });
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
    }

    return points;
  }
}
