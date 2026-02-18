import { GridService } from './grid.service';
import { GridType, PixelCoord } from '../models';

describe('GridService', () => {
  let service: GridService;

  beforeEach(() => {
    service = new GridService();
  });

  describe('isOddColumn', () => {
    it('should return false for column 0', () => {
      expect(service.isOddColumn(0)).toBe(false);
    });

    it('should return true for column 1', () => {
      expect(service.isOddColumn(1)).toBe(true);
    });

    it('should return false for column 2', () => {
      expect(service.isOddColumn(2)).toBe(false);
    });

    it('should return true for column 3', () => {
      expect(service.isOddColumn(3)).toBe(true);
    });

    it('should handle large even column numbers', () => {
      expect(service.isOddColumn(100)).toBe(false);
    });

    it('should handle large odd column numbers', () => {
      expect(service.isOddColumn(101)).toBe(true);
    });
  });

  describe('colHeight', () => {
    it('should return baseHeight for square grid regardless of column', () => {
      expect(service.colHeight(0, 10, 'square')).toBe(10);
      expect(service.colHeight(1, 10, 'square')).toBe(10);
      expect(service.colHeight(5, 10, 'square')).toBe(10);
    });

    it('should return baseHeight for peyote-even on any column', () => {
      expect(service.colHeight(0, 10, 'peyote-even')).toBe(10);
      expect(service.colHeight(1, 10, 'peyote-even')).toBe(10);
    });

    it('should return baseHeight for peyote-odd on even columns', () => {
      expect(service.colHeight(0, 10, 'peyote-odd')).toBe(10);
      expect(service.colHeight(2, 10, 'peyote-odd')).toBe(10);
    });

    it('should return baseHeight - 1 for peyote-odd on odd columns', () => {
      expect(service.colHeight(1, 10, 'peyote-odd')).toBe(9);
      expect(service.colHeight(3, 10, 'peyote-odd')).toBe(9);
    });

    it('should handle baseHeight of 1 in peyote-odd on odd column', () => {
      expect(service.colHeight(1, 1, 'peyote-odd')).toBe(0);
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

    it('should return false for peyote-odd odd-column at y = baseHeight-1', () => {
      // baseHeight=8, odd column has height 7, so y=7 is out of bounds
      expect(service.isValidPixel(1, 7, 8, 8, 'peyote-odd')).toBe(false);
    });

    it('should return true for peyote-odd odd-column at y = baseHeight-2', () => {
      expect(service.isValidPixel(1, 6, 8, 8, 'peyote-odd')).toBe(true);
    });

    it('should return true for peyote-even on any valid coordinate', () => {
      expect(service.isValidPixel(1, 7, 8, 8, 'peyote-even')).toBe(true);
    });
  });

  describe('pixelToScreen', () => {
    it('should return x*scale, y*scale for square grid', () => {
      const result = service.pixelToScreen(3, 5, 10, 'square');
      expect(result).toEqual({ sx: 30, sy: 50 });
    });

    it('should return x*scale, y*scale for peyote on even column', () => {
      const result = service.pixelToScreen(0, 3, 10, 'peyote-even');
      expect(result).toEqual({ sx: 0, sy: 30 });
    });

    it('should add half-scale offset to sy for peyote on odd column', () => {
      const result = service.pixelToScreen(1, 3, 10, 'peyote-even');
      expect(result).toEqual({ sx: 10, sy: 35 });
    });

    it('should add half-scale offset to sy for peyote-odd on odd column', () => {
      const result = service.pixelToScreen(1, 0, 20, 'peyote-odd');
      expect(result).toEqual({ sx: 20, sy: 10 });
    });

    it('should handle scale of 1', () => {
      const result = service.pixelToScreen(3, 5, 1, 'peyote-odd');
      expect(result).toEqual({ sx: 3, sy: 5.5 });
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

    it('should account for peyote odd-column offset', () => {
      // On odd column 1, peyote shifts down by half a scale unit
      // localY=15, scale=10 → column 1 (odd), effectiveY = 15 - 5 = 10, y = 1
      const result = service.screenToPixel(10, 15, 10, 8, 8, 'peyote-even');
      expect(result).toEqual({ x: 1, y: 1 });
    });

    it('should return null for peyote-odd odd-column at shortened height', () => {
      // baseHeight=4, odd column has height 3, clicking at y=3 should be null
      const result = service.screenToPixel(10, 35, 10, 4, 4, 'peyote-odd');
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
      it('should return 6 neighbors for center even-column pixel', () => {
        const neighbors = service.getNeighbors(2, 3, 'peyote-even', 8, 8);
        expect(neighbors.length).toBe(6);
        // Same-column: up and down
        expect(neighbors).toContainEqual({ x: 2, y: 2 });
        expect(neighbors).toContainEqual({ x: 2, y: 4 });
        // Column to the left (odd, shifted down): upper-left = (x-1,y-1), lower-left = (x-1,y)
        expect(neighbors).toContainEqual({ x: 1, y: 2 });
        expect(neighbors).toContainEqual({ x: 1, y: 3 });
        // Column to the right (odd, shifted down): upper-right = (x+1,y-1), lower-right = (x+1,y)
        expect(neighbors).toContainEqual({ x: 3, y: 2 });
        expect(neighbors).toContainEqual({ x: 3, y: 3 });
      });

      it('should return 6 neighbors for center odd-column pixel', () => {
        const neighbors = service.getNeighbors(1, 3, 'peyote-even', 8, 8);
        expect(neighbors.length).toBe(6);
        // Same-column: up and down
        expect(neighbors).toContainEqual({ x: 1, y: 2 });
        expect(neighbors).toContainEqual({ x: 1, y: 4 });
        // Column to the left (even, not shifted): upper-left = (x-1,y), lower-left = (x-1,y+1)
        expect(neighbors).toContainEqual({ x: 0, y: 3 });
        expect(neighbors).toContainEqual({ x: 0, y: 4 });
        // Column to the right (even, not shifted): upper-right = (x+1,y), lower-right = (x+1,y+1)
        expect(neighbors).toContainEqual({ x: 2, y: 3 });
        expect(neighbors).toContainEqual({ x: 2, y: 4 });
      });

      it('should filter invalid neighbors at peyote corner (0,0)', () => {
        const neighbors = service.getNeighbors(0, 0, 'peyote-even', 8, 8);
        // Up is invalid (y=-1), left column is invalid (x=-1)
        for (const n of neighbors) {
          expect(service.isValidPixel(n.x, n.y, 8, 8, 'peyote-even')).toBe(true);
        }
      });

      it('should handle peyote-odd odd-column shortened height', () => {
        // baseHeight=4, odd column 1 has height 3
        // Pixel at (1,2) — bottommost valid pixel in odd column
        const neighbors = service.getNeighbors(1, 2, 'peyote-odd', 4, 4);
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
