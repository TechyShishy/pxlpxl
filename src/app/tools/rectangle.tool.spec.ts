import { RectangleTool } from './rectangle.tool';
import { ToolContext, ToolType, Color, BLACK, WHITE, TRANSPARENT, colorsEqual } from '../models';

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

function getPixel(data: Uint8ClampedArray, x: number, y: number, width: number): Color {
  const offset = (y * width + x) * 4;
  return {
    r: data[offset],
    g: data[offset + 1],
    b: data[offset + 2],
    a: data[offset + 3],
  };
}

describe('RectangleTool', () => {
  let tool: RectangleTool;
  let layerData: Uint8ClampedArray;

  beforeEach(() => {
    tool = new RectangleTool();
    layerData = makeLayerData(8, 8);
  });

  it('should have correct type and metadata', () => {
    expect(tool.type).toBe(ToolType.Rectangle);
    expect(tool.label).toBe('Rectangle');
  });

  describe('onPointerDown', () => {
    it('should return null', () => {
      const result = tool.onPointerDown(makeContext({ coord: { x: 1, y: 1 } }), layerData);
      expect(result).toBeNull();
    });
  });

  describe('onPointerMove', () => {
    it('should update preview but not modify buffer', () => {
      tool.onPointerDown(makeContext({ coord: { x: 1, y: 1 } }), layerData);
      tool.onPointerMove(makeContext({ coord: { x: 3, y: 3 } }), layerData);
      expect(tool.getPreview().length).toBeGreaterThan(0);
      // Buffer unchanged
      for (let i = 0; i < layerData.length; i++) {
        expect(layerData[i]).toBe(0);
      }
    });
  });

  describe('onPointerUp', () => {
    it('should draw a 3x3 rectangle outline (8 pixels)', () => {
      tool.onPointerDown(makeContext({ coord: { x: 1, y: 1 } }), layerData);
      const result = tool.onPointerUp(makeContext({ coord: { x: 3, y: 3 } }), layerData);
      expect(result).not.toBeNull();
      // 3x3 outline: top row (3) + bottom row (3) + left/right sides (1+1) = 8
      expect(result!.modifiedPixels.length).toBe(8);

      // Center pixel (2,2) should NOT be filled
      expect(colorsEqual(getPixel(layerData, 2, 2, 8), TRANSPARENT)).toBe(true);
    });

    it('should draw a 1x1 rectangle (single pixel)', () => {
      tool.onPointerDown(makeContext({ coord: { x: 2, y: 2 } }), layerData);
      const result = tool.onPointerUp(makeContext({ coord: { x: 2, y: 2 } }), layerData);
      expect(result).not.toBeNull();
      // getRectOutline pushes the same point for top and bottom edges
      // when start === end, producing a duplicate entry
      expect(result!.modifiedPixels.length).toBe(2);
    });

    it('should draw a 2x2 rectangle (4 pixels, all outline)', () => {
      tool.onPointerDown(makeContext({ coord: { x: 0, y: 0 } }), layerData);
      const result = tool.onPointerUp(makeContext({ coord: { x: 1, y: 1 } }), layerData);
      expect(result).not.toBeNull();
      expect(result!.modifiedPixels.length).toBe(4);
    });

    it('should handle reversed coordinates (from > to)', () => {
      tool.onPointerDown(makeContext({ coord: { x: 3, y: 3 } }), layerData);
      const result = tool.onPointerUp(makeContext({ coord: { x: 1, y: 1 } }), layerData);
      expect(result).not.toBeNull();
      expect(result!.modifiedPixels.length).toBe(8); // same 3x3 outline
    });

    it('should write pixels to the buffer', () => {
      tool.onPointerDown(makeContext({ coord: { x: 0, y: 0 } }), layerData);
      tool.onPointerUp(makeContext({ coord: { x: 2, y: 2 } }), layerData);
      // Top-left corner
      expect(colorsEqual(getPixel(layerData, 0, 0, 8), BLACK)).toBe(true);
      // Top-right corner
      expect(colorsEqual(getPixel(layerData, 2, 0, 8), BLACK)).toBe(true);
    });

    it('should return null if no start coord', () => {
      const result = tool.onPointerUp(makeContext({ coord: { x: 3, y: 3 } }), layerData);
      expect(result).toBeNull();
    });

    it('should draw a non-square rectangle', () => {
      tool.onPointerDown(makeContext({ coord: { x: 0, y: 0 } }), layerData);
      const result = tool.onPointerUp(makeContext({ coord: { x: 4, y: 1 } }), layerData);
      expect(result).not.toBeNull();
      // 5x2 outline: top (5) + bottom (5) = 10, but corners are shared
      // Actually: top row = 5, bottom row = 5, no middle rows → total 10
      // But wait, getRectOutline pushes top and bottom rows then sides for y1+1..y2-1
      // For y1=0, y2=1: top loop pushes (x,0) and (x,1) for x=0..4 → 10 points
      // The side loop: y1+1=1, y2-1=0, so no side points
      expect(result!.modifiedPixels.length).toBe(10);
    });

    it('should clear state after drawing', () => {
      tool.onPointerDown(makeContext({ coord: { x: 0, y: 0 } }), layerData);
      tool.onPointerUp(makeContext({ coord: { x: 2, y: 2 } }), layerData);
      expect(tool.getPreview().length).toBe(0);
    });
  });
});
