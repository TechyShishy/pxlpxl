import { Tool, ToolType, ToolContext, ToolResult, Color, pixelOffset } from '../models';

/**
 * Eyedropper tool — picks a color from the canvas.
 * Does not modify pixels; instead it signals the picked color
 * through the onColorPicked callback.
 */
export class EyedropperTool implements Tool {
  readonly type = ToolType.Eyedropper;
  readonly icon = 'colorize';
  readonly label = 'Eyedropper';
  readonly cursor = 'crosshair';

  /** Callback invoked when a color is picked */
  onColorPicked: ((color: Color, isSecondary: boolean) => void) | null = null;

  onPointerDown(ctx: ToolContext, layerData: Uint8ClampedArray): ToolResult | null {
    this.pickColor(ctx, layerData);
    return null;
  }

  onPointerMove(ctx: ToolContext, layerData: Uint8ClampedArray): ToolResult | null {
    this.pickColor(ctx, layerData);
    return null;
  }

  onPointerUp(_ctx: ToolContext, _layerData: Uint8ClampedArray): ToolResult | null {
    return null;
  }

  private pickColor(ctx: ToolContext, layerData: Uint8ClampedArray): void {
    const offset = pixelOffset(ctx.coord.x, ctx.coord.y, ctx.canvasWidth, ctx.gridType, ctx.triangularA, ctx.triangularD);
    const color: Color = {
      r: layerData[offset],
      g: layerData[offset + 1],
      b: layerData[offset + 2],
      a: layerData[offset + 3],
    };
    this.onColorPicked?.(color, ctx.isSecondary);
  }
}
