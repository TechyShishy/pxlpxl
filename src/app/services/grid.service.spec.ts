import { GridService } from './grid.service';
import { GridType, PixelCoord } from '../models';

describe('GridService', () => {
  let service: GridService;

  beforeEach(() => {
    service = new GridService();
  });

  describe('bufferToVisual', () => {
    it('should map even buffer row to even visual column', () => {
      // bx=0, by=0 → col=0, beadRow=0
      expect(service.bufferToVisual(0, 0)).toEqual({ col: 0, beadRow: 0 });
    });

    it('should map odd buffer row to odd visual column', () => {
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
    it('should map even visual column to even buffer row', () => {
      expect(service.visualToBuffer(0, 0)).toEqual({ bx: 0, by: 0 });
      expect(service.visualToBuffer(2, 3)).toEqual({ bx: 1, by: 6 });
    });

    it('should map odd visual column to odd buffer row', () => {
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
      // 8 visual columns → bufferWidth=4, 4 beads/col → bufferHeight=8
      expect(service.isValidPixel(0, 0, 4, 8, 'peyote', 8)).toBe(true);
      expect(service.isValidPixel(3, 7, 4, 8, 'peyote', 8)).toBe(true);
    });

    it('should reject peyote out-of-range visual column (odd visualColumns)', () => {
      // 7 visual columns → bufferWidth=4 (ceil(7/2)), bufferHeight=8
      // bx=3, by=1 → col=3*2+1=7, which is >= 7 visual columns
      expect(service.isValidPixel(3, 1, 4, 8, 'peyote', 7)).toBe(false);
      // bx=3, by=0 → col=3*2=6, which is < 7
      expect(service.isValidPixel(3, 0, 4, 8, 'peyote', 7)).toBe(true);
    });

    it('should accept when visualColumns is not provided for peyote', () => {
      // Without visualColumns, only checks buffer bounds
      expect(service.isValidPixel(3, 7, 4, 8, 'peyote')).toBe(true);
    });
  });

  describe('pixelToScreen', () => {
    it('should return bx*scale, by*scale for square grid', () => {
      const result = service.pixelToScreen(3, 5, 10, 'square');
      expect(result).toEqual({ sx: 30, sy: 50 });
    });

    it('should map peyote even buffer row to even visual column', () => {
      // bx=0, by=0 → col=0, beadRow=0 → no offset
      const result = service.pixelToScreen(0, 0, 10, 'peyote');
      expect(result).toEqual({ sx: 0, sy: 0 });
    });

    it('should map peyote odd buffer row to odd visual column with half-bead offset', () => {
      // bx=0, by=1 → col=1, beadRow=0 → offsetY = 5
      const result = service.pixelToScreen(0, 1, 10, 'peyote');
      expect(result).toEqual({ sx: 10, sy: 5 });
    });

    it('should compute correct screen position for higher buffer coords', () => {
      // bx=2, by=4 → col=4, beadRow=2 → even col, no offset
      const result = service.pixelToScreen(2, 4, 10, 'peyote');
      expect(result).toEqual({ sx: 40, sy: 20 });
    });

    it('should add half-scale offset for odd column', () => {
      // bx=1, by=3 → col=3, beadRow=1 → odd col
      const result = service.pixelToScreen(1, 3, 10, 'peyote');
      expect(result).toEqual({ sx: 30, sy: 15 });
    });

    it('should handle scale of 1', () => {
      // bx=1, by=1 → col=3, beadRow=0 → odd col, offsetY = 0.5
      const result = service.pixelToScreen(1, 1, 1, 'peyote');
      expect(result).toEqual({ sx: 3, sy: 0.5 });
    });
  });

  describe('screenToPixel', () => {
    it('should convert screen coords to pixel coords for square grid', () => {
      const result = service.screenToPixel(15, 25, 10, 8, 8, 'square');
      expect(result).toEqual({ x: 1, y: 2 });
    });

    it('should return null for out-of-bounds coordinates', () => {
      expect(service.screenToPixel(-5, 0, 10, 8, 8, 'square')).toBeNull();
      expect(service.screenToPixel(0, -5, 10, 8, 8, 'square')).toBeNull();
      expect(service.screenToPixel(80, 0, 10, 8, 8, 'square')).toBeNull();
      expect(service.screenToPixel(0, 80, 10, 8, 8, 'square')).toBeNull();
    });

    it('should map peyote screen position on even column to buffer coords', () => {
      // screen (0, 15) with scale=10 → col=0, beadRow=1 → bx=0, by=2
      const result = service.screenToPixel(0, 15, 10, 4, 8, 'peyote', 8);
      expect(result).toEqual({ x: 0, y: 2 });
    });

    it('should account for peyote odd-column half-bead offset', () => {
      // screen (10, 15) with scale=10 → col=1 (odd), effectiveY=15-5=10, beadRow=1
      // visualToBuffer(1, 1) → bx=0, by=3
      const result = service.screenToPixel(10, 15, 10, 4, 8, 'peyote', 8);
      expect(result).toEqual({ x: 0, y: 3 });
    });

    it('should return null for peyote click above the odd column', () => {
      // screen (10, 2) with scale=10 → col=1 (odd), effectiveY=2-5=-3, beadRow=-1
      const result = service.screenToPixel(10, 2, 10, 4, 8, 'peyote', 8);
      expect(result).toBeNull();
    });

    it('should return null for peyote click beyond visual columns', () => {
      // 7 visual columns, click at col=7 which is out of range
      const result = service.screenToPixel(70, 0, 10, 4, 8, 'peyote', 7);
      expect(result).toBeNull();
    });

    it('should handle exact grid boundary (x=0, y=0)', () => {
      const result = service.screenToPixel(0, 0, 10, 8, 8, 'square');
      expect(result).toEqual({ x: 0, y: 0 });
    });

    it('should handle position just inside last pixel', () => {
      const result = service.screenToPixel(79, 79, 10, 8, 8, 'square');
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

      it('should return 6 neighbors for center even-column bead', () => {
        // bx=1, by=2 → col=2 (even), beadRow=1 (center-ish)
        const neighbors = service.getNeighbors(1, 2, 'peyote', 4, 8, 8);
        expect(neighbors.length).toBe(6);
        // same column up/down: beadRow-1 / beadRow+1 → by=0 / by=4
        expect(neighbors).toContainEqual({ x: 1, y: 0 }); // col=2,beadRow=0
        expect(neighbors).toContainEqual({ x: 1, y: 4 }); // col=2,beadRow=2
        // left odd col (col=1): upper-left (beadRow-1) and lower-left (beadRow)
        // visualToBuffer(1, 0) → bx=0, by=1; visualToBuffer(1, 1) → bx=0, by=3
        expect(neighbors).toContainEqual({ x: 0, y: 1 }); // col=1,beadRow=0
        expect(neighbors).toContainEqual({ x: 0, y: 3 }); // col=1,beadRow=1
        // right odd col (col=3): upper-right (beadRow-1) and lower-right (beadRow)
        // visualToBuffer(3, 0) → bx=1, by=1; visualToBuffer(3, 1) → bx=1, by=3
        expect(neighbors).toContainEqual({ x: 1, y: 1 }); // col=3,beadRow=0
        expect(neighbors).toContainEqual({ x: 1, y: 3 }); // col=3,beadRow=1
      });

      it('should return 6 neighbors for center odd-column bead', () => {
        // bx=0, by=3 → col=1 (odd), beadRow=1
        const neighbors = service.getNeighbors(0, 3, 'peyote', 4, 8, 8);
        expect(neighbors.length).toBe(6);
        // same column up/down: beadRow-1 / beadRow+1
        // visualToBuffer(1, 0) → bx=0, by=1; visualToBuffer(1, 2) → bx=0, by=5
        expect(neighbors).toContainEqual({ x: 0, y: 1 }); // col=1,beadRow=0
        expect(neighbors).toContainEqual({ x: 0, y: 5 }); // col=1,beadRow=2
        // left even col (col=0): upper-left (beadRow) and lower-left (beadRow+1)
        // visualToBuffer(0, 1) → bx=0, by=2; visualToBuffer(0, 2) → bx=0, by=4
        expect(neighbors).toContainEqual({ x: 0, y: 2 }); // col=0,beadRow=1
        expect(neighbors).toContainEqual({ x: 0, y: 4 }); // col=0,beadRow=2
        // right even col (col=2): upper-right (beadRow) and lower-right (beadRow+1)
        // visualToBuffer(2, 1) → bx=1, by=2; visualToBuffer(2, 2) → bx=1, by=4
        expect(neighbors).toContainEqual({ x: 1, y: 2 }); // col=2,beadRow=1
        expect(neighbors).toContainEqual({ x: 1, y: 4 }); // col=2,beadRow=2
      });

      it('should filter invalid neighbors at peyote corner (0,0)', () => {
        // bx=0, by=0 → col=0, beadRow=0
        const neighbors = service.getNeighbors(0, 0, 'peyote', 4, 8, 8);
        // all neighbors should be valid
        for (const n of neighbors) {
          expect(service.isValidPixel(n.x, n.y, 4, 8, 'peyote', 8)).toBe(true);
        }
        // up (beadRow=-1) and upper-left/upper-right (beadRow=-1) are invalid
        expect(neighbors.length).toBeLessThan(6);
      });

      it('should handle odd visualColumns', () => {
        // 7 visual columns → bufferWidth=4, bufferHeight=8
        // bx=3, by=0 → col=6, beadRow=0 (rightmost even col)
        const neighbors = service.getNeighbors(3, 0, 'peyote', 4, 8, 7);
        // col=7 doesn't exist, so right-side neighbors are invalid
        for (const n of neighbors) {
          expect(service.isValidPixel(n.x, n.y, 4, 8, 'peyote', 7)).toBe(true);
        }
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
});
