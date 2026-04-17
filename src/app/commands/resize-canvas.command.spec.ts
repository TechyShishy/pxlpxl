import { TestBed } from '@angular/core/testing';
import { ResizeCanvasCommand, computeResizedBuffer } from './resize-canvas.command';
import type { ResizeAnchor, ResizeDimensions } from './resize-canvas.command';
import { CanvasStateService } from '../services/canvas-state.service';
import { LayerService } from '../services/layer.service';

// ── helpers ────────────────────────────────────────────────────────────

/** Build a 4×4 square Uint8ClampedArray with one red pixel at (px, py). */
function makeSquareBuffer(
  w: number,
  h: number,
  red: { x: number; y: number },
): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 4);
  const offset = (red.y * w + red.x) * 4;
  buf[offset] = 255;   // R
  buf[offset + 1] = 0; // G
  buf[offset + 2] = 0; // B
  buf[offset + 3] = 255; // A
  return buf;
}

/** Return the RGBA tuple at (x, y) in a square/peyote buffer. */
function pixelAt(buf: Uint8ClampedArray, x: number, y: number, w: number): [number, number, number, number] {
  const off = (y * w + x) * 4;
  return [buf[off], buf[off + 1], buf[off + 2], buf[off + 3]];
}

const squareDim4: ResizeDimensions = { width: 4, height: 4, gridType: 'square' };
const squareDim6: ResizeDimensions = { width: 6, height: 6, gridType: 'square' };
const squareDim2: ResizeDimensions = { width: 2, height: 2, gridType: 'square' };

const topLeft: ResizeAnchor = { h: 0, v: 0 };
const center: ResizeAnchor = { h: 1, v: 1 };
const bottomRight: ResizeAnchor = { h: 2, v: 2 };

// ── computeResizedBuffer ───────────────────────────────────────────────

