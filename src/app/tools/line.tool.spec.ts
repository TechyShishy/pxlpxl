import { LineTool } from './line.tool';
import { ToolContext, ToolType, Color, BLACK, WHITE, TRANSPARENT, colorsEqual } from '../models';

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    coord: { x: 0, y: 0 },
    layerIndex: 0,
    canvasWidth: 8,
    canvasHeight: 8,
    visualColumns: 8,
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

describe('LineTool', () => {
  let tool: LineTool;
  let layerData: Uint8ClampedArray;

  beforeEach(() => {
    tool = new LineTool();
    layerData = makeLayerData(8, 8);
  });

  it('should have correct type and metadata', () => {
    expect(tool.type).toBe(ToolType.Line);
    expect(tool.label).toBe('Line');
  });

  describe('onPointerDown', () => {
    it('should return null (no immediate pixel modification)', () => {
      const result = tool.onPointerDown(makeContext({ coord: { x: 0, y: 0 } }), layerData);
      expect(result).toBeNull();
    });

    it('should not modify the buffer', () => {
      tool.onPointerDown(makeContext({ coord: { x: 0, y: 0 } }), layerData);
      // All pixels should still be transparent
      for (let i = 0; i < layerData.length; i++) {
        expect(layerData[i]).toBe(0);
      }
    });
  });

  describe('onPointerMove', () => {
    it('should return null', () => {
      tool.onPointerDown(makeContext({ coord: { x: 0, y: 0 } }), layerData);
      const result = tool.onPointerMove(makeContext({ coord: { x: 3, y: 0 } }), layerData);
      expect(result).toBeNull();
    });

    it('should update preview pixels', () => {
      tool.onPointerDown(makeContext({ coord: { x: 0, y: 0 } }), layerData);
      tool.onPointerMove(makeContext({ coord: { x: 3, y: 0 } }), layerData);
      const preview = tool.getPreview();
      expect(preview.length).toBeGreaterThan(0);
    });

    it('should not modify the buffer', () => {
      tool.onPointerDown(makeContext({ coord: { x: 0, y: 0 } }), layerData);
      tool.onPointerMove(makeContext({ coord: { x: 3, y: 3 } }), layerData);
      for (let i = 0; i < layerData.length; i++) {
        expect(layerData[i]).toBe(0);
      }
    });
  });

  describe('onPointerUp', () => {
    it('should draw a horizontal line', () => {
      tool.onPointerDown(makeContext({ coord: { x: 0, y: 0 } }), layerData);
      const result = tool.onPointerUp(makeContext({ coord: { x: 3, y: 0 } }), layerData);
      expect(result).not.toBeNull();
      // Should have pixels at (0,0), (1,0), (2,0), (3,0)
      expect(result!.modifiedPixels.length).toBe(4);
      for (const pixel of result!.modifiedPixels) {
        expect(pixel.coord.y).toBe(0);
        expect(colorsEqual(pixel.newColor, BLACK)).toBe(true);
      }
    });

    it('should draw a vertical line', () => {
      tool.onPointerDown(makeContext({ coord: { x: 2, y: 0 } }), layerData);
      const result = tool.onPointerUp(makeContext({ coord: { x: 2, y: 4 } }), layerData);
      expect(result).not.toBeNull();
      expect(result!.modifiedPixels.length).toBe(5);
      for (const pixel of result!.modifiedPixels) {
        expect(pixel.coord.x).toBe(2);
      }
    });

    it('should draw a single point when start equals end', () => {
      tool.onPointerDown(makeContext({ coord: { x: 3, y: 3 } }), layerData);
      const result = tool.onPointerUp(makeContext({ coord: { x: 3, y: 3 } }), layerData);
      expect(result).not.toBeNull();
      expect(result!.modifiedPixels.length).toBe(1);
      expect(result!.modifiedPixels[0].coord).toEqual({ x: 3, y: 3 });
    });

    it('should draw a diagonal line', () => {
      tool.onPointerDown(makeContext({ coord: { x: 0, y: 0 } }), layerData);
      const result = tool.onPointerUp(makeContext({ coord: { x: 3, y: 3 } }), layerData);
      expect(result).not.toBeNull();
      // Bresenham diagonal: (0,0), (1,1), (2,2), (3,3)
      expect(result!.modifiedPixels.length).toBe(4);
    });

    it('should write pixels to the buffer', () => {
      tool.onPointerDown(makeContext({ coord: { x: 0, y: 0 } }), layerData);
      tool.onPointerUp(makeContext({ coord: { x: 2, y: 0 } }), layerData);
      // Pixels (0,0), (1,0), (2,0) should be BLACK
      for (let x = 0; x < 3; x++) {
        expect(colorsEqual(getPixel(layerData, x, 0, 8), BLACK)).toBe(true);
      }
    });

    it('should use secondary color when isSecondary is true', () => {
      tool.onPointerDown(makeContext({ coord: { x: 0, y: 0 }, isSecondary: true }), layerData);
      const result = tool.onPointerUp(
        makeContext({ coord: { x: 2, y: 0 }, isSecondary: true }),
        layerData,
      );
      expect(result).not.toBeNull();
      expect(colorsEqual(result!.modifiedPixels[0].newColor, WHITE)).toBe(true);
    });

    it('should clear state after drawing', () => {
      tool.onPointerDown(makeContext({ coord: { x: 0, y: 0 } }), layerData);
      tool.onPointerUp(makeContext({ coord: { x: 2, y: 0 } }), layerData);
      expect(tool.getPreview().length).toBe(0);
    });

    it('should return null if no start coord (no onPointerDown)', () => {
      const result = tool.onPointerUp(makeContext({ coord: { x: 2, y: 0 } }), layerData);
      expect(result).toBeNull();
    });

    it('should record correct oldColor for each pixel', () => {
      // Pre-fill pixel (1,0) with RED
      const red: Color = { r: 255, g: 0, b: 0, a: 255 };
      const offset = (0 * 8 + 1) * 4;
      layerData[offset] = 255;
      layerData[offset + 3] = 255;

      tool.onPointerDown(makeContext({ coord: { x: 0, y: 0 } }), layerData);
      const result = tool.onPointerUp(makeContext({ coord: { x: 2, y: 0 } }), layerData);
      expect(result).not.toBeNull();

      // Find the pixel at (1,0)
      const pixel = result!.modifiedPixels.find((p) => p.coord.x === 1 && p.coord.y === 0);
      expect(pixel).toBeDefined();
      expect(pixel!.oldColor.r).toBe(255);
    });
  });

  describe('getPreview', () => {
    it('should return empty array before any interaction', () => {
      expect(tool.getPreview()).toEqual([]);
    });

    it('should return preview pixels during drawing', () => {
      tool.onPointerDown(makeContext({ coord: { x: 0, y: 0 } }), layerData);
      tool.onPointerMove(makeContext({ coord: { x: 4, y: 0 } }), layerData);
      const preview = tool.getPreview();
      expect(preview.length).toBe(5); // 0,1,2,3,4
    });
  });
});
