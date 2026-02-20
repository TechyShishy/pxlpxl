import {
  Tool,
  ToolType,
  ToolContext,
  ToolResult,
  ModifiedPixel,
  Color,
  colorsEqual,
  pixelOffset,
} from '../models';

export class PencilTool implements Tool {
  readonly type = ToolType.Pencil;
  readonly icon = 'edit';
  readonly label = 'Pencil';
  readonly cursor = 'crosshair';

  private visitedPixels = new Set<string>();
  private modifiedPixels: ModifiedPixel[] = [];

  onPointerDown(ctx: ToolContext, layerData: Uint8ClampedArray): ToolResult | null {
    this.visitedPixels.clear();
    this.modifiedPixels = [];
    return this.drawPixel(ctx, layerData);
  }

  onPointerMove(ctx: ToolContext, layerData: Uint8ClampedArray): ToolResult | null {
    return this.drawPixel(ctx, layerData);
  }

  onPointerUp(_ctx: ToolContext, _layerData: Uint8ClampedArray): ToolResult | null {
    const result: ToolResult = { modifiedPixels: [...this.modifiedPixels] };
    this.visitedPixels.clear();
    this.modifiedPixels = [];
    return result.modifiedPixels.length > 0 ? result : null;
  }

  private drawPixel(ctx: ToolContext, layerData: Uint8ClampedArray): ToolResult | null {
    const key = `${ctx.coord.x},${ctx.coord.y}`;
    if (this.visitedPixels.has(key)) return null;
    this.visitedPixels.add(key);

    const color = ctx.isSecondary ? ctx.secondaryColor : ctx.primaryColor;
    const offset = pixelOffset(ctx.coord.x, ctx.coord.y, ctx.canvasWidth, ctx.gridType, ctx.triangularA, ctx.triangularD);
    const oldColor: Color = {
      r: layerData[offset],
      g: layerData[offset + 1],
      b: layerData[offset + 2],
      a: layerData[offset + 3],
    };

    if (colorsEqual(oldColor, color)) return null;

    const modified: ModifiedPixel = {
      coord: { x: ctx.coord.x, y: ctx.coord.y },
      oldColor,
      newColor: color,
    };

    // Apply immediately for visual feedback
    layerData[offset] = color.r;
    layerData[offset + 1] = color.g;
    layerData[offset + 2] = color.b;
    layerData[offset + 3] = color.a;

    this.modifiedPixels.push(modified);
    return { modifiedPixels: [modified] };
  }
}
