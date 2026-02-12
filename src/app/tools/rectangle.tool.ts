import {
  Tool,
  ToolType,
  ToolContext,
  ToolResult,
  ModifiedPixel,
  PixelCoord,
  Color,
} from '../models';

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
    this.previewPixels = this.getRectOutline(this.startCoord, ctx.coord);
    return null;
  }

  onPointerUp(ctx: ToolContext, layerData: Uint8ClampedArray): ToolResult | null {
    if (!this.startCoord) return null;

    const color = ctx.isSecondary ? ctx.secondaryColor : ctx.primaryColor;
    const pixels = this.getRectOutline(this.startCoord, ctx.coord);
    const modifiedPixels: ModifiedPixel[] = [];

    for (const coord of pixels) {
      if (coord.x < 0 || coord.x >= ctx.canvasWidth || coord.y < 0 || coord.y >= ctx.canvasHeight)
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
