import { ShapeTool } from './shape.tool';
import { RectangleTool } from './rectangle.tool';
import { EllipseTool } from './ellipse.tool';
import { LineTool } from './line.tool';
import { ToolContext, BLACK, WHITE, TRANSPARENT, colorsEqual } from '../models';

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    coord: { x: 0, y: 0 },
    layerIndex: 0,
    canvasWidth: 8,
    canvasHeight: 8,
    primaryColor: { ...BLACK },
    secondaryColor: { ...WHITE },
    isSecondary: false,
    gridType: 'square',
    ...overrides,
  };
}

function makeLayerData(width: number, height: number): Uint8ClampedArray {
  return new Uint8ClampedArray(width * height * 4);
}

describe('ShapeTool', () => {
  it('RectangleTool should extend ShapeTool', () => {
    expect(new RectangleTool()).toBeInstanceOf(ShapeTool);
  });

  it('EllipseTool should extend ShapeTool', () => {
    expect(new EllipseTool()).toBeInstanceOf(ShapeTool);
  });

  it('LineTool should extend ShapeTool', () => {
    expect(new LineTool()).toBeInstanceOf(ShapeTool);
  });

  it('all shape tools should have crosshair cursor', () => {
    expect(new RectangleTool().cursor).toBe('crosshair');
    expect(new EllipseTool().cursor).toBe('crosshair');
    expect(new LineTool().cursor).toBe('crosshair');
  });

  describe('shared pointer lifecycle', () => {
    let tool: RectangleTool;
    let layerData: Uint8ClampedArray;

    beforeEach(() => {
      tool = new RectangleTool();
      layerData = makeLayerData(8, 8);
    });

    it('onPointerDown should set preview to start coord', () => {
      tool.onPointerDown(makeContext({ coord: { x: 2, y: 3 } }), layerData);
      const preview = tool.getPreview();
      expect(preview).toEqual([{ x: 2, y: 3 }]);
    });

    it('onPointerMove without prior down should return null', () => {
      const result = tool.onPointerMove(makeContext({ coord: { x: 5, y: 5 } }), layerData);
      expect(result).toBeNull();
    });

    it('onPointerUp should clear preview after commit', () => {
      tool.onPointerDown(makeContext({ coord: { x: 0, y: 0 } }), layerData);
      tool.onPointerUp(makeContext({ coord: { x: 3, y: 3 } }), layerData);
      expect(tool.getPreview()).toEqual([]);
    });

    it('onPointerUp should modify layer data', () => {
      tool.onPointerDown(makeContext({ coord: { x: 0, y: 0 } }), layerData);
      const result = tool.onPointerUp(makeContext({ coord: { x: 2, y: 2 } }), layerData);
      expect(result).not.toBeNull();
      expect(result!.modifiedPixels.length).toBeGreaterThan(0);
      // All modified pixels should have newColor = BLACK
      for (const mp of result!.modifiedPixels) {
        expect(colorsEqual(mp.newColor, BLACK)).toBe(true);
        expect(colorsEqual(mp.oldColor, TRANSPARENT)).toBe(true);
      }
    });
  });
});
