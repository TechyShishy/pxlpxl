import {
  Tool,
  ToolType,
  ToolContext,
  ToolResult,
  ModifiedPixel,
  PixelCoord,
  Color,
} from '../models';

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
    this.previewPixels = this.getEllipseOutline(this.startCoord, ctx.coord);
    return null;
  }

  onPointerUp(ctx: ToolContext, layerData: Uint8ClampedArray): ToolResult | null {
    if (!this.startCoord) return null;

    const color = ctx.isSecondary ? ctx.secondaryColor : ctx.primaryColor;
    const pixels = this.getEllipseOutline(this.startCoord, ctx.coord);
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
