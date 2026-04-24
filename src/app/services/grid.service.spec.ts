import { GridService } from './grid.service';
import { GridType, PixelCoord } from '../models';

describe('GridService', () => {
  let service: GridService;

  beforeEach(() => {
    service = new GridService();
  });

  describe('bufferToVisual', () => {
    it('should map even buffer row to even visual column (UP)', () => {
      // bx=0, by=0 → col=0, beadRow=0
      expect(service.bufferToVisual(0, 0)).toEqual({ col: 0, beadRow: 0 });
    });

    it('should map odd buffer row to odd visual column (DOWN)', () => {
      // bx=0, by=1 → col=1, beadRow=0
      expect(service.bufferToVisual(0, 1)).toEqual({ col: 1, beadRow: 0 });
    });

    it('should compute beadRow as floor(by/2)', () => {
      expect(service.bufferToVisual(2, 4)).toEqual({ col: 4, beadRow: 2 });
      expect(service.bufferToVisual(2, 5)).toEqual({ col: 5, beadRow: 2 });
    });

    it('should handle higher bx values', () => {
      expect(service.bufferToVisual(3, 0)).toEqual({ col: 6, beadRow: 0 });
      expect(service.bufferToVisual(3, 1)).toEqual({ col: 7, beadRow: 0 });
    });
  });

  describe('visualToBuffer', () => {
    it('should map even visual column (UP) to even buffer row', () => {
      expect(service.visualToBuffer(0, 0)).toEqual({ bx: 0, by: 0 });
      expect(service.visualToBuffer(2, 3)).toEqual({ bx: 1, by: 6 });
    });

    it('should map odd visual column (DOWN) to odd buffer row', () => {
      expect(service.visualToBuffer(1, 0)).toEqual({ bx: 0, by: 1 });
      expect(service.visualToBuffer(3, 2)).toEqual({ bx: 1, by: 5 });
    });

    it('should round-trip with bufferToVisual', () => {
      for (let col = 0; col < 8; col++) {
        for (let beadRow = 0; beadRow < 4; beadRow++) {
          const { bx, by } = service.visualToBuffer(col, beadRow);
          const back = service.bufferToVisual(bx, by);
          expect(back).toEqual({ col, beadRow });
        }
      }
    });
  });

  describe('isValidPixel', () => {
    it('should return true for in-bounds pixel on square grid', () => {
      expect(service.isValidPixel(0, 0, 8, 8, 'square')).toBe(true);
      expect(service.isValidPixel(7, 7, 8, 8, 'square')).toBe(true);
    });

    it('should return false for negative x', () => {
      expect(service.isValidPixel(-1, 0, 8, 8, 'square')).toBe(false);
    });

    it('should return false for negative y', () => {
      expect(service.isValidPixel(0, -1, 8, 8, 'square')).toBe(false);
    });

    it('should return false for x >= width', () => {
      expect(service.isValidPixel(8, 0, 8, 8, 'square')).toBe(false);
    });

    it('should return false for y >= height', () => {
      expect(service.isValidPixel(0, 8, 8, 8, 'square')).toBe(false);
    });

    it('should accept valid peyote buffer coords', () => {
      // bufferWidth=4 → 8 visual sub-cols, bufferHeight=8 → 4 bead rows
      expect(service.isValidPixel(0, 0, 4, 8, 'peyote')).toBe(true);
      expect(service.isValidPixel(3, 7, 4, 8, 'peyote')).toBe(true);
    });

    it('should reject peyote coords out of buffer bounds', () => {
      expect(service.isValidPixel(4, 0, 4, 8, 'peyote')).toBe(false);
      expect(service.isValidPixel(0, 8, 4, 8, 'peyote')).toBe(false);
    });
  });

  describe('pixelToScreen', () => {
    it('should return bx*scale, by*scale for square grid', () => {
      const result = service.pixelToScreen(3, 5, { width: 10, height: 10 }, 'square');
      expect(result).toEqual({ sx: 30, sy: 50 });
    });

    it('should map peyote even buffer row to even visual column without offset', () => {
      // bx=0, by=0 → col=0 (even/UP), beadRow=0 → offsetY = 0
      const result = service.pixelToScreen(0, 0, { width: 10, height: 10 }, 'peyote');
      expect(result).toEqual({ sx: 0, sy: 0 });
    });

    it('should map peyote odd buffer row to odd visual column with half-bead offset', () => {
      // bx=0, by=1 → col=1 (odd/DOWN), beadRow=0 → offsetY = 5
      const result = service.pixelToScreen(0, 1, { width: 10, height: 10 }, 'peyote');
      expect(result).toEqual({ sx: 10, sy: 5 });
    });

    it('should compute correct screen position for higher buffer coords', () => {
      // bx=2, by=4 → col=4 (even/UP), beadRow=2 → offsetY = 0, sy = 2*10+0 = 20
      const result = service.pixelToScreen(2, 4, { width: 10, height: 10 }, 'peyote');
      expect(result).toEqual({ sx: 40, sy: 20 });
    });

    it('should apply offset for odd-column bead', () => {
      // bx=1, by=3 → col=3 (odd/DOWN), beadRow=1 → offsetY=5, sy = 1*10+5 = 15
      const result = service.pixelToScreen(1, 3, { width: 10, height: 10 }, 'peyote');
      expect(result).toEqual({ sx: 30, sy: 15 });
    });

    it('should handle scale of 1', () => {
      // bx=1, by=1 → col=3 (odd/DOWN), beadRow=0 → offsetY=0.5, sy=0.5
      const result = service.pixelToScreen(1, 1, { width: 1, height: 1 }, 'peyote');
      expect(result).toEqual({ sx: 3, sy: 0.5 });
    });
  });

  describe('screenToPixel', () => {
    it('should convert screen coords to pixel coords for square grid', () => {
      const result = service.screenToPixel(15, 25, { width: 10, height: 10 }, 8, 8, 'square');
      expect(result).toEqual({ x: 1, y: 2 });
    });

    it('should return null for out-of-bounds coordinates', () => {
      expect(service.screenToPixel(-5, 0, { width: 10, height: 10 }, 8, 8, 'square')).toBeNull();
      expect(service.screenToPixel(0, -5, { width: 10, height: 10 }, 8, 8, 'square')).toBeNull();
      expect(service.screenToPixel(80, 0, { width: 10, height: 10 }, 8, 8, 'square')).toBeNull();
      expect(service.screenToPixel(0, 80, { width: 10, height: 10 }, 8, 8, 'square')).toBeNull();
    });

    it('should map peyote screen position on even column to buffer coords', () => {
      // screen (0, 15) with scale=10 → col=0 (even/UP), effectiveY=15 (no offset), beadRow=1
      // visualToBuffer(0, 1) → bx=0, by=2
      const result = service.screenToPixel(0, 15, { width: 10, height: 10 }, 4, 8, 'peyote', 8);
      expect(result).toEqual({ x: 0, y: 2 });
    });

    it('should account for peyote odd-column half-bead offset', () => {
      // screen (10, 15) with scale=10 → col=1 (odd/DOWN), effectiveY=15-5=10, beadRow=1
      // visualToBuffer(1, 1) → bx=0, by=3
      const result = service.screenToPixel(10, 15, { width: 10, height: 10 }, 4, 8, 'peyote', 8);
      expect(result).toEqual({ x: 0, y: 3 });
    });

    it('should return null for peyote click above the odd column', () => {
      // screen (10, 2) with scale=10 → col=1 (odd/DOWN), effectiveY=2-5=-3, beadRow=-1
      const result = service.screenToPixel(10, 2, { width: 10, height: 10 }, 4, 8, 'peyote', 8);
      expect(result).toBeNull();
    });

    it('should return null for peyote click beyond visual columns', () => {
      // bufferWidth=4 → visCols=8, click at x=80 → col=8 which is out of range
      const result = service.screenToPixel(80, 0, { width: 10, height: 10 }, 4, 8, 'peyote');
      expect(result).toBeNull();
    });

    it('should handle exact grid boundary (x=0, y=0)', () => {
      const result = service.screenToPixel(0, 0, { width: 10, height: 10 }, 8, 8, 'square');
      expect(result).toEqual({ x: 0, y: 0 });
    });

    it('should handle position just inside last pixel', () => {
      const result = service.screenToPixel(79, 79, { width: 10, height: 10 }, 8, 8, 'square');
      expect(result).toEqual({ x: 7, y: 7 });
    });
  });

  describe('getNeighbors', () => {
    describe('square grid', () => {
      it('should return 4 neighbors for center pixel', () => {
        const neighbors = service.getNeighbors(4, 4, 'square', 8, 8);
        expect(neighbors.length).toBe(4);
        expect(neighbors).toContainEqual({ x: 3, y: 4 }); // left
        expect(neighbors).toContainEqual({ x: 5, y: 4 }); // right
        expect(neighbors).toContainEqual({ x: 4, y: 3 }); // up
        expect(neighbors).toContainEqual({ x: 4, y: 5 }); // down
      });

      it('should return 2 neighbors for corner pixel (0,0)', () => {
        const neighbors = service.getNeighbors(0, 0, 'square', 8, 8);
        expect(neighbors.length).toBe(2);
        expect(neighbors).toContainEqual({ x: 1, y: 0 });
        expect(neighbors).toContainEqual({ x: 0, y: 1 });
      });

      it('should return 3 neighbors for edge pixel (0,4)', () => {
        const neighbors = service.getNeighbors(0, 4, 'square', 8, 8);
        expect(neighbors.length).toBe(3);
      });

      it('should return 2 neighbors for bottom-right corner', () => {
        const neighbors = service.getNeighbors(7, 7, 'square', 8, 8);
        expect(neighbors.length).toBe(2);
        expect(neighbors).toContainEqual({ x: 6, y: 7 });
        expect(neighbors).toContainEqual({ x: 7, y: 6 });
      });
    });

    describe('peyote grid', () => {
      // Using 8 visual columns, 4 beads/col → bufferWidth=4, bufferHeight=8
      // Convention: even buf rows → even visual cols (UP/unshifted);
      //             odd  buf rows → odd  visual cols (DOWN/shifted)

      it('should return 6 neighbors for center odd-column (DOWN) bead', () => {
        // bx=1, by=3 → col=3 (odd/DOWN), beadRow=1
        const neighbors = service.getNeighbors(1, 3, 'peyote', 4, 8);
        expect(neighbors.length).toBe(6);
        // same column up/down:
        // visualToBuffer(3, 0) → bx=1, by=1; visualToBuffer(3, 2) → bx=1, by=5
        expect(neighbors).toContainEqual({ x: 1, y: 1 }); // col=3,beadRow=0
        expect(neighbors).toContainEqual({ x: 1, y: 5 }); // col=3,beadRow=2
        // left even col (col=2, UP): upper-left (beadRow) and lower-left (beadRow+1)
        // visualToBuffer(2, 1) → bx=1, by=2; visualToBuffer(2, 2) → bx=1, by=4
        expect(neighbors).toContainEqual({ x: 1, y: 2 }); // col=2,beadRow=1 (upper-left)
        expect(neighbors).toContainEqual({ x: 1, y: 4 }); // col=2,beadRow=2 (lower-left)
        // right even col (col=4, UP): upper-right (beadRow) and lower-right (beadRow+1)
        // visualToBuffer(4, 1) → bx=2, by=2; visualToBuffer(4, 2) → bx=2, by=4
        expect(neighbors).toContainEqual({ x: 2, y: 2 }); // col=4,beadRow=1 (upper-right)
        expect(neighbors).toContainEqual({ x: 2, y: 4 }); // col=4,beadRow=2 (lower-right)
      });

      it('should return 6 neighbors for center even-column (UP) bead', () => {
        // bx=1, by=2 → col=2 (even/UP), beadRow=1
        const neighbors = service.getNeighbors(1, 2, 'peyote', 4, 8);
        expect(neighbors.length).toBe(6);
        // same column up/down:
        // visualToBuffer(2, 0) → bx=1, by=0; visualToBuffer(2, 2) → bx=1, by=4
        expect(neighbors).toContainEqual({ x: 1, y: 0 }); // col=2,beadRow=0
        expect(neighbors).toContainEqual({ x: 1, y: 4 }); // col=2,beadRow=2
        // left odd col (col=1, DOWN): upper-left (beadRow-1) and lower-left (beadRow)
        // visualToBuffer(1, 0) → bx=0, by=1; visualToBuffer(1, 1) → bx=0, by=3
        expect(neighbors).toContainEqual({ x: 0, y: 1 }); // col=1,beadRow=0 (upper-left)
        expect(neighbors).toContainEqual({ x: 0, y: 3 }); // col=1,beadRow=1 (lower-left)
        // right odd col (col=3, DOWN): upper-right (beadRow-1) and lower-right (beadRow)
        // visualToBuffer(3, 0) → bx=1, by=1; visualToBuffer(3, 1) → bx=1, by=3
        expect(neighbors).toContainEqual({ x: 1, y: 1 }); // col=3,beadRow=0 (upper-right)
        expect(neighbors).toContainEqual({ x: 1, y: 3 }); // col=3,beadRow=1 (lower-right)
      });

      it('should filter invalid neighbors at peyote corner (0,0)', () => {
        // bx=0, by=0 → col=0 (even/UP), beadRow=0
        const neighbors = service.getNeighbors(0, 0, 'peyote', 4, 8);
        // all neighbors should be valid
        for (const n of neighbors) {
          expect(service.isValidPixel(n.x, n.y, 4, 8, 'peyote')).toBe(true);
        }
        // same-col up, upper-left/upper-right at beadRow=-1 are all invalid
        expect(neighbors.length).toBeLessThan(6);
      });
    });
  });

  describe('isPeyote', () => {
    it('should return false for square', () => {
      expect(service.isPeyote('square')).toBe(false);
    });

    it('should return true for peyote', () => {
      expect(service.isPeyote('peyote')).toBe(true);
    });
  });

  describe('isTriangular', () => {
    it('should return false for square', () => {
      expect(service.isTriangular('square')).toBe(false);
    });

    it('should return false for peyote', () => {
      expect(service.isTriangular('peyote')).toBe(false);
    });

    it('should return true for triangular', () => {
      expect(service.isTriangular('triangular')).toBe(true);
    });
  });

  describe('getTriangularRowWidth', () => {
    it('should return a for row 0', () => {
      expect(service.getTriangularRowWidth(0, 3, 2, 1)).toBe(3);
    });

    it('should return a + d for row 1', () => {
      expect(service.getTriangularRowWidth(1, 3, 2, 1)).toBe(5);
    });

    it('should return a + d*r for arbitrary row', () => {
      expect(service.getTriangularRowWidth(4, 1, 2, 1)).toBe(9);
    });
  });

  describe('triangular grid', () => {
    // Using a=1, d=2, R=4 (totalRows=4, bufferHeight=4)
    // Row widths: 1, 3, 5, 7
    const a = 1;
    const d = 2;
    const totalRows = 4;

    describe('isValidPixel', () => {
      it('should accept (0, 0) — only pixel in row 0', () => {
        expect(service.isValidPixel(0, 0, 0, totalRows, 'triangular', a, d)).toBe(true);
      });

      it('should reject (1, 0) — row 0 has width 1', () => {
        expect(service.isValidPixel(1, 0, 0, totalRows, 'triangular', a, d)).toBe(false);
      });

      it('should accept (2, 1) — row 1 has width 3', () => {
        expect(service.isValidPixel(2, 1, 0, totalRows, 'triangular', a, d)).toBe(true);
      });

      it('should reject (3, 1) — row 1 has width 3', () => {
        expect(service.isValidPixel(3, 1, 0, totalRows, 'triangular', a, d)).toBe(false);
      });

      it('should accept (6, 3) — last pixel of row 3', () => {
        expect(service.isValidPixel(6, 3, 0, totalRows, 'triangular', a, d)).toBe(true);
      });

      it('should reject (7, 3) — past end of row 3', () => {
        expect(service.isValidPixel(7, 3, 0, totalRows, 'triangular', a, d)).toBe(false);
      });

      it('should reject negative x', () => {
        expect(service.isValidPixel(-1, 0, 0, totalRows, 'triangular', a, d)).toBe(false);
      });

      it('should reject negative y', () => {
        expect(service.isValidPixel(0, -1, 0, totalRows, 'triangular', a, d)).toBe(false);
      });

      it('should reject y >= totalRows', () => {
        expect(service.isValidPixel(0, totalRows, 0, totalRows, 'triangular', a, d)).toBe(false);
      });
    });

    describe('pixelToScreen (even d)', () => {
      // a=1, d=2 (even), totalRows=4
      // maxWidth = 1 + 2*3 = 7
      // Row 0: width 1, centerOffset = (7-1)/2 = 3
      // Row 3: width 7, centerOffset = 0

      it('should center single pixel in row 0', () => {
        const result = service.pixelToScreen(0, 0, { width: 10, height: 10 }, 'triangular', a, d, totalRows);
        // centerOffset = 3, sx = (3 + 0) * 10 = 30
        expect(result).toEqual({ sx: 30, sy: 0 });
      });

      it('should position first pixel of row 3 at left edge', () => {
        const result = service.pixelToScreen(0, 3, { width: 10, height: 10 }, 'triangular', a, d, totalRows);
        // centerOffset = 0, sx = 0
        expect(result).toEqual({ sx: 0, sy: 30 });
      });

      it('should position middle pixel of row 2', () => {
        // row 2: width 5, centerOffset = (7-5)/2 = 1
        const result = service.pixelToScreen(2, 2, { width: 10, height: 10 }, 'triangular', a, d, totalRows);
        expect(result).toEqual({ sx: 30, sy: 20 });
      });

      it('should not apply vertical stagger for even d', () => {
        const r0 = service.pixelToScreen(0, 0, { width: 10, height: 10 }, 'triangular', a, d, totalRows);
        const r1 = service.pixelToScreen(0, 1, { width: 10, height: 10 }, 'triangular', a, d, totalRows);
        // No stagger — rows are at y=0 and y=10 exactly
        expect(r0.sy).toBe(0);
        expect(r1.sy).toBe(10);
      });
    });

    describe('pixelToScreen (odd d)', () => {
      // a=2, d=1, totalRows=4
      // maxWidth = 5
      // Odd d: 2-stride layout. centerOffset = maxWidth - rowWidth (integer).
      // Row 0: width 2, centerOffset = 3 → pixel 0 at (3+0)*10=30, pixel 1 at (3+2)*10=50
      // Row 1: width 3, centerOffset = 2 → pixels at 20, 40, 60
      // Row 2: width 4, centerOffset = 1 → pixels at 10, 30, 50, 70
      // Row 3: width 5, centerOffset = 0 → pixels at 0, 20, 40, 60, 80
      const oddA = 2;
      const oddD = 1;

      it('should center first row with whole-pixel offset', () => {
        const result = service.pixelToScreen(0, 0, { width: 10, height: 10 }, 'triangular', oddA, oddD, totalRows);
        // centerOffset = 5-2 = 3, sx = (3 + 0*2) * 10 = 30
        expect(result.sx).toBe(30);
        expect(result.sy).toBe(0);
      });

      it('should space pixels within a row with stride 2', () => {
        // Row 3: width 5, centerOffset = 0. Pixels at 0, 20, 40, 60, 80.
        const p0 = service.pixelToScreen(0, 3, { width: 10, height: 10 }, 'triangular', oddA, oddD, totalRows);
        const p1 = service.pixelToScreen(1, 3, { width: 10, height: 10 }, 'triangular', oddA, oddD, totalRows);
        const p2 = service.pixelToScreen(2, 3, { width: 10, height: 10 }, 'triangular', oddA, oddD, totalRows);
        expect(p0.sx).toBe(0);
        expect(p1.sx).toBe(20);
        expect(p2.sx).toBe(40);
      });

      it('should use peyote-style half-row Y spacing', () => {
        const r0 = service.pixelToScreen(0, 0, { width: 10, height: 10 }, 'triangular', oddA, oddD, totalRows);
        const r1 = service.pixelToScreen(0, 1, { width: 10, height: 10 }, 'triangular', oddA, oddD, totalRows);
        const r2 = service.pixelToScreen(0, 2, { width: 10, height: 10 }, 'triangular', oddA, oddD, totalRows);
        const r3 = service.pixelToScreen(0, 3, { width: 10, height: 10 }, 'triangular', oddA, oddD, totalRows);
        expect(r0.sy).toBe(0);
        expect(r1.sy).toBe(5);
        expect(r2.sy).toBe(10);
        expect(r3.sy).toBe(15);
      });

      it('should shift adjacent rows by a whole pixel', () => {
        // Row 0 pixel 0: sx=30. Row 1 pixel 0: sx=20. Shift = 10 (one cell width).
        const r0 = service.pixelToScreen(0, 0, { width: 10, height: 10 }, 'triangular', oddA, oddD, totalRows);
        const r1 = service.pixelToScreen(0, 1, { width: 10, height: 10 }, 'triangular', oddA, oddD, totalRows);
        expect(r0.sx - r1.sx).toBe(10);
      });
    });

    describe('screenToPixel (even d)', () => {
      // a=1, d=2, totalRows=4
      // maxWidth=7, scale=10
      // Row 0: width 1, centerOffset=3 → pixel range x∈[30, 40)
      // Row 3: width 7, centerOffset=0 → pixel range x∈[0, 70)

      it('should identify the single pixel in row 0', () => {
        const result = service.screenToPixel(35, 5, { width: 10, height: 10 }, 0, totalRows, 'triangular', a, d);
        expect(result).toEqual({ x: 0, y: 0 });
      });

      it('should return null for click outside row 0 pixel', () => {
        const result = service.screenToPixel(5, 5, { width: 10, height: 10 }, 0, totalRows, 'triangular', a, d);
        expect(result).toBeNull();
      });

      it('should identify first pixel in row 3', () => {
        const result = service.screenToPixel(5, 35, { width: 10, height: 10 }, 0, totalRows, 'triangular', a, d);
        expect(result).toEqual({ x: 0, y: 3 });
      });

      it('should identify last pixel in row 3', () => {
        const result = service.screenToPixel(65, 35, { width: 10, height: 10 }, 0, totalRows, 'triangular', a, d);
        expect(result).toEqual({ x: 6, y: 3 });
      });

      it('should return null for y below the grid', () => {
        const result = service.screenToPixel(35, 45, { width: 10, height: 10 }, 0, totalRows, 'triangular', a, d);
        expect(result).toBeNull();
      });

      it('should return null for negative coordinates', () => {
        expect(service.screenToPixel(-5, 5, { width: 10, height: 10 }, 0, totalRows, 'triangular', a, d)).toBeNull();
      });
    });

    describe('screenToPixel (odd d)', () => {
      // a=2, d=1, totalRows=4, maxWidth=5, scale=10
      // Odd d: 2-stride layout. centerOffset = maxWidth - rowWidth (integer).
      // Row 0: width 2, centerOffset=3 → pixels at gridCols 3, 5
      // Row 1: width 3, centerOffset=2 → pixels at gridCols 2, 4, 6
      // Row 3: width 5, centerOffset=0 → pixels at gridCols 0, 2, 4, 6, 8
      const oddA = 2;
      const oddD = 1;

      it('should identify pixel in first row', () => {
        // Row 0: pixel 0 at gridCol 3 → screen x in [30, 40)
        // Click at (35, 5): gridCol=3, relCol=3-3=0, even → bx=0
        const result = service.screenToPixel(35, 5, { width: 10, height: 10 }, 0, totalRows, 'triangular', oddA, oddD);
        expect(result).toEqual({ x: 0, y: 0 });
      });

      it('should identify pixel in last row', () => {
        // Row 3: pixel 2 at gridCol 4 → screen x in [40, 50)
        // Click at (45, 22): only row 3 contains y=22
        const result = service.screenToPixel(45, 22, { width: 10, height: 10 }, 0, totalRows, 'triangular', oddA, oddD);
        expect(result).toEqual({ x: 2, y: 3 });
      });

      it('should return null for click in a gap between pixels', () => {
        // Row 0: pixels at gridCols 3, 5 → gaps at gridCols 4
        // Click at (45, 3): y=3 is only in row 0 band [0, 10).
        // gridCol=4, relCol=4-3=1 (odd → gap)
        const result = service.screenToPixel(45, 3, { width: 10, height: 10 }, 0, totalRows, 'triangular', oddA, oddD);
        expect(result).toBeNull();
      });

      it('should return null for click outside row pixels', () => {
        // Row 0: centerOffset=3. Click at (5, 3): gridCol=0, relCol=0-3=-3 → null
        const result = service.screenToPixel(5, 3, { width: 10, height: 10 }, 0, totalRows, 'triangular', oddA, oddD);
        expect(result).toBeNull();
      });

      it('should resolve overlap to row with valid pixel at that column', () => {
        // At y=7, rows 0 and 1 overlap. gridCol 4:
        //   Row 0: relCol=4-3=1 (odd → gap)
        //   Row 1: relCol=4-2=2 (even → bx=1, valid since width=3)
        const result = service.screenToPixel(45, 7, { width: 10, height: 10 }, 0, totalRows, 'triangular', oddA, oddD);
        expect(result).toEqual({ x: 1, y: 1 });
      });
    });

    describe('getNeighbors (even d)', () => {
      // a=1, d=2, totalRows=4
      // Row widths: 1, 3, 5, 7

      it('should return 2 neighbors for (0, 0) — left/right blocked, one below', () => {
        const neighbors = service.getNeighbors(0, 0, 'triangular', 0, totalRows, a, d);
        // Same-row: no left (bx-1 < 0), no right (bx+1 >= 1)
        // Below: shift = 1, belowX = 0 + 1 = 1 → valid (row 1 has width 3)
        expect(neighbors).toContainEqual({ x: 1, y: 1 });
        // No above (row -1)
        expect(neighbors.length).toBe(1);
      });

      it('should return 4 neighbors for center pixel of middle row', () => {
        // (2, 2) in row 2 (width 5)
        const neighbors = service.getNeighbors(2, 2, 'triangular', 0, totalRows, a, d);
        // Left: (1, 2), Right: (3, 2)
        // Above: shift=1, aboveX=2-1=1 → (1, 1) valid (row 1 width 3)
        // Below: shift=1, belowX=2+1=3 → (3, 3) valid (row 3 width 7)
        expect(neighbors.length).toBe(4);
        expect(neighbors).toContainEqual({ x: 1, y: 2 });
        expect(neighbors).toContainEqual({ x: 3, y: 2 });
        expect(neighbors).toContainEqual({ x: 1, y: 1 });
        expect(neighbors).toContainEqual({ x: 3, y: 3 });
      });

      it('should handle edge of last row', () => {
        // (6, 3) — rightmost pixel of row 3 (width 7)
        const neighbors = service.getNeighbors(6, 3, 'triangular', 0, totalRows, a, d);
        // Left: (5, 3)
        // Right: (7, 3) invalid
        // Above: shift=1, aboveX=6-1=5 → invalid (row 2 width 5, max index 4)
        // Below: no row 4
        expect(neighbors.length).toBe(1);
        expect(neighbors).toContainEqual({ x: 5, y: 3 });
      });
    });

    describe('getNeighbors (odd d)', () => {
      // a=2, d=1, totalRows=4
      // Row widths: 2, 3, 4, 5
      // 2-stride layout: no same-row neighbors.
      // Neighbors: ±1 row diagonals (gridCol ± 1) and ±2 rows (same gridCol).
      const oddA = 2;
      const oddD = 1;

      it('should return 6-connected neighbors for center pixel (1,2)', () => {
        // (1, 2) in row 2 (width 4)
        // gridCol = centerOffset + bx*2 = (5-4) + 1*2 = 3
        // 1 row above: leftAbove=(2-1-1)/2=0 → (0,1), rightAbove=(2+1-1)/2=1 → (1,1)
        // 1 row below: leftBelow=(2-1+1)/2=1 → (1,3), rightBelow=(2+1+1)/2=2 → (2,3)
        // 2 rows above: bx-d=0 → (0,0)
        // 2 rows below: no row 4
        const neighbors = service.getNeighbors(1, 2, 'triangular', 0, totalRows, oddA, oddD);
        expect(neighbors.length).toBe(5);
        expect(neighbors).toContainEqual({ x: 0, y: 1 });
        expect(neighbors).toContainEqual({ x: 1, y: 1 });
        expect(neighbors).toContainEqual({ x: 1, y: 3 });
        expect(neighbors).toContainEqual({ x: 2, y: 3 });
        expect(neighbors).toContainEqual({ x: 0, y: 0 });
      });

      it('should filter invalid neighbors at top-left corner (0,0)', () => {
        // (0, 0) in row 0 (width 2)
        // No row above. No 2 rows above.
        // 1 row below: leftBelow=(0-1+1)/2=0 → (0,1), rightBelow=(0+1+1)/2=1 → (1,1)
        // 2 rows below: bx+d=1 → (1,2)
        const neighbors = service.getNeighbors(0, 0, 'triangular', 0, totalRows, oddA, oddD);
        expect(neighbors).toContainEqual({ x: 0, y: 1 });
        expect(neighbors).toContainEqual({ x: 1, y: 1 });
        expect(neighbors).toContainEqual({ x: 1, y: 2 });
        expect(neighbors.length).toBe(3);
      });

      it('should not include same-row neighbors', () => {
        // (1, 2) in row 2: should NOT contain (0,2) or (2,2)
        const neighbors = service.getNeighbors(1, 2, 'triangular', 0, totalRows, oddA, oddD);
        expect(neighbors).not.toContainEqual({ x: 0, y: 2 });
        expect(neighbors).not.toContainEqual({ x: 2, y: 2 });
      });

      it('should all be valid pixels', () => {
        // Exhaustive check: all neighbors returned should be valid
        for (let row = 0; row < totalRows; row++) {
          const rowWidth = oddA + oddD * row;
          for (let col = 0; col < rowWidth; col++) {
            const neighbors = service.getNeighbors(col, row, 'triangular', 0, totalRows, oddA, oddD);
            for (const n of neighbors) {
              expect(
                service.isValidPixel(n.x, n.y, 0, totalRows, 'triangular', oddA, oddD),
                `neighbor (${n.x},${n.y}) of (${col},${row}) should be valid`,
              ).toBe(true);
            }
          }
        }
      });
    });
  });

  describe('isAnyTriangular', () => {
    it('should return false for square', () => {
      expect(service.isAnyTriangular('square')).toBe(false);
    });

    it('should return false for peyote', () => {
      expect(service.isAnyTriangular('peyote')).toBe(false);
    });

    it('should return true for triangular', () => {
      expect(service.isAnyTriangular('triangular')).toBe(true);
    });
  });

  describe('usesPeyoteStagger', () => {
    it('should return true for triangular with odd d', () => {
      expect(service.usesPeyoteStagger('triangular', 1)).toBe(true);
      expect(service.usesPeyoteStagger('triangular', 3)).toBe(true);
    });

    it('should return false for triangular with even d', () => {
      expect(service.usesPeyoteStagger('triangular', 2)).toBe(false);
    });

    it('should return true for triangular with dNum < dDen (fractional d < 1)', () => {
      expect(service.usesPeyoteStagger('triangular', 0, 1, 2)).toBe(true);
      expect(service.usesPeyoteStagger('triangular', 0, 1, 3)).toBe(true);
      expect(service.usesPeyoteStagger('triangular', 0, 1, 4)).toBe(true);
    });

    it('should return true for triangular with odd floor(dNum/dDen)', () => {
      expect(service.usesPeyoteStagger('triangular', 0, 3, 2)).toBe(true); // floor(3/2)=1, odd
      expect(service.usesPeyoteStagger('triangular', 0, 7, 2)).toBe(true); // floor(7/2)=3, odd
    });

    it('should return false for triangular with even floor(dNum/dDen)', () => {
      expect(service.usesPeyoteStagger('triangular', 0, 4, 2)).toBe(false); // floor(4/2)=2, even
      expect(service.usesPeyoteStagger('triangular', 0, 2, 1)).toBe(false); // floor(2/1)=2, even
      expect(service.usesPeyoteStagger('triangular', 0, 5, 2)).toBe(false); // floor(5/2)=2, even
    });

    it('should return false for non-triangular types', () => {
      expect(service.usesPeyoteStagger('square', 2)).toBe(false);
      expect(service.usesPeyoteStagger('peyote', 2)).toBe(false);
    });
  });

  describe('triangular slow-growth grid (dNum < dDen)', () => {
    describe('isValidPixel (dNum=1, dDen=2)', () => {
      const a = 1, dNum = 1, dDen = 2, totalRows = 10;
      // Row widths with shift=0 (default): [1,0,1,2,1,2,3,2,3,4]

      it('should accept (0, 0) — row 0 has width 1', () => {
        expect(service.isValidPixel(0, 0, 0, totalRows, 'triangular', a, undefined, dNum, dDen)).toBe(true);
      });

      it('should reject (0, 1) — row 1 has width 0 with default shift=0', () => {
        expect(service.isValidPixel(0, 1, 0, totalRows, 'triangular', a, undefined, dNum, dDen)).toBe(false);
      });

      it('should accept (0, 2) — row 2 has width 1', () => {
        expect(service.isValidPixel(0, 2, 0, totalRows, 'triangular', a, undefined, dNum, dDen)).toBe(true);
      });

      it('should accept (1, 3) — row 3 has width 2', () => {
        expect(service.isValidPixel(1, 3, 0, totalRows, 'triangular', a, undefined, dNum, dDen)).toBe(true);
      });

      it('should reject (2, 3) — row 3 has width 2', () => {
        expect(service.isValidPixel(2, 3, 0, totalRows, 'triangular', a, undefined, dNum, dDen)).toBe(false);
      });

      it('should accept (3, 9) — row 9 has width 4', () => {
        expect(service.isValidPixel(3, 9, 0, totalRows, 'triangular', a, undefined, dNum, dDen)).toBe(true);
      });

      it('should reject (4, 9) — row 9 has width 4', () => {
        expect(service.isValidPixel(4, 9, 0, totalRows, 'triangular', a, undefined, dNum, dDen)).toBe(false);
      });

      it('should reject negative y', () => {
        expect(service.isValidPixel(0, -1, 0, totalRows, 'triangular', a, undefined, dNum, dDen)).toBe(false);
      });

      it('should reject y >= totalRows', () => {
        expect(service.isValidPixel(0, totalRows, 0, totalRows, 'triangular', a, undefined, dNum, dDen)).toBe(false);
      });
    });

    describe('isValidPixel (dNum=1, dDen=4)', () => {
      const a = 1, dNum = 1, dDen = 4, totalRows = 10;
      // Row widths with shift=0 (default): cycle=[1,0,0,0,0,0,1], then [2,1,0,...]

      it('should accept (0, 0)', () => {
        expect(service.isValidPixel(0, 0, 0, totalRows, 'triangular', a, undefined, dNum, dDen)).toBe(true);
      });

      it('should reject (0, 1) — row 1 has width 0 with default shift=0', () => {
        expect(service.isValidPixel(0, 1, 0, totalRows, 'triangular', a, undefined, dNum, dDen)).toBe(false);
      });

      it('should reject (0, 5) — row 5 has width 0 with default shift=0', () => {
        expect(service.isValidPixel(0, 5, 0, totalRows, 'triangular', a, undefined, dNum, dDen)).toBe(false);
      });

      it('should accept (1, 7) — row 7 (k=1,p=0) has width=2', () => {
        expect(service.isValidPixel(1, 7, 0, totalRows, 'triangular', a, undefined, dNum, dDen)).toBe(true);
      });

      it('should reject (2, 7) — row 7 has width 2', () => {
        expect(service.isValidPixel(2, 7, 0, totalRows, 'triangular', a, undefined, dNum, dDen)).toBe(false);
      });
    });

    describe('isValidPixel (dNum=1, dDen=3)', () => {
      const a = 1, dNum = 1, dDen = 3, totalRows = 10;
      // Row widths with shift=0 (clamped): [1,0,0,0,1,2,...]

      it('should accept (0, 0)', () => {
        expect(service.isValidPixel(0, 0, 0, totalRows, 'triangular', a, undefined, dNum, dDen)).toBe(true);
      });

      it('should reject (0, 1) — row 1 has width 0 with default shift=0', () => {
        expect(service.isValidPixel(0, 1, 0, totalRows, 'triangular', a, undefined, dNum, dDen)).toBe(false);
      });

      it('should accept (1, 5) — row 5 (k=1,p=0) has width 2', () => {
        expect(service.isValidPixel(1, 5, 0, totalRows, 'triangular', a, undefined, dNum, dDen)).toBe(true);
      });
    });

    describe('getNeighbors (dNum=1, dDen=2) — all returned neighbors must be valid', () => {
      const a = 1, dNum = 1, dDen = 2, totalRows = 10;

      it('should return valid neighbors for all pixels', () => {
        for (let row = 0; row < totalRows; row++) {
          const L = 2 * dDen - dNum;
          const k = Math.floor(row / L);
          const p = row % L;
          const w = a + k + (p % 2 === 1 ? 1 : 0);
          for (let col = 0; col < w; col++) {
            const neighbors = service.getNeighbors(col, row, 'triangular', 0, totalRows, a, undefined, dNum, dDen);
            for (const n of neighbors) {
              expect(
                service.isValidPixel(n.x, n.y, 0, totalRows, 'triangular', a, undefined, dNum, dDen),
                `neighbor (${n.x},${n.y}) of (${col},${row}) should be valid`,
              ).toBe(true);
            }
          }
        }
      });
    });

    describe('getNeighbors (dNum=1, dDen=4) — all returned neighbors must be valid', () => {
      const a = 1, dNum = 1, dDen = 4, totalRows = 10;

      it('should return valid neighbors for all pixels', () => {
        for (let row = 0; row < totalRows; row++) {
          const L = 2 * dDen - dNum;
          const k = Math.floor(row / L);
          const p = row % L;
          const w = a + k + (p % 2 === 1 ? 1 : 0);
          for (let col = 0; col < w; col++) {
            const neighbors = service.getNeighbors(col, row, 'triangular', 0, totalRows, a, undefined, dNum, dDen);
            for (const n of neighbors) {
              expect(
                service.isValidPixel(n.x, n.y, 0, totalRows, 'triangular', a, undefined, dNum, dDen),
                `neighbor (${n.x},${n.y}) of (${col},${row}) should be valid`,
              ).toBe(true);
            }
          }
        }
      });
    });

    describe('getNeighbors (dNum=1, dDen=3) — all returned neighbors must be valid', () => {
      const a = 1, dNum = 1, dDen = 3, totalRows = 10;

      it('should return valid neighbors for all pixels', () => {
        for (let row = 0; row < totalRows; row++) {
          const L = 2 * dDen - dNum;
          const k = Math.floor(row / L);
          const p = row % L;
          const w = a + k + (p % 2 === 1 ? 1 : 0);
          for (let col = 0; col < w; col++) {
            const neighbors = service.getNeighbors(col, row, 'triangular', 0, totalRows, a, undefined, dNum, dDen);
            for (const n of neighbors) {
              expect(
                service.isValidPixel(n.x, n.y, 0, totalRows, 'triangular', a, undefined, dNum, dDen),
                `neighbor (${n.x},${n.y}) of (${col},${row}) should be valid`,
              ).toBe(true);
            }
          }
        }
      });

      it('should have at least 1 neighbor for interior pixels', () => {
        const neighbors = service.getNeighbors(0, 5, 'triangular', 0, totalRows, a, undefined, dNum, dDen);
        expect(neighbors.length).toBeGreaterThanOrEqual(1);
      });
    });
  });
});
