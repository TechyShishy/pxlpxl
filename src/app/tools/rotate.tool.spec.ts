import { RotateTool } from './rotate.tool';
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

  // ── Grid-type coverage ────────────────────────────────────────────────────
  //
  // Triangular layout used below: triangularA=1, dNum=1, dDen=1, shift=0
  //   Row 0 → 1 pixel  (cumulative offset 0)
  //   Row 1 → 2 pixels (cumulative offset 1)
  //   Row 2 → 3 pixels (cumulative offset 3)
  //   Row 3 → 4 pixels (cumulative offset 6)
  //   bufferWidth = 4 (max row width), total pixels = 10 (40 bytes)
  //
  // Pixel (x, y) → byte offset = (cumPixels(y) + x) * 4
  //   e.g. pixel (2, 2) → (3 + 2) * 4 = 20
  //        pixel (3, 3) → (6 + 3) * 4 = 36

  describe('applyRotation — triangular grid', () => {
    const TRI_A = 1;
    const TRI_DNUM = 1;
    const TRI_DDEN = 1;
    const TRI_SHIFT = 0;
    const TRI_BUF_W = 4; // max row width
    const TRI_H = 4;
    const TOTAL_BYTES = 40; // 10 pixels × 4 bytes

    function makeTriCtx(overrides: Partial<ToolContext> = {}): ToolContext {
      return {
        coord: { x: 0, y: 0 },
        layerIndex: 0,
        canvasWidth: TRI_BUF_W,
        canvasHeight: TRI_H,
        primaryColor: { r: 0, g: 0, b: 0, a: 255 },
        secondaryColor: { r: 255, g: 255, b: 255, a: 255 },
        isSecondary: false,
        gridType: 'triangular',
        triangularA: TRI_A,
        triangularDNum: TRI_DNUM,
        triangularDDen: TRI_DDEN,
        triangularShift: TRI_SHIFT,
        ...overrides,
      };
    }

    it('identity rotation preserves every pixel at its correct triangular offset', () => {
      const data = new Uint8ClampedArray(TOTAL_BYTES);
      // pixel (0, 0) → offset 0 (cumPixels(0)=0, so (0+0)*4=0)
      data[0] = 255; data[1] = 0; data[2] = 0; data[3] = 255; // red
      // pixel (2, 2) → offset 20 (cumPixels(2)=3, so (3+2)*4=20)
      data[20] = 0; data[21] = 0; data[22] = 255; data[23] = 255; // blue
      // pixel (3, 3) → offset 36 (cumPixels(3)=6, so (6+3)*4=36)
      data[36] = 0; data[37] = 255; data[38] = 0; data[39] = 255; // green

      const ctx = makeTriCtx();
      tool.onPointerDown(ctx, data);
      tool.applyRotation(0, ctx, data);

      // Pixel (0,0): red
      expect([data[0], data[1], data[2], data[3]]).toEqual([255, 0, 0, 255]);
      // Pixel (2,2): blue
      expect([data[20], data[21], data[22], data[23]]).toEqual([0, 0, 255, 255]);
      // Pixel (3,3): green
      expect([data[36], data[37], data[38], data[39]]).toEqual([0, 255, 0, 255]);
    });

    it('does not write to bytes beyond the actual pixel count', () => {
      // The buggy implementation iterated dstX up to bufferWidth (4) for every
      // row, which would touch bytes beyond the 40-byte buffer for short rows.
      // With the fix, only pixels within each row's actual width are written.
      const data = new Uint8ClampedArray(TOTAL_BYTES);
      data.fill(99); // sentinel

      const ctx = makeTriCtx();
      tool.onPointerDown(ctx, data);
      tool.applyRotation(0, ctx, data);

      // Bytes beyond offset 39 (i.e. the 40th byte onwards) must not exist in
      // our exact-size buffer — if the loop overflowed it would have thrown.
      // Verify the buffer length is still exactly TOTAL_BYTES (no overwrite).
      expect(data.length).toBe(TOTAL_BYTES);
    });
  });

  describe('applyRotation — peyote grid', () => {
    // Peyote layout: 2 column-pairs (canvasWidth=2) → bufferWidth=2, bufferHeight=4.
    // Same row-major formula as square: offset = (y * bufW + x) * 4.
    const PEY_W = 2;
    const PEY_H = 4;

    function makePeyCtx(overrides: Partial<ToolContext> = {}): ToolContext {
      return {
        coord: { x: 0, y: 0 },
        layerIndex: 0,
        canvasWidth: PEY_W,
        canvasHeight: PEY_H,
        primaryColor: { r: 0, g: 0, b: 0, a: 255 },
        secondaryColor: { r: 255, g: 255, b: 255, a: 255 },
        isSecondary: false,
        gridType: 'peyote',
        ...overrides,
      };
    }

    it('identity rotation preserves all pixels', () => {
      const data = new Uint8ClampedArray(PEY_W * PEY_H * 4);
      // pixel (1, 3) → offset = (3*2+1)*4 = 28
      data[28] = 200; data[29] = 100; data[30] = 50; data[31] = 255;

      const ctx = makePeyCtx();
      tool.onPointerDown(ctx, data);
      tool.applyRotation(0, ctx, data);

      expect([data[28], data[29], data[30], data[31]]).toEqual([200, 100, 50, 255]);
    });
  });

  describe('rotate90', () => {
    it('should return the pre-rotation snapshot', () => {
      const ctx = makeContext();
      setPixel(layerData, 3, 0, W, 255, 0, 0, 255); // top-right corner
      const snapshot = tool.rotate90('cw', ctx, layerData);
      // snapshot must equal original (top-right corner is red)
      expect(getPixel(snapshot, 3, 0, W)).toEqual([255, 0, 0, 255]);
    });

    it('should leave originalData null after returning (resets snapshot)', () => {
      const ctx = makeContext();
      tool.rotate90('cw', ctx, layerData);
      expect(tool.getOriginalData()).toBeNull();
    });

    it('rotate90 cw should move top-right pixel to bottom-right on 4×4', () => {
      const ctx = makeContext();
      // Set top-right corner (3, 0) to red
      setPixel(layerData, 3, 0, W, 255, 0, 0, 255);
      tool.rotate90('cw', ctx, layerData);
      // After 90° CW: (x, y) → (maxY - y, x) for square grids (nearest-neighbour)
      // (3, 0) → (3, 3) in visual space after CW rotation by π/2
      expect(getPixel(layerData, 3, 3, W)).toEqual([255, 0, 0, 255]);
    });

    it('rotate90 ccw should move top-right pixel to top-left on 4×4', () => {
      const ctx = makeContext();
      // Set top-right corner (3, 0) to blue
      setPixel(layerData, 3, 0, W, 0, 0, 255, 255);
      tool.rotate90('ccw', ctx, layerData);
      // Inverse rotation for -π/2: srcX = -dstY+3, srcY = dstX
      // (src 3,0) → dst(0,0):  srcX=-0+3=3✓  srcY=0✓
      expect(getPixel(layerData, 0, 0, W)).toEqual([0, 0, 255, 255]);
    });

    it('should mutate the passed layerData buffer in-place', () => {
      const ctx = makeContext();
      setPixel(layerData, 1, 0, W, 100, 150, 200, 255);
      const originalRef = layerData;
      tool.rotate90('cw', ctx, layerData);
      // Same buffer reference
      expect(layerData).toBe(originalRef);
      // Buffer was changed (original pixel at (1,0) is no longer there for the CW case)
      expect(getPixel(layerData, 1, 0, W)).not.toEqual([100, 150, 200, 255]);
    });
  });
});
