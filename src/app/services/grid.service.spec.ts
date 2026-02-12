import { GridService } from './grid.service';
import { GridType, PixelCoord } from '../models';

describe('GridService', () => {
  let service: GridService;

  beforeEach(() => {
    service = new GridService();
  });

  describe('isOddRow', () => {
    it('should return false for row 0', () => {
      expect(service.isOddRow(0)).toBe(false);
    });

    it('should return true for row 1', () => {
      expect(service.isOddRow(1)).toBe(true);
    });

    it('should return false for row 2', () => {
      expect(service.isOddRow(2)).toBe(false);
    });

    it('should return true for row 3', () => {
      expect(service.isOddRow(3)).toBe(true);
    });

    it('should handle large even row numbers', () => {
      expect(service.isOddRow(100)).toBe(false);
    });

    it('should handle large odd row numbers', () => {
      expect(service.isOddRow(101)).toBe(true);
    });
  });

  describe('rowWidth', () => {
    it('should return baseWidth for square grid regardless of row', () => {
      expect(service.rowWidth(0, 10, 'square')).toBe(10);
      expect(service.rowWidth(1, 10, 'square')).toBe(10);
      expect(service.rowWidth(5, 10, 'square')).toBe(10);
    });

    it('should return baseWidth for peyote-even on any row', () => {
      expect(service.rowWidth(0, 10, 'peyote-even')).toBe(10);
      expect(service.rowWidth(1, 10, 'peyote-even')).toBe(10);
    });

    it('should return baseWidth for peyote-odd on even rows', () => {
      expect(service.rowWidth(0, 10, 'peyote-odd')).toBe(10);
      expect(service.rowWidth(2, 10, 'peyote-odd')).toBe(10);
    });

    it('should return baseWidth - 1 for peyote-odd on odd rows', () => {
      expect(service.rowWidth(1, 10, 'peyote-odd')).toBe(9);
      expect(service.rowWidth(3, 10, 'peyote-odd')).toBe(9);
    });

    it('should handle baseWidth of 1 in peyote-odd on odd row', () => {
      expect(service.rowWidth(1, 1, 'peyote-odd')).toBe(0);
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

    it('should return false for peyote-odd odd-row at x = baseWidth-1', () => {
      // baseWidth=8, odd row has width 7, so x=7 is out of bounds
      expect(service.isValidPixel(7, 1, 8, 8, 'peyote-odd')).toBe(false);
    });

    it('should return true for peyote-odd odd-row at x = baseWidth-2', () => {
      expect(service.isValidPixel(6, 1, 8, 8, 'peyote-odd')).toBe(true);
    });

    it('should return true for peyote-even on any valid coordinate', () => {
      expect(service.isValidPixel(7, 1, 8, 8, 'peyote-even')).toBe(true);
    });
  });

  describe('pixelToScreen', () => {
    it('should return x*scale, y*scale for square grid', () => {
      const result = service.pixelToScreen(3, 5, 10, 'square');
      expect(result).toEqual({ sx: 30, sy: 50 });
    });

    it('should return x*scale, y*scale for peyote on even row', () => {
      const result = service.pixelToScreen(3, 0, 10, 'peyote-even');
      expect(result).toEqual({ sx: 30, sy: 0 });
    });

    it('should add half-scale offset for peyote on odd row', () => {
      const result = service.pixelToScreen(3, 1, 10, 'peyote-even');
      expect(result).toEqual({ sx: 35, sy: 10 });
    });

    it('should add half-scale offset for peyote-odd on odd row', () => {
      const result = service.pixelToScreen(0, 1, 20, 'peyote-odd');
      expect(result).toEqual({ sx: 10, sy: 20 });
    });

    it('should handle scale of 1', () => {
      const result = service.pixelToScreen(5, 3, 1, 'peyote-odd');
      expect(result).toEqual({ sx: 5.5, sy: 3 });
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

    it('should account for peyote odd-row offset', () => {
      // On odd row 1, peyote shifts right by half a scale unit
      // localX=15, scale=10 → row 1 (odd), effectiveX = 15 - 5 = 10, x = 1
      const result = service.screenToPixel(15, 10, 10, 8, 8, 'peyote-even');
      expect(result).toEqual({ x: 1, y: 1 });
    });

    it('should return null for peyote-odd odd-row at shortened width', () => {
      // baseWidth=4, odd row has width 3, clicking at x=3 should be null
      const result = service.screenToPixel(35, 10, 10, 4, 4, 'peyote-odd');
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
      it('should return 6 neighbors for center even-row pixel', () => {
        const neighbors = service.getNeighbors(3, 2, 'peyote-even', 8, 8);
        expect(neighbors.length).toBe(6);
        // Same-row: left and right
        expect(neighbors).toContainEqual({ x: 2, y: 2 });
        expect(neighbors).toContainEqual({ x: 4, y: 2 });
        // Row above (odd, shifted right): upper-left = x-1, upper-right = x
        expect(neighbors).toContainEqual({ x: 2, y: 1 });
        expect(neighbors).toContainEqual({ x: 3, y: 1 });
        // Row below (odd, shifted right): lower-left = x-1, lower-right = x
        expect(neighbors).toContainEqual({ x: 2, y: 3 });
        expect(neighbors).toContainEqual({ x: 3, y: 3 });
      });

      it('should return 6 neighbors for center odd-row pixel', () => {
        const neighbors = service.getNeighbors(3, 1, 'peyote-even', 8, 8);
        expect(neighbors.length).toBe(6);
        // Same-row: left and right
        expect(neighbors).toContainEqual({ x: 2, y: 1 });
        expect(neighbors).toContainEqual({ x: 4, y: 1 });
        // Row above (even, not shifted): upper-left = x, upper-right = x+1
        expect(neighbors).toContainEqual({ x: 3, y: 0 });
        expect(neighbors).toContainEqual({ x: 4, y: 0 });
        // Row below (even, not shifted): lower-left = x, lower-right = x+1
        expect(neighbors).toContainEqual({ x: 3, y: 2 });
        expect(neighbors).toContainEqual({ x: 4, y: 2 });
      });

      it('should filter invalid neighbors at peyote corner (0,0)', () => {
        const neighbors = service.getNeighbors(0, 0, 'peyote-even', 8, 8);
        // Left is invalid (-1), upper-left and upper-right invalid (y=-1)
        // Valid: right (1,0), lower-left (-1,1)=invalid, lower-right (0,1)
        for (const n of neighbors) {
          expect(service.isValidPixel(n.x, n.y, 8, 8, 'peyote-even')).toBe(true);
        }
      });

      it('should handle peyote-odd odd-row shortened width', () => {
        // baseWidth=4, odd row 1 has width 3
        // Pixel at (2,1) — rightmost valid pixel on odd row
        const neighbors = service.getNeighbors(2, 1, 'peyote-odd', 4, 4);
        for (const n of neighbors) {
          expect(service.isValidPixel(n.x, n.y, 4, 4, 'peyote-odd')).toBe(true);
        }
      });
    });
  });

  describe('isPeyote', () => {
    it('should return false for square', () => {
      expect(service.isPeyote('square')).toBe(false);
    });

    it('should return true for peyote-even', () => {
      expect(service.isPeyote('peyote-even')).toBe(true);
    });

    it('should return true for peyote-odd', () => {
      expect(service.isPeyote('peyote-odd')).toBe(true);
    });
  });

  describe('visualToLogical', () => {
    it('should delegate to screenToPixel', () => {
      const result = service.visualToLogical(15, 25, 10, 8, 8, 'square');
      const expected = service.screenToPixel(15, 25, 10, 8, 8, 'square');
      expect(result).toEqual(expected);
    });
  });
});
