import {
  Tool,
  ToolType,
  ToolContext,
  ToolResult,
  ModifiedPixel,
  Color,
  TRANSPARENT,
  colorsEqual,
  pixelOffset,
} from '../models';

export class EraserTool implements Tool {
  readonly type = ToolType.Eraser;
  readonly icon = 'ink_eraser';
  readonly label = 'Eraser';
  readonly cursor = 'crosshair';

  private visitedPixels = new Set<string>();
  private modifiedPixels: ModifiedPixel[] = [];

  onPointerDown(ctx: ToolContext, layerData: Uint8ClampedArray): ToolResult | null {
    this.visitedPixels.clear();
    this.modifiedPixels = [];
    return this.erasePixel(ctx, layerData);
  }

  onPointerMove(ctx: ToolContext, layerData: Uint8ClampedArray): ToolResult | null {
    return this.erasePixel(ctx, layerData);
  }

  onPointerUp(_ctx: ToolContext, _layerData: Uint8ClampedArray): ToolResult | null {
    const result: ToolResult = { modifiedPixels: [...this.modifiedPixels] };
    this.visitedPixels.clear();
    this.modifiedPixels = [];
    return result.modifiedPixels.length > 0 ? result : null;
  }

  private erasePixel(ctx: ToolContext, layerData: Uint8ClampedArray): ToolResult | null {
    const key = `${ctx.coord.x},${ctx.coord.y}`;
    if (this.visitedPixels.has(key)) return null;
    this.visitedPixels.add(key);

    const offset = pixelOffset(ctx.coord.x, ctx.coord.y, ctx.canvasWidth, ctx.gridType, ctx.triangularA, ctx.triangularD, ctx.triangularDNum, ctx.triangularDDen, ctx.triangularShift);
    const oldColor: Color = {
      r: layerData[offset],
      g: layerData[offset + 1],
      b: layerData[offset + 2],
      a: layerData[offset + 3],
    };

    if (colorsEqual(oldColor, TRANSPARENT)) return null;

    const modified: ModifiedPixel = {
      coord: { x: ctx.coord.x, y: ctx.coord.y },
      oldColor,
      newColor: { ...TRANSPARENT },
    };

    layerData[offset] = 0;
    layerData[offset + 1] = 0;
    layerData[offset + 2] = 0;
    layerData[offset + 3] = 0;

    this.modifiedPixels.push(modified);
    return { modifiedPixels: [modified] };
  }
}
