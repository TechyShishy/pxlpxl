import {
  Tool,
  ToolType,
  ToolContext,
  ToolResult,
  ModifiedPixel,
  PixelCoord,
  Color,
} from '../models';

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
    this.previewPixels = this.bresenhamLine(this.startCoord, ctx.coord);
    return null;
  }

  onPointerUp(ctx: ToolContext, layerData: Uint8ClampedArray): ToolResult | null {
    if (!this.startCoord) return null;

    const color = ctx.isSecondary ? ctx.secondaryColor : ctx.primaryColor;
    const pixels = this.bresenhamLine(this.startCoord, ctx.coord);
    const modifiedPixels: ModifiedPixel[] = [];

    for (const coord of pixels) {
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
