import { PencilTool } from './pencil.tool';
import { ToolContext, ToolType, Color, BLACK, WHITE, TRANSPARENT, colorsEqual } from '../models';

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    coord: { x: 0, y: 0 },
    layerIndex: 0,
    canvasWidth: 4,
    canvasHeight: 4,
    visualColumns: 4,
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

describe('PencilTool', () => {
  let tool: PencilTool;
  let layerData: Uint8ClampedArray;

  beforeEach(() => {
    tool = new PencilTool();
    layerData = makeLayerData(4, 4);
  });

  it('should have correct type and metadata', () => {
    expect(tool.type).toBe(ToolType.Pencil);
    expect(tool.label).toBe('Pencil');
    expect(tool.cursor).toBe('crosshair');
  });

  describe('onPointerDown', () => {
    it('should draw a pixel and return ToolResult', () => {
      const ctx = makeContext({ coord: { x: 1, y: 1 } });
      const result = tool.onPointerDown(ctx, layerData);
      expect(result).not.toBeNull();
      expect(result!.modifiedPixels.length).toBe(1);
      expect(result!.modifiedPixels[0].coord).toEqual({ x: 1, y: 1 });
      expect(colorsEqual(result!.modifiedPixels[0].newColor, BLACK)).toBe(true);
    });

    it('should modify the buffer directly', () => {
      const ctx = makeContext({ coord: { x: 0, y: 0 } });
      tool.onPointerDown(ctx, layerData);
      // Pixel at (0,0) should now be BLACK
      expect(layerData[0]).toBe(0);
      expect(layerData[1]).toBe(0);
      expect(layerData[2]).toBe(0);
      expect(layerData[3]).toBe(255);
    });

    it('should return null if pixel is already the same color', () => {
      // Set pixel to BLACK first
      layerData[0] = 0;
      layerData[1] = 0;
      layerData[2] = 0;
      layerData[3] = 255;
      const ctx = makeContext({ coord: { x: 0, y: 0 } });
      const result = tool.onPointerDown(ctx, layerData);
      expect(result).toBeNull();
    });

    it('should record the correct oldColor', () => {
      // Set pixel to red first
      const red: Color = { r: 255, g: 0, b: 0, a: 255 };
      layerData[0] = 255;
      layerData[3] = 255;
      const ctx = makeContext({ coord: { x: 0, y: 0 } });
      const result = tool.onPointerDown(ctx, layerData);
      expect(result).not.toBeNull();
      expect(result!.modifiedPixels[0].oldColor.r).toBe(255);
      expect(result!.modifiedPixels[0].oldColor.g).toBe(0);
    });
  });

  describe('onPointerMove', () => {
    it('should draw at new coordinates during a stroke', () => {
      tool.onPointerDown(makeContext({ coord: { x: 0, y: 0 } }), layerData);
      const result = tool.onPointerMove(makeContext({ coord: { x: 1, y: 0 } }), layerData);
      expect(result).not.toBeNull();
      expect(result!.modifiedPixels[0].coord).toEqual({ x: 1, y: 0 });
    });

    it('should return null for already-visited pixel in same stroke', () => {
      tool.onPointerDown(makeContext({ coord: { x: 0, y: 0 } }), layerData);
      const result = tool.onPointerMove(makeContext({ coord: { x: 0, y: 0 } }), layerData);
      expect(result).toBeNull();
    });
  });

  describe('onPointerUp', () => {
    it('should return accumulated modified pixels', () => {
      tool.onPointerDown(makeContext({ coord: { x: 0, y: 0 } }), layerData);
      tool.onPointerMove(makeContext({ coord: { x: 1, y: 0 } }), layerData);
      tool.onPointerMove(makeContext({ coord: { x: 2, y: 0 } }), layerData);
      const result = tool.onPointerUp(makeContext(), layerData);
      expect(result).not.toBeNull();
      expect(result!.modifiedPixels.length).toBe(3);
    });

    it('should return null if no pixels were modified', () => {
      // All pixels already BLACK
      for (let i = 0; i < layerData.length; i += 4) {
        layerData[i] = 0;
        layerData[i + 1] = 0;
        layerData[i + 2] = 0;
        layerData[i + 3] = 255;
      }
      tool.onPointerDown(makeContext({ coord: { x: 0, y: 0 } }), layerData);
      const result = tool.onPointerUp(makeContext(), layerData);
      expect(result).toBeNull();
    });

    it('should clear state so next stroke starts fresh', () => {
      tool.onPointerDown(makeContext({ coord: { x: 0, y: 0 } }), layerData);
      tool.onPointerUp(makeContext(), layerData);

      // New stroke on the same pixel — but it was already drawn, so color matches now
      // Draw on a different pixel to verify state was reset
      const freshData = makeLayerData(4, 4);
      const result = tool.onPointerDown(makeContext({ coord: { x: 0, y: 0 } }), freshData);
      expect(result).not.toBeNull();
    });
  });

  describe('secondary color', () => {
    it('should use secondaryColor when isSecondary is true', () => {
      const ctx = makeContext({ coord: { x: 0, y: 0 }, isSecondary: true });
      const result = tool.onPointerDown(ctx, layerData);
      expect(result).not.toBeNull();
      expect(colorsEqual(result!.modifiedPixels[0].newColor, WHITE)).toBe(true);
      // Buffer should have WHITE
      expect(layerData[0]).toBe(255);
      expect(layerData[1]).toBe(255);
      expect(layerData[2]).toBe(255);
      expect(layerData[3]).toBe(255);
    });
  });
});
