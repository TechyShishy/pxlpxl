import { ToolType, PixelCoord } from '../models';
import { ShapeTool } from './shape.tool';

export class LineTool extends ShapeTool {
  readonly type = ToolType.Line;
  readonly icon = 'pen_size_1';
  readonly label = 'Line';

  protected computeShapePoints(from: PixelCoord, to: PixelCoord): PixelCoord[] {
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
