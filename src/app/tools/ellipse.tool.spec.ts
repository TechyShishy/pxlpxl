import { EllipseTool } from './ellipse.tool';
import { ToolContext, ToolType, Color, BLACK, WHITE, TRANSPARENT, colorsEqual } from '../models';

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    coord: { x: 0, y: 0 },
    layerIndex: 0,
    canvasWidth: 16,
    canvasHeight: 16,
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

describe('EllipseTool', () => {
  let tool: EllipseTool;
  let layerData: Uint8ClampedArray;

  beforeEach(() => {
    tool = new EllipseTool();
    layerData = makeLayerData(16, 16);
  });

  it('should have correct type and metadata', () => {
    expect(tool.type).toBe(ToolType.Ellipse);
    expect(tool.label).toBe('Ellipse');
  });

  describe('onPointerDown', () => {
    it('should return null', () => {
      const result = tool.onPointerDown(makeContext({ coord: { x: 5, y: 5 } }), layerData);
      expect(result).toBeNull();
    });
  });

  describe('onPointerUp', () => {
    it('should draw a single point when start equals end (rx=0, ry=0)', () => {
      tool.onPointerDown(makeContext({ coord: { x: 5, y: 5 } }), layerData);
      const result = tool.onPointerUp(makeContext({ coord: { x: 5, y: 5 } }), layerData);
      expect(result).not.toBeNull();
      expect(result!.modifiedPixels.length).toBe(1);
      expect(result!.modifiedPixels[0].coord).toEqual({ x: 5, y: 5 });
    });

    it('should draw a circle outline', () => {
      // Circle from (2,2) to (8,8) → center (5,5), rx=3, ry=3
      tool.onPointerDown(makeContext({ coord: { x: 2, y: 2 } }), layerData);
      const result = tool.onPointerUp(makeContext({ coord: { x: 8, y: 8 } }), layerData);
      expect(result).not.toBeNull();
      expect(result!.modifiedPixels.length).toBeGreaterThan(4);

      // Verify symmetry: all pixels should be roughly equidistant from center
      const coords = result!.modifiedPixels.map((p) => p.coord);
      // Should include pixels on all 4 cardinal directions from center
      expect(coords.some((c) => c.x === 5 && c.y < 5)).toBe(true); // top
      expect(coords.some((c) => c.x === 5 && c.y > 5)).toBe(true); // bottom
      expect(coords.some((c) => c.y === 5 && c.x < 5)).toBe(true); // left
      expect(coords.some((c) => c.y === 5 && c.x > 5)).toBe(true); // right
    });

    it('should produce no duplicate pixels', () => {
      tool.onPointerDown(makeContext({ coord: { x: 2, y: 2 } }), layerData);
      const result = tool.onPointerUp(makeContext({ coord: { x: 10, y: 10 } }), layerData);
      expect(result).not.toBeNull();
      const keys = result!.modifiedPixels.map((p) => `${p.coord.x},${p.coord.y}`);
      const unique = new Set(keys);
      expect(unique.size).toBe(keys.length);
    });

    it('should draw a wide ellipse', () => {
      // From (1,5) to (13,9) → rx=6, ry=2
      tool.onPointerDown(makeContext({ coord: { x: 1, y: 5 } }), layerData);
      const result = tool.onPointerUp(makeContext({ coord: { x: 13, y: 9 } }), layerData);
      expect(result).not.toBeNull();
      const coords = result!.modifiedPixels.map((p) => p.coord);
      const xs = coords.map((c) => c.x);
      const ys = coords.map((c) => c.y);
      // Horizontal span should be wider than vertical
      const xSpan = Math.max(...xs) - Math.min(...xs);
      const ySpan = Math.max(...ys) - Math.min(...ys);
      expect(xSpan).toBeGreaterThan(ySpan);
    });

    it('should write pixels to the buffer', () => {
      tool.onPointerDown(makeContext({ coord: { x: 3, y: 3 } }), layerData);
      tool.onPointerUp(makeContext({ coord: { x: 9, y: 9 } }), layerData);
      // At least some pixels should be non-transparent
      let nonTransparentCount = 0;
      for (let i = 0; i < layerData.length; i += 4) {
        if (layerData[i + 3] !== 0) nonTransparentCount++;
      }
      expect(nonTransparentCount).toBeGreaterThan(0);
    });

    it('should return null if no start coord', () => {
      const result = tool.onPointerUp(makeContext({ coord: { x: 5, y: 5 } }), layerData);
      expect(result).toBeNull();
    });

    it('should clear state after drawing', () => {
      tool.onPointerDown(makeContext({ coord: { x: 3, y: 3 } }), layerData);
      tool.onPointerUp(makeContext({ coord: { x: 7, y: 7 } }), layerData);
      expect(tool.getPreview().length).toBe(0);
    });

    it('should handle a very small ellipse (2x2)', () => {
      tool.onPointerDown(makeContext({ coord: { x: 4, y: 4 } }), layerData);
      const result = tool.onPointerUp(makeContext({ coord: { x: 5, y: 5 } }), layerData);
      expect(result).not.toBeNull();
      expect(result!.modifiedPixels.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getPreview', () => {
    it('should return empty array before interaction', () => {
      expect(tool.getPreview()).toEqual([]);
    });

    it('should return preview during move', () => {
      tool.onPointerDown(makeContext({ coord: { x: 3, y: 3 } }), layerData);
      tool.onPointerMove(makeContext({ coord: { x: 9, y: 9 } }), layerData);
      expect(tool.getPreview().length).toBeGreaterThan(0);
    });
  });
});