describe('computeResizedBuffer', () => {
  describe('square grid — expand', () => {
    it('preserves content at (0,0) with TL anchor', () => {
      const old = makeSquareBuffer(4, 4, { x: 0, y: 0 });
      const result = computeResizedBuffer(old, squareDim4, squareDim6, topLeft);
      expect(pixelAt(result, 0, 0, 6)).toEqual([255, 0, 0, 255]);
      expect(pixelAt(result, 5, 5, 6)).toEqual([0, 0, 0, 0]);
    });

    it('centers old content with center anchor', () => {
      // Red pixel at (0,0) in old 4×4 — with center anchor into 6×6, dy=1, dx=1
      // old (0,0) → new (1,1)
      const old = makeSquareBuffer(4, 4, { x: 0, y: 0 });
      const result = computeResizedBuffer(old, squareDim4, squareDim6, center);
      expect(pixelAt(result, 1, 1, 6)).toEqual([255, 0, 0, 255]);
      // New (0,0) should be transparent (outside padded region)
      expect(pixelAt(result, 0, 0, 6)).toEqual([0, 0, 0, 0]);
    });

    it('places content in BR with BR anchor on expand', () => {
      // old (0,0) → new (2,2) when expanding 4→6 with br anchor (dy=2, dx=2)
      const old = makeSquareBuffer(4, 4, { x: 0, y: 0 });
      const result = computeResizedBuffer(old, squareDim4, squareDim6, bottomRight);
      expect(pixelAt(result, 2, 2, 6)).toEqual([255, 0, 0, 255]);
      // (0,0) of new canvas is outside old covered area → transparent
      expect(pixelAt(result, 0, 0, 6)).toEqual([0, 0, 0, 0]);
    });
  });

  describe('square grid — shrink', () => {
    it('keeps TL region with TL anchor', () => {
      // Red at (1,1) in 4×4; shrink to 2×2 with TL anchor: (1,1) is within 2×2 bounds
      const old = makeSquareBuffer(4, 4, { x: 1, y: 1 });
      const result = computeResizedBuffer(old, squareDim4, squareDim2, topLeft);
      expect(pixelAt(result, 1, 1, 2)).toEqual([255, 0, 0, 255]);
    });

    it('discards content outside BR with BR anchor on shrink', () => {
      // Shrink 4×4 → 2×2 with BR anchor: dy=2, dx=2 → old origin is at new(-2,-2)
      // Red at (0,0) old: new coords = (0-2, 0-2) = (-2,-2) — outside new canvas
      const old = makeSquareBuffer(4, 4, { x: 0, y: 0 });
      const result = computeResizedBuffer(old, squareDim4, squareDim2, bottomRight);
      // (0,0) should be transparent — the old (0,0) is out of the new 2×2 window
      expect(pixelAt(result, 0, 0, 2)).toEqual([0, 0, 0, 0]);
      // Old (2,2) → new (0,0) (should be transparent in original empty buffer, i.e. 0)
      expect(pixelAt(result, 0, 0, 2)).toEqual([0, 0, 0, 0]);
    });

    it('captures BR region with BR anchor', () => {
      // Red at (3,3) in 4×4; shrink to 2×2 with BR anchor: old (3,3) → new(1,1)
      const old = makeSquareBuffer(4, 4, { x: 3, y: 3 });
      const result = computeResizedBuffer(old, squareDim4, squareDim2, bottomRight);
      expect(pixelAt(result, 1, 1, 2)).toEqual([255, 0, 0, 255]);
    });
  });

  describe('triangular grid — row-count change', () => {
    const triDimA1R4: ResizeDimensions = {
      width: 7, height: 4, gridType: 'triangular',
      triangularA: 1, triangularDNum: 2, triangularDDen: 1, triangularShift: 0,
    };
    const triDimA1R6: ResizeDimensions = {
      width: 9, height: 6, gridType: 'triangular',
      triangularA: 1, triangularDNum: 2, triangularDDen: 1, triangularShift: 0,
    };

    it('increases row count with top anchor — old row 0 maps to new row 0', () => {
      // Build a 4-row triangular buffer with a red pixel at (0, 0) (row 0, col 0)
      // Row widths (a=1, dNum=2, dDen=1): row0=1, row1=3, row2=5, row3=7
      // Total pixels: 1+3+5+7 = 16; pixel at (0,0) is at byte offset 0
      const oldBuf = new Uint8ClampedArray(16 * 4);
      oldBuf[0] = 255; oldBuf[1] = 0; oldBuf[2] = 0; oldBuf[3] = 255; // (0,0) red

      const result = computeResizedBuffer(oldBuf, triDimA1R4, triDimA1R6, topLeft);

      // New row 0 (same as old row 0) — offset 0 — should still be red
      expect(result[0]).toBe(255);
      expect(result[3]).toBe(255);
    });

    it('new rows beyond old row count are transparent', () => {
      const oldBuf = new Uint8ClampedArray(16 * 4); // all zeros = transparent
      const result = computeResizedBuffer(oldBuf, triDimA1R4, triDimA1R6, topLeft);

      // New rows 4 and 5 did not exist in old buffer; bytes should remain 0
      // Row 4 starts at pixel offset = triangularCumPixels(4, 1, 2, 1, 0) = 1+3+5+7 = 16
      // byte offset = 16 * 4 = 64
      expect(result[64]).toBe(0);
      expect(result[67]).toBe(0); // alpha of first pixel in row 4
    });
  });

  describe('triangular grid — triangularA change', () => {
    const triDimA1R4: ResizeDimensions = {
      width: 7, height: 4, gridType: 'triangular',
      triangularA: 1, triangularDNum: 2, triangularDDen: 1, triangularShift: 0,
    };
    const triDimA3R4: ResizeDimensions = {
      width: 9, height: 4, gridType: 'triangular',
      triangularA: 3, triangularDNum: 2, triangularDDen: 1, triangularShift: 0,
    };

    it('left-anchors row content when triangularA grows', () => {
      // Old row 0 (a=1): 1 pixel at col 0 = red
      // New row 0 (a=3): 3 pixels — with left anchor col 0 of new = col 0 of old
      const oldBuf = new Uint8ClampedArray(16 * 4);
      oldBuf[0] = 255; oldBuf[3] = 255; // (0,0) red

      const result = computeResizedBuffer(oldBuf, triDimA1R4, triDimA3R4, topLeft);

      // New row 0 starts at offset 0; old (0,0) should land at new (0,0)
      expect(result[0]).toBe(255);
      expect(result[3]).toBe(255);
    });
  });
});

// ── ResizeCanvasCommand ────────────────────────────────────────────────

