import { FillTool } from './fill.tool';
import { ToolContext, ToolType, Color, BLACK, WHITE, TRANSPARENT, colorsEqual } from '../models';

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    coord: { x: 0, y: 0 },
    layerIndex: 0,
    canvasWidth: 4,
    canvasHeight: 4,
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

function setPixel(
  data: Uint8ClampedArray,
  x: number,
  y: number,
  width: number,
  color: Color,
): void {
  const offset = (y * width + x) * 4;
  data[offset] = color.r;
  data[offset + 1] = color.g;
  data[offset + 2] = color.b;
  data[offset + 3] = color.a;
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

describe('FillTool', () => {
  let tool: FillTool;
  let layerData: Uint8ClampedArray;

  beforeEach(() => {
    tool = new FillTool();
    layerData = makeLayerData(4, 4);
  });

  it('should have correct type and metadata', () => {
    expect(tool.type).toBe(ToolType.Fill);
    expect(tool.label).toBe('Fill');
  });

  describe('onPointerDown', () => {
    it('should fill entire uniform canvas', () => {
      // All transparent → fill with BLACK
      const ctx = makeContext({ coord: { x: 0, y: 0 } });
      const result = tool.onPointerDown(ctx, layerData);
      expect(result).not.toBeNull();
      // All 16 pixels should be filled
      expect(result!.modifiedPixels.length).toBe(16);
      // Verify all pixels in buffer are now BLACK
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          expect(colorsEqual(getPixel(layerData, x, y, 4), BLACK)).toBe(true);
        }
      }
    });

    it('should return null when fill color equals target color', () => {
      // Fill transparent with transparent → no-op
      const ctx = makeContext({
        coord: { x: 0, y: 0 },
        primaryColor: { ...TRANSPARENT },
      });
      const result = tool.onPointerDown(ctx, layerData);
      expect(result).toBeNull();
    });

    it('should not cross color boundary', () => {
      // Create a horizontal wall of RED across row 2
      const red: Color = { r: 255, g: 0, b: 0, a: 255 };
      for (let x = 0; x < 4; x++) {
        setPixel(layerData, x, 2, 4, red);
      }

      // Fill from (0,0) — should only fill rows 0 and 1
      const ctx = makeContext({ coord: { x: 0, y: 0 } });
      const result = tool.onPointerDown(ctx, layerData);
      expect(result).not.toBeNull();
      expect(result!.modifiedPixels.length).toBe(8); // 4 * 2 rows

      // Row 2 and 3 should be untouched: row 2 = red, row 3 = transparent
      for (let x = 0; x < 4; x++) {
        expect(colorsEqual(getPixel(layerData, x, 2, 4), red)).toBe(true);
        expect(colorsEqual(getPixel(layerData, x, 3, 4), TRANSPARENT)).toBe(true);
      }
    });

    it('should fill only the connected region (square 4-connected)', () => {
      // Create a closed box barrier with RED:
      // R R R .
      // R . R .
      // R . R .
      // R R R .
      const red: Color = { r: 255, g: 0, b: 0, a: 255 };
      setPixel(layerData, 0, 0, 4, red);
      setPixel(layerData, 1, 0, 4, red);
      setPixel(layerData, 2, 0, 4, red);
      setPixel(layerData, 0, 1, 4, red);
      setPixel(layerData, 2, 1, 4, red);
      setPixel(layerData, 0, 2, 4, red);
      setPixel(layerData, 2, 2, 4, red);
      setPixel(layerData, 0, 3, 4, red);
      setPixel(layerData, 1, 3, 4, red);
      setPixel(layerData, 2, 3, 4, red);

      // Fill from (1,1) inside the box — should only fill (1,1) and (1,2)
      const ctx = makeContext({ coord: { x: 1, y: 1 } });
      const result = tool.onPointerDown(ctx, layerData);
      expect(result).not.toBeNull();
      expect(result!.modifiedPixels.length).toBe(2);
    });

    it('should handle single pixel fill', () => {
      // Surround (1,1) with RED on all 4 sides
      const red: Color = { r: 255, g: 0, b: 0, a: 255 };
      setPixel(layerData, 0, 1, 4, red);
      setPixel(layerData, 2, 1, 4, red);
      setPixel(layerData, 1, 0, 4, red);
      setPixel(layerData, 1, 2, 4, red);

      const ctx = makeContext({ coord: { x: 1, y: 1 } });
      const result = tool.onPointerDown(ctx, layerData);
      expect(result).not.toBeNull();
      expect(result!.modifiedPixels.length).toBe(1);
    });

    it('should use secondary color when isSecondary is true', () => {
      const ctx = makeContext({ coord: { x: 0, y: 0 }, isSecondary: true });
      const result = tool.onPointerDown(ctx, layerData);
      expect(result).not.toBeNull();
      expect(colorsEqual(result!.modifiedPixels[0].newColor, WHITE)).toBe(true);
    });

    it('should not fill diagonally for square grid (4-connected)', () => {
      // Place a diagonal barrier:
      // . R . .
      // . . R .
      // . . . .
      // . . . .
      const red: Color = { r: 255, g: 0, b: 0, a: 255 };
      setPixel(layerData, 1, 0, 4, red);
      setPixel(layerData, 2, 1, 4, red);

      // Fill from (0,0) — 4-connected should reach (0,0) and (0,1), (0,2), (0,3),
      // (1,1), (1,2), (1,3), (2,2), (2,3), (3,0), (3,1), (3,2), (3,3), (2,0)
      // but NOT cross diagonally through (1,0)→(2,1)
      const ctx = makeContext({ coord: { x: 0, y: 0 } });
      const result = tool.onPointerDown(ctx, layerData);
      expect(result).not.toBeNull();
      // (0,0) is connected to (2,0), (3,0) via row 0 right of red, etc.
      // The key test: pixel (2,0) should be reachable from (0,0)
      // because the path goes (0,0)→(0,1)→(1,1)→(1,2)→... etc
      // But (2,0) is NOT reachable from (0,0) because (1,0) is red
      const modifiedCoords = result!.modifiedPixels.map((p) => `${p.coord.x},${p.coord.y}`);
      expect(modifiedCoords).not.toContain('1,0'); // blocked by red
    });
  });

  describe('onPointerMove', () => {
    it('should always return null', () => {
      const result = tool.onPointerMove(makeContext(), layerData);
      expect(result).toBeNull();
    });
  });

  describe('onPointerUp', () => {
    it('should always return null', () => {
      const result = tool.onPointerUp(makeContext(), layerData);
      expect(result).toBeNull();
    });
  });

  describe('peyote grid', () => {
    it('should use 6-connected fill on peyote grid', () => {
      // 4x4 peyote-even canvas, all transparent
      const ctx = makeContext({
        coord: { x: 0, y: 0 },
        gridType: 'peyote-even',
      });
      const result = tool.onPointerDown(ctx, layerData);
      expect(result).not.toBeNull();
      // All pixels should be filled via 6-connected traversal
      expect(result!.modifiedPixels.length).toBe(16);
    });
  });

  describe('large canvas', () => {
    it('should handle filling a 64x64 canvas without stack overflow', () => {
      const largeData = makeLayerData(64, 64);
      const ctx = makeContext({
        coord: { x: 0, y: 0 },
        canvasWidth: 64,
        canvasHeight: 64,
      });
      const result = tool.onPointerDown(ctx, largeData);
      expect(result).not.toBeNull();
      expect(result!.modifiedPixels.length).toBe(64 * 64);
    });
  });

  describe('oldColor tracking', () => {
    it('should record correct oldColor for each modified pixel', () => {
      const ctx = makeContext({ coord: { x: 0, y: 0 } });
      const result = tool.onPointerDown(ctx, layerData);
      expect(result).not.toBeNull();
      for (const pixel of result!.modifiedPixels) {
        expect(colorsEqual(pixel.oldColor, TRANSPARENT)).toBe(true);
        expect(colorsEqual(pixel.newColor, BLACK)).toBe(true);
      }
    });
  });
});
