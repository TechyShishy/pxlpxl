import { describe, it, expect } from 'vitest';
import { byteOffsetToPixelCoord } from './buffer-coords';
import { pixelOffset } from '../models';

describe('byteOffsetToPixelCoord', () => {
  describe('square grid', () => {
    it('roundtrips pixelOffset for every pixel in a small buffer', () => {
      const w = 8;
      const h = 6;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const offset = pixelOffset(x, y, w, 'square');
          const coord = byteOffsetToPixelCoord(offset, w, 'square', h);
          expect(coord).toEqual({ x, y });
        }
      }
    });

    it('returns (0, 0) for offset 0', () => {
      expect(byteOffsetToPixelCoord(0, 10, 'square', 10)).toEqual({ x: 0, y: 0 });
    });

    it('returns (w-1, h-1) for the last pixel', () => {
      const w = 5;
      const h = 4;
      const lastOffset = (w * h - 1) * 4;
      expect(byteOffsetToPixelCoord(lastOffset, w, 'square', h)).toEqual({ x: w - 1, y: h - 1 });
    });
  });

  describe('peyote grid (same row-major layout as square)', () => {
    it('roundtrips pixelOffset for every pixel', () => {
      const w = 4;
      const h = 8;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const offset = pixelOffset(x, y, w, 'peyote');
          const coord = byteOffsetToPixelCoord(offset, w, 'peyote', h);
          expect(coord).toEqual({ x, y });
        }
      }
    });
  });

  describe('triangular grid (fast growth: dNum >= dDen)', () => {
    it('roundtrips pixelOffset for a 3-row triangular grid (a=1, dNum=1, dDen=1)', () => {
      // Row widths: row0=1, row1=2, row2=3
      const a = 1;
      const dNum = 1;
      const dDen = 1;
      const shift = 0;
      const bufferWidth = 3; // max row width
      const bufferHeight = 3;

      for (let y = 0; y < bufferHeight; y++) {
        const rowWidth = y + 1;
        for (let x = 0; x < rowWidth; x++) {
          const offset = pixelOffset(x, y, bufferWidth, 'triangular', a, 1, dNum, dDen, shift);
          const coord = byteOffsetToPixelCoord(offset, bufferWidth, 'triangular', bufferHeight, a, 1, dNum, dDen, shift);
          expect(coord).toEqual({ x, y });
        }
      }
    });

    it('roundtrips for a larger triangular grid (a=2, dNum=1, dDen=1)', () => {
      const a = 2;
      const dNum = 1;
      const dDen = 1;
      const shift = 0;
      const bufferHeight = 5;
      const bufferWidth = a + (bufferHeight - 1); // max row width

      for (let y = 0; y < bufferHeight; y++) {
        const rowWidth = a + y;
        for (let x = 0; x < rowWidth; x++) {
          const offset = pixelOffset(x, y, bufferWidth, 'triangular', a, 1, dNum, dDen, shift);
          const coord = byteOffsetToPixelCoord(offset, bufferWidth, 'triangular', bufferHeight, a, 1, dNum, dDen, shift);
          expect(coord).toEqual({ x, y });
        }
      }
    });
  });

  describe('triangular grid (slow growth: dNum < dDen)', () => {
    it('roundtrips for a triangular grid (a=4, dNum=1, dDen=2, shift=0)', () => {
      // Row widths cycle: L = 2*dDen - dNum = 3 rows per cycle
      // Row 0: base=4, Row 1: 4+1=5, Row 2: 4+1=5, Row 3: base+1=5, ...
      const a = 4;
      const dNum = 1;
      const dDen = 2;
      const shift = 0;
      const bufferHeight = 6;
      const bufferWidth = 6; // generous upper bound for max row width

      for (let y = 0; y < bufferHeight; y++) {
        // Compute row width via pixelOffset difference
        const start = pixelOffset(0, y, bufferWidth, 'triangular', a, undefined, dNum, dDen, shift);
        let end: number;
        if (y + 1 < bufferHeight) {
          end = pixelOffset(0, y + 1, bufferWidth, 'triangular', a, undefined, dNum, dDen, shift);
        } else {
          // last row: derive rowWidth from start
          end = start + 4; // just test x=0
        }
        const rowWidth = (end - start) / 4;
        for (let x = 0; x < rowWidth; x++) {
          const offset = pixelOffset(x, y, bufferWidth, 'triangular', a, undefined, dNum, dDen, shift);
          const coord = byteOffsetToPixelCoord(offset, bufferWidth, 'triangular', bufferHeight, a, undefined, dNum, dDen, shift);
          expect(coord).toEqual({ x, y });
        }
      }
    });
  });
});