describe('ResizeCanvasCommand', () => {
  let canvasState: CanvasStateService;
  let layerService: LayerService;

  function makeCommand(
    oldDim: ResizeDimensions,
    newDim: ResizeDimensions,
    anchor: ResizeAnchor,
  ): ResizeCanvasCommand {
    return new ResizeCanvasCommand(canvasState, layerService, oldDim, newDim, anchor);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({});
    canvasState = TestBed.inject(CanvasStateService);
    layerService = TestBed.inject(LayerService);

    // Initialize a 4×4 canvas with one layer
    canvasState.setCanvasSize(4, 4);
    layerService.initLayers(4, 4);
  });

  it('execute() updates canvasState dimensions', () => {
    const cmd = makeCommand(squareDim4, squareDim6, topLeft);
    cmd.execute();
    expect(canvasState.canvasWidth()).toBe(6);
    expect(canvasState.canvasHeight()).toBe(6);
  });

  it('execute() replaces layer buffer to new size', () => {
    const cmd = makeCommand(squareDim4, squareDim6, topLeft);
    cmd.execute();
    expect(layerService.layers()[0].data.length).toBe(6 * 6 * 4);
  });

  it('undo() restores original canvasState dimensions', () => {
    const cmd = makeCommand(squareDim4, squareDim6, topLeft);
    cmd.execute();
    cmd.undo();
    expect(canvasState.canvasWidth()).toBe(4);
    expect(canvasState.canvasHeight()).toBe(4);
  });

  it('undo() restores original layer buffer size', () => {
    const cmd = makeCommand(squareDim4, squareDim6, topLeft);
    cmd.execute();
    cmd.undo();
    expect(layerService.layers()[0].data.length).toBe(4 * 4 * 4);
  });

  it('undo() restores original pixel data', () => {
    // Put a red pixel at (1,1)
    const data = layerService.layers()[0].data;
    const off = (1 * 4 + 1) * 4;
    data[off] = 255; data[off + 3] = 255;

    const cmd = makeCommand(squareDim4, squareDim6, topLeft);
    cmd.execute();
    cmd.undo();

    const restored = layerService.layers()[0].data;
    const restOff = (1 * 4 + 1) * 4;
    expect(restored[restOff]).toBe(255);
    expect(restored[restOff + 3]).toBe(255);
  });

  it('execute → undo → execute (redo) round-trip is stable', () => {
    const cmd = makeCommand(squareDim4, squareDim6, center);
    cmd.execute();
    cmd.undo();
    cmd.execute();

    expect(canvasState.canvasWidth()).toBe(6);
    expect(canvasState.canvasHeight()).toBe(6);
    expect(layerService.layers()[0].data.length).toBe(6 * 6 * 4);
  });

  it('pixel content is preserved through undo/redo cycle with center anchor', () => {
    // Red at (0,0) in old 4×4; with center anchor into 6×6 → lands at (1,1)
    const data = layerService.layers()[0].data;
    data[0] = 255; data[3] = 255;

    const cmd = makeCommand(squareDim4, squareDim6, center);
    cmd.execute();

    // After execute, red pixel should be at new (1,1)
    const after = layerService.layers()[0].data;
    const newOff = (1 * 6 + 1) * 4;
    expect(after[newOff]).toBe(255);
    expect(after[newOff + 3]).toBe(255);

    cmd.undo();

    // After undo, red pixel back at (0,0)
    const reverted = layerService.layers()[0].data;
    expect(reverted[0]).toBe(255);
    expect(reverted[3]).toBe(255);
  });

  it('execute() and undo() restore triangularD from each dimension descriptor', () => {
    // Regression test: _applyDimensions must read dim.triangularD (the legacy integer
    // step parameter), not dim.triangularDNum. The bug passed triangularDNum as the
    // second argument to setTriangularParams, so leaving triangularD at its default.
    const oldTriDim: ResizeDimensions = {
      width: 4, height: 2, gridType: 'triangular',
      triangularA: 1, triangularD: 3,
      // No dNum/dDen — legacy integer-d mode
    };
    const newTriDim: ResizeDimensions = {
      width: 4, height: 2, gridType: 'triangular',
      triangularA: 1, triangularD: 7,
    };
    // Use fromSerialized to bypass computeResizedBuffer and supply pre-baked buffers.
    const emptyBuf = new Uint8ClampedArray(4 * 2 * 4);
    const cmd = ResizeCanvasCommand.fromSerialized(
      canvasState, layerService,
      oldTriDim, newTriDim,
      [emptyBuf.slice()], [emptyBuf.slice()],
      'test',
    );

    cmd.execute();
    expect(canvasState.triangularD()).toBe(7);

    cmd.undo();
    expect(canvasState.triangularD()).toBe(3);
  });
});
