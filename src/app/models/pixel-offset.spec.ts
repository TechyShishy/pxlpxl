import { pixelOffset } from './pixel-offset';

describe('pixelOffset', () => {
  describe('square grid (default)', () => {
    it('should compute row-major offset for (0, 0)', () => {
      expect(pixelOffset(0, 0, 8)).toBe(0);
    });

    it('should compute row-major offset for (1, 0)', () => {
      expect(pixelOffset(1, 0, 8)).toBe(4);
    });

    it('should compute row-major offset for (0, 1)', () => {
      expect(pixelOffset(0, 1, 8)).toBe(32); // 1 * 8 * 4 = 32
    });

    it('should compute correct offset for interior pixel', () => {
      // (3, 5) in 8-wide buffer: (5 * 8 + 3) * 4 = 172
      expect(pixelOffset(3, 5, 8)).toBe(172);
    });

    it('should compute correct offset for last pixel', () => {
      // (7, 7) in 8-wide buffer: (7 * 8 + 7) * 4 = 252
      expect(pixelOffset(7, 7, 8)).toBe(252);
    });

    it('should work with explicit square gridType', () => {
      expect(pixelOffset(3, 5, 8, 'square')).toBe(172);
    });

    it('should work with peyote gridType (same formula)', () => {
      expect(pixelOffset(3, 5, 8, 'peyote')).toBe(172);
    });
  });

  describe('triangular grid', () => {
    // With a=1, d=2, R=4: row widths are 1, 3, 5, 7 (total pixels = 16)
    // Row 0: pixels 0..0 → offset 0
    // Row 1: pixels 0..2 → offsets 4, 8, 12
    // Row 2: pixels 0..4 → offsets 16, 20, 24, 28, 32
    // Row 3: pixels 0..6 → offsets 36, 40, 44, 48, 52, 56, 60

    it('should compute offset for (0, 0) with a=1, d=2', () => {
      // (1*0 + 2*0*(0-1)/2 + 0) * 4 = 0
      expect(pixelOffset(0, 0, 0, 'triangular', 1, 2)).toBe(0);
    });

    it('should compute offset for (0, 1) with a=1, d=2', () => {
      // (1*1 + 2*1*(1-1)/2 + 0) * 4 = (1 + 0 + 0) * 4 = 4
      expect(pixelOffset(0, 1, 0, 'triangular', 1, 2)).toBe(4);
    });

    it('should compute offset for (2, 1) with a=1, d=2', () => {
      // (1*1 + 2*1*0/2 + 2) * 4 = (1 + 0 + 2) * 4 = 12
      expect(pixelOffset(2, 1, 0, 'triangular', 1, 2)).toBe(12);
    });

    it('should compute offset for (0, 2) with a=1, d=2', () => {
      // (1*2 + 2*2*(2-1)/2 + 0) * 4 = (2 + 2 + 0) * 4 = 16
      expect(pixelOffset(0, 2, 0, 'triangular', 1, 2)).toBe(16);
    });

    it('should compute offset for (4, 2) with a=1, d=2', () => {
      // (1*2 + 2*2*1/2 + 4) * 4 = (2 + 2 + 4) * 4 = 32
      expect(pixelOffset(4, 2, 0, 'triangular', 1, 2)).toBe(32);
    });

    it('should compute offset for (0, 3) with a=1, d=2', () => {
      // (1*3 + 2*3*(3-1)/2 + 0) * 4 = (3 + 6 + 0) * 4 = 36
      expect(pixelOffset(0, 3, 0, 'triangular', 1, 2)).toBe(36);
    });

    it('should compute offset for (6, 3) with a=1, d=2', () => {
      // (1*3 + 2*3*2/2 + 6) * 4 = (3 + 6 + 6) * 4 = 60
      expect(pixelOffset(6, 3, 0, 'triangular', 1, 2)).toBe(60);
    });

    // With a=3, d=1, R=4: row widths are 3, 4, 5, 6 (total pixels = 18)
    it('should compute offset for (0, 2) with a=3, d=1', () => {
      // (3*2 + 1*2*(2-1)/2 + 0) * 4 = (6 + 1 + 0) * 4 = 28
      expect(pixelOffset(0, 2, 0, 'triangular', 3, 1)).toBe(28);
    });

    it('should compute offset for (3, 1) with a=3, d=1', () => {
      // (3*1 + 1*1*0/2 + 3) * 4 = (3 + 0 + 3) * 4 = 24
      expect(pixelOffset(3, 1, 0, 'triangular', 3, 1)).toBe(24);
    });

    it('should ignore bufferWidth when triangular', () => {
      // bufferWidth doesn't matter for triangular
      const offset1 = pixelOffset(2, 1, 0, 'triangular', 1, 2);
      const offset2 = pixelOffset(2, 1, 999, 'triangular', 1, 2);
      expect(offset1).toBe(offset2);
    });

    it('should fall back to row-major when triangularA is undefined', () => {
      expect(pixelOffset(3, 5, 8, 'triangular')).toBe(172);
    });

    it('should use default d=2 (dNum=2, dDen=1) when triangularD is undefined', () => {
      // a=1, default dNum=2, dDen=1 → rows: 1,3,5,7,9 → cumPixels(5)=25, +3 → 112
      expect(pixelOffset(3, 5, 8, 'triangular', 1)).toBe(112);
    });
  });

  describe('triangular slow-growth grid (dNum < dDen)', () => {
    it('should compute offset for (0, 0) with a=1, dNum=1, dDen=2', () => {
      // cumPixels(0)=0, +0 → 0
      expect(pixelOffset(0, 0, 0, 'triangular', 1, undefined, 1, 2)).toBe(0);
    });

    it('should compute offset for (0, 1) with a=1, dNum=1, dDen=2', () => {
      // cumPixels(1)=1, +0 → 4
      expect(pixelOffset(0, 1, 0, 'triangular', 1, undefined, 1, 2)).toBe(4);
    });

    it('should compute offset for (0, 2) with a=1, dNum=1, dDen=2', () => {
      // shift=0: widths [1,0,...] → cumPixels(2)=1, +0 → 4
      expect(pixelOffset(0, 2, 0, 'triangular', 1, undefined, 1, 2)).toBe(4);
    });

    it('should compute offset for (1, 3) with a=1, dNum=1, dDen=2', () => {
      // shift=0: widths [1,0,1,...] → cumPixels(3)=2, +1 → (2+1)*4 = 12
      expect(pixelOffset(1, 3, 0, 'triangular', 1, undefined, 1, 2)).toBe(12);
    });

    it('should compute offset for (0, 9) with a=1, dNum=1, dDen=2 (last row, R=10)', () => {
      // shift=0: widths [1,0,1,2,1,2,3,2,3,...] → cumPixels(9)=15 → 60
      expect(pixelOffset(0, 9, 0, 'triangular', 1, undefined, 1, 2)).toBe(60);
    });

    it('should ignore bufferWidth when triangular', () => {
      const offset1 = pixelOffset(0, 2, 0, 'triangular', 1, undefined, 1, 2);
      const offset2 = pixelOffset(0, 2, 999, 'triangular', 1, undefined, 1, 2);
      expect(offset1).toBe(offset2);
    });

    it('should fall back to row-major when triangularA is undefined', () => {
      expect(pixelOffset(3, 5, 8, 'triangular')).toBe(172);
    });

    it('should compute offset for odd dDen (a=1, dNum=1, dDen=3)', () => {
      // shift=0: widths [1,0,0,0,1,...] → cumPixels(5)=2 → offset 8
      expect(pixelOffset(0, 5, 0, 'triangular', 1, undefined, 1, 3)).toBe(8);
      // row 5 = k=1,p=0, width=2; col=1 valid → (2+1)*4=12
      expect(pixelOffset(1, 5, 0, 'triangular', 1, undefined, 1, 3)).toBe(12);
    });
  });
});
