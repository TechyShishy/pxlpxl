import { EraserTool } from './eraser.tool';
import { ToolContext, ToolType, BLACK, WHITE, TRANSPARENT, colorsEqual } from '../models';

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

describe('EraserTool', () => {
  let tool: EraserTool;
  let layerData: Uint8ClampedArray;

  beforeEach(() => {
    tool = new EraserTool();
    layerData = makeLayerData(4, 4);
  });

  it('should have correct type and metadata', () => {
    expect(tool.type).toBe(ToolType.Eraser);
    expect(tool.label).toBe('Eraser');
  });

  describe('onPointerDown', () => {
    it('should erase a colored pixel to TRANSPARENT', () => {
      // Set pixel (0,0) to BLACK
      layerData[0] = 0;
      layerData[1] = 0;
      layerData[2] = 0;
      layerData[3] = 255;

      const result = tool.onPointerDown(makeContext(), layerData);
      expect(result).not.toBeNull();
      expect(colorsEqual(result!.modifiedPixels[0].newColor, TRANSPARENT)).toBe(true);
      // Buffer should be zeroed
      expect(layerData[0]).toBe(0);
      expect(layerData[3]).toBe(0);
    });

    it('should return null for already-transparent pixel', () => {
      const result = tool.onPointerDown(makeContext(), layerData);
      expect(result).toBeNull();
    });

    it('should record the correct oldColor', () => {
      layerData[0] = 255;
      layerData[1] = 128;
      layerData[2] = 64;
      layerData[3] = 200;

      const result = tool.onPointerDown(makeContext(), layerData);
      expect(result).not.toBeNull();
      expect(result!.modifiedPixels[0].oldColor).toEqual({
        r: 255,
        g: 128,
        b: 64,
        a: 200,
      });
    });
  });

  describe('onPointerMove', () => {
    it('should erase at new coordinates during a stroke', () => {
      // Set pixels to non-transparent
      for (let i = 0; i < 32; i += 4) {
        layerData[i] = 100;
        layerData[i + 3] = 255;
      }
      tool.onPointerDown(makeContext({ coord: { x: 0, y: 0 } }), layerData);
      const result = tool.onPointerMove(makeContext({ coord: { x: 1, y: 0 } }), layerData);
      expect(result).not.toBeNull();
    });

    it('should not re-erase visited pixels', () => {
      layerData[0] = 100;
      layerData[3] = 255;
      tool.onPointerDown(makeContext({ coord: { x: 0, y: 0 } }), layerData);
      const result = tool.onPointerMove(makeContext({ coord: { x: 0, y: 0 } }), layerData);
      expect(result).toBeNull();
    });
  });

  describe('onPointerUp', () => {
    it('should return all erased pixels', () => {
      // Set first 3 pixels to non-transparent
      for (let i = 0; i < 12; i += 4) {
        layerData[i] = 100 + i;
        layerData[i + 3] = 255;
      }
      tool.onPointerDown(makeContext({ coord: { x: 0, y: 0 } }), layerData);
      tool.onPointerMove(makeContext({ coord: { x: 1, y: 0 } }), layerData);
      tool.onPointerMove(makeContext({ coord: { x: 2, y: 0 } }), layerData);
      const result = tool.onPointerUp(makeContext(), layerData);
      expect(result).not.toBeNull();
      expect(result!.modifiedPixels.length).toBe(3);
    });

    it('should return null if nothing was erased', () => {
      // All transparent — nothing to erase
      tool.onPointerDown(makeContext({ coord: { x: 0, y: 0 } }), layerData);
      const result = tool.onPointerUp(makeContext(), layerData);
      expect(result).toBeNull();
    });

    it('should reset state for next stroke', () => {
      layerData[0] = 100;
      layerData[3] = 255;
      tool.onPointerDown(makeContext({ coord: { x: 0, y: 0 } }), layerData);
      tool.onPointerUp(makeContext(), layerData);

      // Next stroke with fresh data
      const freshData = makeLayerData(4, 4);
      freshData[0] = 200;
      freshData[3] = 255;
      const result = tool.onPointerDown(makeContext({ coord: { x: 0, y: 0 } }), freshData);
      expect(result).not.toBeNull();
    });
  });

  describe('bounds checking', () => {
    it('should return null when coordinate is negative', () => {
      layerData[0] = 255; layerData[3] = 255;
      const ctx = makeContext({ coord: { x: -1, y: 0 } });
      const result = tool.onPointerDown(ctx, layerData);
      expect(result).toBeNull();
    });

    it('should return null when coordinate exceeds canvas bounds', () => {
      layerData[0] = 255; layerData[3] = 255;
      const ctx = makeContext({ coord: { x: 4, y: 0 } });
      const result = tool.onPointerDown(ctx, layerData);
      expect(result).toBeNull();
    });
  });
});
