import {
  Tool,
  ToolType,
  ToolContext,
  ToolResult,
  ModifiedPixel,
  PixelCoord,
  Color,
} from '../models';
import { GridService } from '../services/grid.service';

const gridService = new GridService();

export class RectangleTool implements Tool {
  readonly type = ToolType.Rectangle;
  readonly icon = 'rectangle';
  readonly label = 'Rectangle';
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
    this.previewPixels = this.computeRectPixels(this.startCoord, ctx.coord, ctx);
    return null;
  }

  onPointerUp(ctx: ToolContext, layerData: Uint8ClampedArray): ToolResult | null {
    if (!this.startCoord) return null;

    const color = ctx.isSecondary ? ctx.secondaryColor : ctx.primaryColor;
    const pixels = this.computeRectPixels(this.startCoord, ctx.coord, ctx);
    const modifiedPixels: ModifiedPixel[] = [];

    for (const coord of pixels) {
      if (!gridService.isValidPixel(coord.x, coord.y, ctx.canvasWidth, ctx.canvasHeight, ctx.gridType, ctx.visualColumns))
        continue;

      const offset = (coord.y * ctx.canvasWidth + coord.x) * 4;
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

  private computeRectPixels(from: PixelCoord, to: PixelCoord, ctx: ToolContext): PixelCoord[] {
    if (!gridService.isPeyote(ctx.gridType)) {
      return this.getRectOutline(from, to);
    }
    // Map to visual space, compute rect outline there, map back
    const scale = 100;
    const fromV = gridService.pixelToScreen(from.x, from.y, scale, ctx.gridType);
    const toV = gridService.pixelToScreen(to.x, to.y, scale, ctx.gridType);
    const fromCenter = { x: fromV.sx + scale / 2, y: fromV.sy + scale / 2 };
    const toCenter = { x: toV.sx + scale / 2, y: toV.sy + scale / 2 };

    const visualPoints = this.getRectOutline(
      { x: Math.round(fromCenter.x), y: Math.round(fromCenter.y) },
      { x: Math.round(toCenter.x), y: Math.round(toCenter.y) },
    );

    const seen = new Set<string>();
    const result: PixelCoord[] = [];
    for (const vp of visualPoints) {
      const lp = gridService.screenToPixel(vp.x, vp.y, scale, ctx.canvasWidth, ctx.canvasHeight, ctx.gridType, ctx.visualColumns);
      if (!lp) continue;
      const key = `${lp.x},${lp.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(lp);
    }
    return result;
  }

  private getRectOutline(from: PixelCoord, to: PixelCoord): PixelCoord[] {
    const points: PixelCoord[] = [];
    const x1 = Math.min(from.x, to.x);
    const y1 = Math.min(from.y, to.y);
    const x2 = Math.max(from.x, to.x);
    const y2 = Math.max(from.y, to.y);

    for (let x = x1; x <= x2; x++) {
      points.push({ x, y: y1 });
      points.push({ x, y: y2 });
    }
    for (let y = y1 + 1; y < y2; y++) {
      points.push({ x: x1, y });
      points.push({ x: x2, y });
    }

    return points;
  }
}
