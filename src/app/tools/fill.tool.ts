import {
  Tool,
  ToolType,
  ToolContext,
  ToolResult,
  ModifiedPixel,
  Color,
  colorsEqual,
  GridType,
  pixelOffset,
} from '../models';
import { GridService } from '../services/grid.service';

const gridService = new GridService();

export class FillTool implements Tool {
  readonly type = ToolType.Fill;
  readonly icon = 'format_color_fill';
  readonly label = 'Fill';
  readonly cursor = 'crosshair';

  onPointerDown(ctx: ToolContext, layerData: Uint8ClampedArray): ToolResult | null {
    const fillColor = ctx.isSecondary ? ctx.secondaryColor : ctx.primaryColor;
    const targetOffset = pixelOffset(ctx.coord.x, ctx.coord.y, ctx.canvasWidth, ctx.gridType, ctx.triangularA, ctx.triangularD);
    const targetColor: Color = {
      r: layerData[targetOffset],
      g: layerData[targetOffset + 1],
      b: layerData[targetOffset + 2],
      a: layerData[targetOffset + 3],
    };

    if (colorsEqual(targetColor, fillColor)) return null;

    const modifiedPixels = this.floodFill(
      layerData,
      ctx.canvasWidth,
      ctx.canvasHeight,
      ctx.coord.x,
      ctx.coord.y,
      targetColor,
      fillColor,
      ctx.gridType,
      ctx.visualColumns,
      ctx.triangularA,
      ctx.triangularD,
    );

    return modifiedPixels.length > 0 ? { modifiedPixels } : null;
  }

  onPointerMove(_ctx: ToolContext, _layerData: Uint8ClampedArray): ToolResult | null {
    return null;
  }

  onPointerUp(_ctx: ToolContext, _layerData: Uint8ClampedArray): ToolResult | null {
    return null;
  }

  private floodFill(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    startX: number,
    startY: number,
    targetColor: Color,
    fillColor: Color,
    gridTypeValue: GridType,
    visualColumns: number,
    triangularA?: number,
    triangularD?: number,
  ): ModifiedPixel[] {
    const modified: ModifiedPixel[] = [];
    const stack: [number, number][] = [[startX, startY]];
    const visited = new Set<string>();

    while (stack.length > 0) {
      const [x, y] = stack.pop()!;
      const key = `${x},${y}`;

      if (visited.has(key)) continue;
      if (!gridService.isValidPixel(x, y, width, height, gridTypeValue, visualColumns, triangularA, triangularD)) continue;

      const offset = pixelOffset(x, y, width, gridTypeValue, triangularA, triangularD);
      const pixelColor: Color = {
        r: data[offset],
        g: data[offset + 1],
        b: data[offset + 2],
        a: data[offset + 3],
      };

      if (!colorsEqual(pixelColor, targetColor)) continue;

      visited.add(key);

      modified.push({
        coord: { x, y },
        oldColor: { ...pixelColor },
        newColor: { ...fillColor },
      });

      data[offset] = fillColor.r;
      data[offset + 1] = fillColor.g;
      data[offset + 2] = fillColor.b;
      data[offset + 3] = fillColor.a;

      const neighbors = gridService.getNeighbors(x, y, gridTypeValue, width, height, visualColumns, triangularA, triangularD);
      for (const n of neighbors) {
        stack.push([n.x, n.y]);
      }
    }

    return modified;
  }
}
