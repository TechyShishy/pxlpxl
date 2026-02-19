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

export class EllipseTool implements Tool {
  readonly type = ToolType.Ellipse;
  readonly icon = 'circle';
  readonly label = 'Ellipse';
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
    this.previewPixels = this.computeEllipsePixels(this.startCoord, ctx.coord, ctx);
    return null;
  }

  onPointerUp(ctx: ToolContext, layerData: Uint8ClampedArray): ToolResult | null {
    if (!this.startCoord) return null;

    const color = ctx.isSecondary ? ctx.secondaryColor : ctx.primaryColor;
    const pixels = this.computeEllipsePixels(this.startCoord, ctx.coord, ctx);
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

  private computeEllipsePixels(from: PixelCoord, to: PixelCoord, ctx: ToolContext): PixelCoord[] {
    if (!gridService.isPeyote(ctx.gridType)) {
      return this.getEllipseOutline(from, to);
    }
    // Map to visual space, compute ellipse there, map back
    const scale = 100;
    const fromV = gridService.pixelToScreen(from.x, from.y, scale, ctx.gridType);
    const toV = gridService.pixelToScreen(to.x, to.y, scale, ctx.gridType);
    const fromCenter = { x: fromV.sx + scale / 2, y: fromV.sy + scale / 2 };
    const toCenter = { x: toV.sx + scale / 2, y: toV.sy + scale / 2 };

    const visualPoints = this.getEllipseOutline(
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

  /** Midpoint ellipse algorithm */
  private getEllipseOutline(from: PixelCoord, to: PixelCoord): PixelCoord[] {
    const points = new Set<string>();
    const result: PixelCoord[] = [];

    const cx = Math.round((from.x + to.x) / 2);
    const cy = Math.round((from.y + to.y) / 2);
    const rx = Math.abs(to.x - from.x) / 2;
    const ry = Math.abs(to.y - from.y) / 2;

    if (rx === 0 && ry === 0) {
      return [{ x: cx, y: cy }];
    }

    const addPoint = (x: number, y: number) => {
      const key = `${x},${y}`;
      if (!points.has(key)) {
        points.add(key);
        result.push({ x, y });
      }
    };

    // Use parametric approach for simplicity
    const steps = Math.max(8, Math.ceil(Math.PI * (rx + ry)));
    for (let i = 0; i < steps; i++) {
      const angle = (2 * Math.PI * i) / steps;
      const x = Math.round(cx + rx * Math.cos(angle));
      const y = Math.round(cy + ry * Math.sin(angle));
      addPoint(x, y);
    }

    return result;
  }
}
