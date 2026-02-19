import { EyedropperTool } from './eyedropper.tool';
import { ToolContext, ToolType, Color, BLACK, WHITE, colorsEqual } from '../models';

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

describe('EyedropperTool', () => {
  let tool: EyedropperTool;
  let layerData: Uint8ClampedArray;

  beforeEach(() => {
    tool = new EyedropperTool();
    layerData = makeLayerData(4, 4);
  });

  it('should have correct type and metadata', () => {
    expect(tool.type).toBe(ToolType.Eyedropper);
    expect(tool.label).toBe('Eyedropper');
  });

  describe('onPointerDown', () => {
    it('should call onColorPicked with the pixel color', () => {
      // Set pixel (1,1) to red
      const offset = (1 * 4 + 1) * 4;
      layerData[offset] = 255;
      layerData[offset + 1] = 0;
      layerData[offset + 2] = 0;
      layerData[offset + 3] = 255;

      let pickedColor: Color | null = null;
      let pickedSecondary = false;
      tool.onColorPicked = (color, isSecondary) => {
        pickedColor = color;
        pickedSecondary = isSecondary;
      };

      tool.onPointerDown(makeContext({ coord: { x: 1, y: 1 } }), layerData);
      expect(pickedColor).not.toBeNull();
      expect(pickedColor!.r).toBe(255);
      expect(pickedColor!.g).toBe(0);
      expect(pickedColor!.b).toBe(0);
      expect(pickedColor!.a).toBe(255);
      expect(pickedSecondary).toBe(false);
    });

    it('should pass isSecondary flag correctly', () => {
      let receivedSecondary = false;
      tool.onColorPicked = (_color, isSecondary) => {
        receivedSecondary = isSecondary;
      };

      tool.onPointerDown(makeContext({ coord: { x: 0, y: 0 }, isSecondary: true }), layerData);
      expect(receivedSecondary).toBe(true);
    });

    it('should always return null (never modifies pixels)', () => {
      tool.onColorPicked = () => {};
      const result = tool.onPointerDown(makeContext(), layerData);
      expect(result).toBeNull();
    });

    it('should not throw when onColorPicked is null', () => {
      tool.onColorPicked = null;
      expect(() => {
        tool.onPointerDown(makeContext(), layerData);
      }).not.toThrow();
    });
  });

  describe('onPointerMove', () => {
    it('should call onColorPicked for live preview', () => {
      let callCount = 0;
      tool.onColorPicked = () => {
        callCount++;
      };

      tool.onPointerMove(makeContext({ coord: { x: 0, y: 0 } }), layerData);
      tool.onPointerMove(makeContext({ coord: { x: 1, y: 0 } }), layerData);
      expect(callCount).toBe(2);
    });

    it('should always return null', () => {
      tool.onColorPicked = () => {};
      const result = tool.onPointerMove(makeContext(), layerData);
      expect(result).toBeNull();
    });
  });

  describe('onPointerUp', () => {
    it('should return null', () => {
      const result = tool.onPointerUp(makeContext(), layerData);
      expect(result).toBeNull();
    });

    it('should not call onColorPicked', () => {
      let called = false;
      tool.onColorPicked = () => {
        called = true;
      };
      tool.onPointerUp(makeContext(), layerData);
      expect(called).toBe(false);
    });
  });

  describe('color accuracy', () => {
    it('should read correct RGBA from exact buffer position', () => {
      // Set pixel (2, 3) to a specific color
      const offset = (3 * 4 + 2) * 4;
      layerData[offset] = 12;
      layerData[offset + 1] = 34;
      layerData[offset + 2] = 56;
      layerData[offset + 3] = 78;

      let pickedColor: Color | null = null;
      tool.onColorPicked = (color) => {
        pickedColor = color;
      };

      tool.onPointerDown(makeContext({ coord: { x: 2, y: 3 } }), layerData);
      expect(pickedColor).toEqual({ r: 12, g: 34, b: 56, a: 78 });
    });
  });
});
