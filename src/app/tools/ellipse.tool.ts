import { ToolType, PixelCoord } from '../models';
import { ShapeTool } from './shape.tool';

export class EllipseTool extends ShapeTool {
  readonly type = ToolType.Ellipse;
  readonly icon = 'circle';
  readonly label = 'Ellipse';

  protected computeShapePoints(from: PixelCoord, to: PixelCoord): PixelCoord[] {
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
