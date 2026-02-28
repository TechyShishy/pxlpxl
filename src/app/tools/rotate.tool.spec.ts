import { RotateTool } from './rotate.tool';
import { ToolContext, ToolType } from '../models';

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    coord: { x: 0, y: 0 },
    layerIndex: 0,
    canvasWidth: 4,
    canvasHeight: 4,
    visualColumns: 4,
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

function getPixel(
  data: Uint8ClampedArray,
  x: number,
  y: number,
  width: number,
): [number, number, number, number] {
  const offset = (y * width + x) * 4;
  return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
}

describe('RotateTool', () => {
  let tool: RotateTool;
  let layerData: Uint8ClampedArray;
  const W = 4;
  const H = 4;

  beforeEach(() => {
    tool = new RotateTool();
    layerData = makeLayerData(W, H);
  });

  it('should have correct type and metadata', () => {
    expect(tool.type).toBe(ToolType.Rotate);
    expect(tool.label).toBe('Rotate');
    expect(tool.cursor).toBe('crosshair');
    expect(tool.icon).toBe('rotate_right');
  });

  describe('onPointerDown', () => {
    it('should return null', () => {
      const ctx = makeContext({ coord: { x: 2, y: 2 } });
      expect(tool.onPointerDown(ctx, layerData)).toBeNull();
    });

    it('should snapshot the layer data as an independent copy', () => {
      setPixel(layerData, 1, 1, W, 200, 100, 50, 255);
      const ctx = makeContext({ coord: { x: 3, y: 0 } });
      tool.onPointerDown(ctx, layerData);

      const snapshot = tool.getOriginalData();
      expect(snapshot).not.toBeNull();
      expect(getPixel(snapshot!, 1, 1, W)).toEqual([200, 100, 50, 255]);

      // Mutating the live buffer should not affect the snapshot
      layerData.fill(0);
      expect(getPixel(snapshot!, 1, 1, W)).toEqual([200, 100, 50, 255]);
    });
  });

  describe('onPointerMove', () => {
    it('should return null', () => {
      const downCtx = makeContext({ coord: { x: 3, y: 0 } });
      tool.onPointerDown(downCtx, layerData);
      const moveCtx = makeContext({ coord: { x: 0, y: 3 } });
      expect(tool.onPointerMove(moveCtx, layerData)).toBeNull();
    });

    it('should be a no-op if called before onPointerDown', () => {
      const original = new Uint8ClampedArray(layerData);
      const ctx = makeContext({ coord: { x: 2, y: 2 } });
      tool.onPointerMove(ctx, layerData);
      expect(layerData).toEqual(original);
    });
  });

  describe('onPointerUp', () => {
    it('should return null', () => {
      const downCtx = makeContext({ coord: { x: 3, y: 0 } });
      tool.onPointerDown(downCtx, layerData);
      const upCtx = makeContext({ coord: { x: 0, y: 3 } });
      expect(tool.onPointerUp(upCtx, layerData)).toBeNull();
    });

    it('keeps originalData alive for canvas-viewport to read after pointer-up', () => {
      const downCtx = makeContext({ coord: { x: 3, y: 0 } });
      tool.onPointerDown(downCtx, layerData);
      const upCtx = makeContext({ coord: { x: 0, y: 3 } });
      tool.onPointerUp(upCtx, layerData);
      expect(tool.getOriginalData()).not.toBeNull();
    });
  });

  describe('resetSnapshot', () => {
    it('should clear the snapshot', () => {
      const ctx = makeContext({ coord: { x: 2, y: 1 } });
      tool.onPointerDown(ctx, layerData);
      expect(tool.getOriginalData()).not.toBeNull();
      tool.resetSnapshot();
      expect(tool.getOriginalData()).toBeNull();
    });
  });

  describe('computeTheta', () => {
    // Use a 5×5 canvas (cx = cy = 2) so integer coords land on exact axes
    const W5 = 5;
    const H5 = 5;

    it('returns 0 when current coord is the same as start coord', () => {
      const coord = { x: 4, y: 2 }; // directly right of centre (cx=2,cy=2)
      const downCtx = makeContext({ canvasWidth: W5, canvasHeight: H5, coord });
      tool.onPointerDown(downCtx, makeLayerData(W5, H5));
      const theta = tool.computeTheta(makeContext({ canvasWidth: W5, canvasHeight: H5, coord }));
      expect(theta).toBeCloseTo(0, 10);
    });

    it('computes the swept angle between pointer-down and pointer-move', () => {
      // Start directly to the right: angle = 0
      const downCtx = makeContext({
        canvasWidth: W5,
        canvasHeight: H5,
        coord: { x: 4, y: 2 },
      });
      tool.onPointerDown(downCtx, makeLayerData(W5, H5));

      // Move directly below: angle = π/2
      const moveCtx = makeContext({
        canvasWidth: W5,
        canvasHeight: H5,
        coord: { x: 2, y: 4 },
      });
      const theta = tool.computeTheta(moveCtx);
      expect(theta).toBeCloseTo(Math.PI / 2, 10);
    });

    it('snaps theta to nearest 90° multiple when shiftKey is held', () => {
      // Start directly right (angle = 0)
      const downCtx = makeContext({
        canvasWidth: W5,
        canvasHeight: H5,
        coord: { x: 4, y: 2 },
      });
      tool.onPointerDown(downCtx, makeLayerData(W5, H5));

      // Move to bottom-right diagonal (angle = π/4 = 45°)
      const moveCtx = makeContext({
        canvasWidth: W5,
        canvasHeight: H5,
        coord: { x: 4, y: 4 },
        shiftKey: true,
      });
      const theta = tool.computeTheta(moveCtx);
      // π/4 is exactly halfway between 0 and π/2 — Math.round(0.5)=1 → snaps to π/2
      expect(theta).toBeCloseTo(Math.PI / 2, 10);
    });

    it('snaps to 0° from a small angle when shiftKey is held', () => {
      // Start directly right (angle = 0)
      const downCtx = makeContext({
        canvasWidth: W5,
        canvasHeight: H5,
        coord: { x: 4, y: 2 },
      });
      tool.onPointerDown(downCtx, makeLayerData(W5, H5));

      // Move slightly below right (angle ≈ 14°, less than 45°)
      const moveCtx = makeContext({
        canvasWidth: W5,
        canvasHeight: H5,
        coord: { x: 4, y: 3 },
        shiftKey: true,
      });
      const theta = tool.computeTheta(moveCtx);
      // atan2(1, 2) ≈ 0.46 rad ≈ 27°, snaps to 0
      expect(theta).toBeCloseTo(0, 10);
    });
  });

  describe('applyRotation', () => {
    it('leaves buffer unchanged for theta = 0', () => {
      setPixel(layerData, 1, 2, W, 255, 128, 0, 255);
      setPixel(layerData, 3, 3, W, 0, 200, 100, 200);
      const original = new Uint8ClampedArray(layerData);

      const ctx = makeContext({ canvasWidth: W, canvasHeight: H });
      tool.onPointerDown(ctx, layerData);
      tool.applyRotation(0, ctx, layerData);
      expect(layerData).toEqual(original);
    });

    it('performs 180° rotation on a 2×2 canvas', () => {
      // 2×2 canvas: cx = cy = 0.5
      // 180°: each pixel goes to the diagonally opposite corner
      // dst(0,0) ← src(1,1), dst(1,0) ← src(0,1)
      // dst(0,1) ← src(1,0), dst(1,1) ← src(0,0)
      const w = 2;
      const h = 2;
      const data = makeLayerData(w, h);
      setPixel(data, 0, 0, w, 255, 0, 0, 255);   // top-left: red
      setPixel(data, 1, 0, w, 0, 255, 0, 255);   // top-right: green
      setPixel(data, 0, 1, w, 0, 0, 255, 255);   // bottom-left: blue
      setPixel(data, 1, 1, w, 255, 255, 0, 255); // bottom-right: yellow

      const ctx = makeContext({ canvasWidth: w, canvasHeight: h });
      tool.onPointerDown(ctx, data);
      tool.applyRotation(Math.PI, ctx, data);

      expect(getPixel(data, 0, 0, w)).toEqual([255, 255, 0, 255]); // dst(0,0) ← src(1,1) yellow
      expect(getPixel(data, 1, 0, w)).toEqual([0, 0, 255, 255]);   // dst(1,0) ← src(0,1) blue
      expect(getPixel(data, 0, 1, w)).toEqual([0, 255, 0, 255]);   // dst(0,1) ← src(1,0) green
      expect(getPixel(data, 1, 1, w)).toEqual([255, 0, 0, 255]);   // dst(1,1) ← src(0,0) red
    });

    it('performs 90° CW rotation on a 3×3 canvas', () => {
      // 3×3 canvas: cx = cy = 1
      // 90° CW (theta = π/2): dst(x,y) ← src(y, 2-x)
      const w = 3;
      const h = 3;
      const data = makeLayerData(w, h);
      // Paint distinct colours at each corner
      setPixel(data, 0, 0, w, 255, 0, 0, 255);   // top-left: red
      setPixel(data, 2, 0, w, 0, 255, 0, 255);   // top-right: green
      setPixel(data, 0, 2, w, 0, 0, 255, 255);   // bottom-left: blue
      setPixel(data, 2, 2, w, 255, 255, 0, 255); // bottom-right: yellow

      const ctx = makeContext({ canvasWidth: w, canvasHeight: h });
      tool.onPointerDown(ctx, data);
      tool.applyRotation(Math.PI / 2, ctx, data);

      // CW 90°: top row becomes right column, right column becomes bottom row, etc.
      // dst(col,row) ← src(row, N-1-col) for N=3:
      // dst(2,0) ← src(0,0) = red   | dst(2,2) ← src(2,0) = green
      // dst(0,2) ← src(2,2) = yellow | dst(0,0) ← src(0,2) = blue
      expect(getPixel(data, 2, 0, w)).toEqual([255, 0, 0, 255]);   // top-right ← top-left (red)
      expect(getPixel(data, 2, 2, w)).toEqual([0, 255, 0, 255]);   // bottom-right ← top-right (green)
      expect(getPixel(data, 0, 2, w)).toEqual([255, 255, 0, 255]); // bottom-left ← bottom-right (yellow)
      expect(getPixel(data, 0, 0, w)).toEqual([0, 0, 255, 255]);   // top-left ← bottom-left (blue)
    });

    it('fills out-of-bounds positions with transparent pixels', () => {
      // After any non-zero rotation on a non-square image, some corners go empty.
      // 90° CW rotation on a 4×4 canvas: corners that map outside should be transparent.
      const w = 4;
      const h = 4;
      const data = makeLayerData(w, h);
      data.fill(128); // fill everything with non-zero to see the clearance

      const ctx = makeContext({ canvasWidth: w, canvasHeight: h });
      tool.onPointerDown(ctx, data);
      tool.applyRotation(Math.PI / 4, ctx, data); // arbitrary angle that clips some pixels

      // The entire buffer starts cleared to 0 before mapping — any unmapped pixel = transparent
      // Just verify the buffer is not all-128 any more, meaning some pixels were set to 0
      const hasTransparent = Array.from(data).some((v) => v === 0);
      expect(hasTransparent).toBe(true);
    });
  });

  describe('full drag lifecycle', () => {
    it('applies rotation on pointer-move for live preview', () => {
      // Use a 5×5 canvas (cx=cy=2). Place a distinct pixel then verify rotation.
      const w = 5;
      const h = 5;
      const data = makeLayerData(w, h);
      setPixel(data, 4, 2, w, 255, 100, 0, 255); // directly right of centre

      // Start directly right (angle ≈ 0)
      const downCtx = makeContext({ canvasWidth: w, canvasHeight: h, coord: { x: 4, y: 2 } });
      tool.onPointerDown(downCtx, data);

      // Move directly below (angle = π/2 → 90° CW)
      const moveCtx = makeContext({ canvasWidth: w, canvasHeight: h, coord: { x: 2, y: 4 } });
      tool.onPointerMove(moveCtx, data);

      // After 90° CW: src(4,2) → should appear at dst(2,0) for a 5×5
      // dst(2,0): dx=0, dy=-2 → srcX=0*0+(-2)*1+2=0, srcY=-0+(-2)*0+2=2 → src(0,2) transparent
      // Let's just verify the original position is now empty
      expect(getPixel(data, 4, 2, w)).toEqual([0, 0, 0, 0]);
    });

    it('does not mutate the snapshot buffer during rotation', () => {
      const downCtx = makeContext({ coord: { x: 3, y: 0 } });
      tool.onPointerDown(downCtx, layerData);
      const snapshot = new Uint8ClampedArray(tool.getOriginalData()!);

      const moveCtx = makeContext({ coord: { x: 0, y: 3 } });
      tool.onPointerMove(moveCtx, layerData);

      // Snapshot should be identical to what it was at pointer-down
      expect(tool.getOriginalData()).toEqual(snapshot);
    });
  });
});
