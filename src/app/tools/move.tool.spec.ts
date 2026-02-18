import { MoveTool } from './move.tool';
import { ToolContext, ToolType } from '../models';

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    coord: { x: 0, y: 0 },
    layerIndex: 0,
    canvasWidth: 4,
    canvasHeight: 4,
    primaryColor: { r: 0, g: 0, b: 0, a: 255 },
    secondaryColor: { r: 255, g: 255, b: 255, a: 255 },
    isSecondary: false,
    gridType: 'square',
    ...overrides,
  };
}

function makeLayerData(width: number, height: number): Uint8ClampedArray {
  return new Uint8ClampedArray(width * height * 4);
}

/** Fill a single pixel in the buffer at (x, y) with an RGBA color. */
function setPixel(
  data: Uint8ClampedArray,
  x: number,
  y: number,
  width: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  const offset = (y * width + x) * 4;
  data[offset] = r;
  data[offset + 1] = g;
  data[offset + 2] = b;
  data[offset + 3] = a;
}

/** Read a single pixel from the buffer at (x, y). */
function getPixel(
  data: Uint8ClampedArray,
  x: number,
  y: number,
  width: number,
): [number, number, number, number] {
  const offset = (y * width + x) * 4;
  return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
}

describe('MoveTool', () => {
  let tool: MoveTool;
  let layerData: Uint8ClampedArray;
  const W = 4;
  const H = 4;

  beforeEach(() => {
    tool = new MoveTool();
    layerData = makeLayerData(W, H);
  });

  it('should have correct type and metadata', () => {
    expect(tool.type).toBe(ToolType.Move);
    expect(tool.label).toBe('Move');
    expect(tool.cursor).toBe('move');
    expect(tool.icon).toBe('open_with');
  });

  describe('onPointerDown', () => {
    it('should return null', () => {
      const ctx = makeContext({ coord: { x: 1, y: 1 } });
      expect(tool.onPointerDown(ctx, layerData)).toBeNull();
    });

    it('should snapshot the layer data', () => {
      setPixel(layerData, 1, 1, W, 255, 0, 0, 255);
      const ctx = makeContext({ coord: { x: 0, y: 0 } });
      tool.onPointerDown(ctx, layerData);
      const snapshot = tool.getOriginalData();
      expect(snapshot).not.toBeNull();
      // Snapshot should match the buffer at the time of pointer-down
      expect(getPixel(snapshot!, 1, 1, W)).toEqual([255, 0, 0, 255]);
    });

    it('should not share a reference with the live buffer', () => {
      const ctx = makeContext({ coord: { x: 0, y: 0 } });
      tool.onPointerDown(ctx, layerData);
      // Mutate the live buffer after snapshot
      layerData[0] = 42;
      expect(tool.getOriginalData()![0]).toBe(0);
    });
  });

  describe('onPointerMove', () => {
    it('should return null', () => {
      const downCtx = makeContext({ coord: { x: 0, y: 0 } });
      tool.onPointerDown(downCtx, layerData);
      const moveCtx = makeContext({ coord: { x: 1, y: 0 } });
      expect(tool.onPointerMove(moveCtx, layerData)).toBeNull();
    });

    it('should shift pixels by (dx, dy) relative to start coord', () => {
      // Place a red pixel at (0, 0)
      setPixel(layerData, 0, 0, W, 255, 0, 0, 255);

      const downCtx = makeContext({ coord: { x: 0, y: 0 }, canvasWidth: W, canvasHeight: H });
      tool.onPointerDown(downCtx, layerData);

      // Drag to (2, 1) → dx=2, dy=1
      const moveCtx = makeContext({ coord: { x: 2, y: 1 }, canvasWidth: W, canvasHeight: H });
      tool.onPointerMove(moveCtx, layerData);

      // Red pixel should now be at (2, 1)
      expect(getPixel(layerData, 2, 1, W)).toEqual([255, 0, 0, 255]);
      // Original position should be transparent
      expect(getPixel(layerData, 0, 0, W)).toEqual([0, 0, 0, 0]);
    });

    it('should re-shift from original snapshot on each move (no drift)', () => {
      setPixel(layerData, 1, 1, W, 0, 255, 0, 255);

      const downCtx = makeContext({ coord: { x: 0, y: 0 }, canvasWidth: W, canvasHeight: H });
      tool.onPointerDown(downCtx, layerData);

      // First move: shift by (1, 0)
      tool.onPointerMove(
        makeContext({ coord: { x: 1, y: 0 }, canvasWidth: W, canvasHeight: H }),
        layerData,
      );
      // Second move: shift by (2, 0) — should be relative to start, not previous move
      tool.onPointerMove(
        makeContext({ coord: { x: 2, y: 0 }, canvasWidth: W, canvasHeight: H }),
        layerData,
      );

      // Green pixel originally at (1,1) should now be at (3,1) (dx=2)
      expect(getPixel(layerData, 3, 1, W)).toEqual([0, 255, 0, 255]);
      // Should NOT exist at (2,1) from the intermediate move
      expect(getPixel(layerData, 2, 1, W)).toEqual([0, 0, 0, 0]);
    });

    it('should clip pixels shifted off canvas edge (not wrap)', () => {
      // Pixel at right edge (3, 0)
      setPixel(layerData, 3, 0, W, 0, 0, 255, 255);

      const downCtx = makeContext({ coord: { x: 0, y: 0 }, canvasWidth: W, canvasHeight: H });
      tool.onPointerDown(downCtx, layerData);

      // Shift right by 2 → pixel would move to (5, 0), which is out of bounds
      tool.onPointerMove(
        makeContext({ coord: { x: 2, y: 0 }, canvasWidth: W, canvasHeight: H }),
        layerData,
      );

      // No pixel should exist beyond (3, *) — entire row should be transparent
      for (let x = 0; x < W; x++) {
        expect(getPixel(layerData, x, 0, W)[3]).toBe(0);
      }
    });

    it('should do nothing if pointer-down was not called first', () => {
      setPixel(layerData, 0, 0, W, 255, 0, 0, 255);
      const original = new Uint8ClampedArray(layerData);
      tool.onPointerMove(
        makeContext({ coord: { x: 1, y: 1 }, canvasWidth: W, canvasHeight: H }),
        layerData,
      );
      expect(Array.from(layerData)).toEqual(Array.from(original));
    });
  });

  describe('onPointerUp', () => {
    it('should apply the final shift', () => {
      setPixel(layerData, 0, 0, W, 100, 150, 200, 255);

      tool.onPointerDown(
        makeContext({ coord: { x: 0, y: 0 }, canvasWidth: W, canvasHeight: H }),
        layerData,
      );
      tool.onPointerUp(
        makeContext({ coord: { x: 1, y: 1 }, canvasWidth: W, canvasHeight: H }),
        layerData,
      );

      expect(getPixel(layerData, 1, 1, W)).toEqual([100, 150, 200, 255]);
      expect(getPixel(layerData, 0, 0, W)[3]).toBe(0);
    });

    it('should reset startCoord so subsequent moves have no effect', () => {
      tool.onPointerDown(
        makeContext({ coord: { x: 0, y: 0 }, canvasWidth: W, canvasHeight: H }),
        layerData,
      );
      tool.onPointerUp(
        makeContext({ coord: { x: 1, y: 0 }, canvasWidth: W, canvasHeight: H }),
        layerData,
      );
      const afterUp = new Uint8ClampedArray(layerData);

      // A move after up should be a no-op
      tool.onPointerMove(
        makeContext({ coord: { x: 3, y: 0 }, canvasWidth: W, canvasHeight: H }),
        layerData,
      );
      expect(Array.from(layerData)).toEqual(Array.from(afterUp));
    });

    it('should keep originalData accessible after pointer-up for LayerCommand creation', () => {
      setPixel(layerData, 2, 2, W, 10, 20, 30, 255);

      tool.onPointerDown(
        makeContext({ coord: { x: 0, y: 0 }, canvasWidth: W, canvasHeight: H }),
        layerData,
      );
      tool.onPointerUp(
        makeContext({ coord: { x: 1, y: 0 }, canvasWidth: W, canvasHeight: H }),
        layerData,
      );

      // Snapshot must still be readable (canvas-viewport reads it after onPointerUp)
      const snapshot = tool.getOriginalData();
      expect(snapshot).not.toBeNull();
      expect(getPixel(snapshot!, 2, 2, W)).toEqual([10, 20, 30, 255]);
    });

    it('should clear originalData after resetSnapshot()', () => {
      tool.onPointerDown(
        makeContext({ coord: { x: 0, y: 0 }, canvasWidth: W, canvasHeight: H }),
        layerData,
      );
      tool.onPointerUp(
        makeContext({ coord: { x: 0, y: 0 }, canvasWidth: W, canvasHeight: H }),
        layerData,
      );
      tool.resetSnapshot();
      expect(tool.getOriginalData()).toBeNull();
    });
  });
});
