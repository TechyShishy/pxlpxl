import { ToolType, PixelCoord } from '../models';
import { ShapeTool } from './shape.tool';

export class RectangleTool extends ShapeTool {
  readonly type = ToolType.Rectangle;
  readonly icon = 'rectangle';
  readonly label = 'Rectangle';

  protected computeShapePoints(from: PixelCoord, to: PixelCoord): PixelCoord[] {
    const points: PixelCoord[] = [];
    const x1 = Math.min(from.x, to.x);
    const y1 = Math.min(from.y, to.y);
    const x2 = Math.max(from.x, to.x);
    const y2 = Math.max(from.y, to.y);

    for (let x = x1; x <= x2; x++) {
      points.push({ x, y: y1 });
      if (y2 !== y1) {
        points.push({ x, y: y2 });
      }
    }
    for (let y = y1 + 1; y < y2; y++) {
      points.push({ x: x1, y });
      if (x2 !== x1) {
        points.push({ x: x2, y });
      }
    }

    return points;
  }
}
