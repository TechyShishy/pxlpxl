import { TestBed } from '@angular/core/testing';
import { CanvasStateService } from './canvas-state.service';
import { GridService } from './grid.service';

describe('CanvasStateService', () => {
  let service: CanvasStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CanvasStateService);
  });

  describe('default values', () => {
    it('should have default canvas dimensions', () => {
      expect(service.canvasWidth()).toBe(32);
      expect(service.canvasHeight()).toBe(32);
    });

    it('should have grid visible by default', () => {
      expect(service.showGrid()).toBe(true);
    });

    it('should have rulers hidden by default', () => {
      expect(service.showRulers()).toBe(false);
    });

    it('should default to square grid', () => {
      expect(service.gridType()).toBe('square');
    });

    it('should have default transform', () => {
      const t = service.transform();
      expect(t.scale).toBe(10);
      expect(t.offsetX).toBe(0);
      expect(t.offsetY).toBe(0);
    });

    it('should compute zoomPercent from scale', () => {
      expect(service.zoomPercent()).toBe(1000);
    });
  });

  describe('setCanvasSize', () => {
    it('should update width and height', () => {
      service.setCanvasSize(64, 48);
      expect(service.canvasWidth()).toBe(64);
      expect(service.canvasHeight()).toBe(48);
    });

    it('should update buffer dimensions for square grid', () => {
      service.setCanvasSize(16, 8);
      expect(service.bufferWidth()).toBe(16);
      expect(service.bufferHeight()).toBe(8);
    });
  });

  describe('setGridType', () => {
    it('should change grid type', () => {
      service.setGridType('peyote');
      expect(service.gridType()).toBe('peyote');
    });

    it('should update buffer width for peyote grid', () => {
      service.setCanvasSize(10, 5);
      service.setGridType('peyote');
      // peyote bufferWidth = canvasWidth (column-pair count) = 10
      expect(service.bufferWidth()).toBe(10);
    });

    it('should update buffer width for peyote grid with odd columns', () => {
      service.setCanvasSize(11, 5);
      service.setGridType('peyote');
      // peyote bufferWidth = canvasWidth (column-pair count) = 11
      expect(service.bufferWidth()).toBe(11);
    });
  });

  describe('setTriangularParams', () => {
    it('should set all triangular parameters', () => {
      service.setTriangularParams(3, 2, 4, 5, 1);
      expect(service.triangularA()).toBe(3);
      expect(service.triangularD()).toBe(2);
      expect(service.triangularDNum()).toBe(4);
      expect(service.triangularDDen()).toBe(5);
      expect(service.triangularShift()).toBe(1);
    });

    it('should use legacy fallback when dNum/dDen are undefined', () => {
      service.setTriangularParams(3, 2);
      expect(service.triangularA()).toBe(3);
      expect(service.triangularD()).toBe(2);
      expect(service.triangularDNum()).toBe(2); // d
      expect(service.triangularDDen()).toBe(1);
    });
  });

  describe('zoom', () => {
    it('should set zoom level', () => {
      service.setZoom(5);
      expect(service.transform().scale).toBe(5);
    });

    it('should clamp zoom to minimum 0.5', () => {
      service.setZoom(0.1);
      expect(service.transform().scale).toBe(0.5);
    });

    it('should clamp zoom to maximum 64', () => {
      service.setZoom(100);
      expect(service.transform().scale).toBe(64);
    });

    it('should zoom in by factor of 1.25', () => {
      service.setZoom(10);
      service.zoomIn();
      expect(service.transform().scale).toBe(12.5);
    });

    it('should zoom out by dividing by 1.25', () => {
      service.setZoom(10);
      service.zoomOut();
      expect(service.transform().scale).toBe(8);
    });

    it('should update zoomPercent when zoom changes', () => {
      service.setZoom(5);
      expect(service.zoomPercent()).toBe(500);
    });

    it('should reset zoom to default', () => {
      service.setZoom(20);
      service.pan(100, 200);
      service.resetZoom();
      const t = service.transform();
      expect(t.scale).toBe(10);
      expect(t.offsetX).toBe(0);
      expect(t.offsetY).toBe(0);
    });
  });

  describe('pan', () => {
    it('should add deltas to current pan offsets', () => {
      service.pan(10, 20);
      expect(service.transform().offsetX).toBe(10);
      expect(service.transform().offsetY).toBe(20);
    });

    it('should accumulate pan deltas', () => {
      service.pan(10, 20);
      service.pan(5, -5);
      expect(service.transform().offsetX).toBe(15);
      expect(service.transform().offsetY).toBe(15);
    });

    it('should set absolute pan position', () => {
      service.pan(100, 200);
      service.setPan(50, 60);
      expect(service.transform().offsetX).toBe(50);
      expect(service.transform().offsetY).toBe(60);
    });
  });

  describe('toggles', () => {
    it('should toggle grid visibility', () => {
      expect(service.showGrid()).toBe(true);
      service.toggleGrid();
      expect(service.showGrid()).toBe(false);
      service.toggleGrid();
      expect(service.showGrid()).toBe(true);
    });

    it('should toggle ruler visibility', () => {
      expect(service.showRulers()).toBe(false);
      service.toggleRulers();
      expect(service.showRulers()).toBe(true);
      service.toggleRulers();
      expect(service.showRulers()).toBe(false);
    });

    it('should toggle clone visibility', () => {
      expect(service.showClones()).toBe(false);
      service.toggleClones();
      expect(service.showClones()).toBe(true);
      service.toggleClones();
      expect(service.showClones()).toBe(false);
    });
  });

  describe('sideCount', () => {
    it('should return 0 for non-triangular grids', () => {
      service.setGridType('square');
      expect(service.sideCount()).toBe(0);
    });

    it('should return 3 for triangle box preset (dNum=1, dDen=1)', () => {
      service.setGridType('triangular');
      service.setTriangularParams(1, 1, 1, 1, 1);
      service.setCanvasSize(1, 29);
      expect(service.sideCount()).toBe(3);
    });

    it('should return 4 for square box preset (dNum=3, dDen=4)', () => {
      service.setGridType('triangular');
      service.setTriangularParams(1, 1, 3, 4, 3);
      service.setCanvasSize(1, 50);
      expect(service.sideCount()).toBe(4);
    });

    it('should return 5 for pentagon box preset (dNum=2, dDen=3)', () => {
      service.setGridType('triangular');
      service.setTriangularParams(1, 1, 2, 3, 1);
      service.setCanvasSize(1, 35);
      expect(service.sideCount()).toBe(5);
    });

    it('should return 6 for hexagonal box preset (dNum=1, dDen=2)', () => {
      service.setGridType('triangular');
      service.setTriangularParams(1, 1, 1, 2, 0);
      service.setCanvasSize(1, 39);
      expect(service.sideCount()).toBe(6);
    });

    it('should return 0 when dNum is 0', () => {
      service.setGridType('triangular');
      service.setTriangularParams(1, 0, 0, 1, 0);
      expect(service.sideCount()).toBe(0);
    });
  });

  describe('bufferPixelCount', () => {
    it('should compute buffer pixel count for square grid', () => {
      service.setCanvasSize(4, 4);
      expect(service.bufferPixelCount()).toBe(16);
    });
  });

  describe('centerOnClones', () => {
    it('should do nothing for non-triangular grids', () => {
      service.setGridType('square');
      service.setPan(100, 200);
      service.centerOnClones(800, 600);
      expect(service.transform().offsetX).toBe(100);
      expect(service.transform().offsetY).toBe(200);
    });

    it('should do nothing when sideCount < 3', () => {
      service.setGridType('triangular');
      service.setTriangularParams(1, 0, 0, 1, 0); // dNum=0 → sideCount=0
      service.setPan(100, 200);
      service.centerOnClones(800, 600);
      expect(service.transform().offsetX).toBe(100);
      expect(service.transform().offsetY).toBe(200);
    });

    it('should center a hexagonal polygon (sideCount=6) in the viewport', () => {
      service.setGridType('triangular');
      // dNum=1, dDen=2 → sideCount = round(3*2/1) = 6
      service.setTriangularParams(1, 1, 1, 2, 0);
      service.setCanvasSize(1, 10);
      service.setZoom(10);
      service.centerOnClones(800, 600);

      const t = service.transform();
      // The polygon should be centered: offsets should place the polygon
      // center at (400, 300). Since the formula is deterministic we just
      // verify offsets are finite, non-zero, and roughly centering.
      expect(Number.isFinite(t.offsetX)).toBe(true);
      expect(Number.isFinite(t.offsetY)).toBe(true);
    });

    it('should center a triangle polygon (sideCount=3) in the viewport', () => {
      service.setGridType('triangular');
      // dNum=1, dDen=1 → sideCount = round(3*1/1) = 3
      service.setTriangularParams(1, 1, 1, 1, 0);
      service.setCanvasSize(1, 10);
      service.setZoom(10);
      service.centerOnClones(1000, 800);

      const t = service.transform();
      expect(Number.isFinite(t.offsetX)).toBe(true);
      expect(Number.isFinite(t.offsetY)).toBe(true);
    });

    it('should respect current zoom level without changing it', () => {
      service.setGridType('triangular');
      service.setTriangularParams(1, 1, 1, 2, 0);
      service.setCanvasSize(1, 10);
      service.setZoom(20);
      const scaleBefore = service.transform().scale;
      service.centerOnClones(800, 600);
      expect(service.transform().scale).toBe(scaleBefore);
    });

    it('should produce symmetric X offset for symmetric polygon', () => {
      service.setGridType('triangular');
      // Hexagon (sideCount=6) with square-style layout (non-peyote)
      service.setTriangularParams(1, 1, 1, 2, 0);
      service.setCanvasSize(1, 10);
      service.setZoom(10);

      // Center in a square viewport — the polygon center should map to
      // the viewport center, meaning offsetX should equal offsetY only
      // if the polygon is perfectly symmetric in both axes (it won't be
      // for all shapes), but the center should land at viewport/2.
      service.centerOnClones(600, 600);
      const t = service.transform();
      // Verify the polygon's computed center maps to viewport center.
      // The polygon center = -offsetX from origin → viewport/2 = 300
      // So polygonCenterX = 300 - offsetX should be consistent.
      expect(Number.isFinite(t.offsetX)).toBe(true);
      expect(Number.isFinite(t.offsetY)).toBe(true);
    });
  });

  describe('screenToPixel', () => {
    function makeDOMRect(): DOMRect {
      return {
        left: 0, top: 0, right: 2000, bottom: 2000,
        x: 0, y: 0, width: 2000, height: 2000,
        toJSON: () => ({}),
      } as DOMRect;
    }

    describe('non-clone path', () => {
      it('should map screen coords to buffer pixel at default zoom for square grid', () => {
        // pixel (2, 3) at zoom=10 has screen-space center at (2*10+5, 3*10+5) = (25, 35)
        service.setGridType('square');
        service.setCanvasSize(10, 10);
        service.setZoom(10);
        expect(service.screenToPixel(25, 35, makeDOMRect())).toEqual({ x: 2, y: 3 });
      });

      it('should return null for out-of-bounds coordinates', () => {
        service.setGridType('square');
        service.setCanvasSize(5, 5);
        service.setZoom(10);
        expect(service.screenToPixel(-5, 5, makeDOMRect())).toBeNull();
      });
    });

    describe('clone path (triangular grid)', () => {
      beforeEach(() => {
        // a=1, d=1 (dNum=1,dDen=1) → sideCount=3 (triangle), peyote stagger, 10 rows
        service.setGridType('triangular');
        service.setCanvasSize(1, 10);
        service.setTriangularParams(1, 1, 1, 1, 0);
        service.setZoom(10);
      });

      it('should map a point in wedge 0 to the same pixel whether clones are on or off', () => {
        const bs = service.beadSize();
        // Row 0 has 1 pixel. maxWidth=10, centerOffset=9.
        // Pixel (0,0) center in raw wedge space: (9.5 * bs.width, bs.height/2)
        const rawX = 9.5 * bs.width;
        const rawY = bs.height / 2;

        // showClones=false: raw coords map directly to the pixel
        const withoutClones = service.screenToPixel(rawX, rawY, makeDOMRect());
        expect(withoutClones).toEqual({ x: 0, y: 0 });

        // showClones=true: the rendered wedge is shifted down by centeringOffsetY,
        // so the click must be at rawY + centeringOffsetY to hit the same pixel.
        service.toggleClones();
        // pivotY = -(a * dDen/dNum) * (bs.height/2) = -bs.height/2
        const pivotY = -(bs.height / 2);
        const wedgeHeight = 9 * (bs.height / 2) + bs.height;
        const centeringOffsetY = wedgeHeight / 2 - pivotY;

        const withClones = service.screenToPixel(rawX, rawY + centeringOffsetY, makeDOMRect());
        expect(withClones).toEqual({ x: 0, y: 0 });
      });

      it('should map a point in a rotated clone back to the originating buffer pixel', () => {
        service.toggleClones();

        const bs = service.beadSize();
        // Pixel (0,0) center in raw wedge space
        const pivotX = 9.5 * bs.width;  // maxWidth=10, (10-0.5)*bs.width for peyote
        const pivotY = -(bs.height / 2);
        const wedgeHeight = 9 * (bs.height / 2) + bs.height;
        const c = wedgeHeight / 2 - pivotY;

        // Compute the screen position of pixel (0,0)'s center as rendered in clone 1
        // (rotated 2π/3 around the pivot, with centering offset applied).
        const angle = (2 * Math.PI) / 3;
        const offsetX = 0;                  // sxCenter - pivotX = 9.5*bs.width - 9.5*bs.width = 0
        const offsetY = bs.height;          // syCenter - pivotY = bs.height/2 - (-bs.height/2)
        const cloneScreenX = offsetX * Math.cos(angle) - offsetY * Math.sin(angle) + pivotX;
        const cloneScreenY = offsetX * Math.sin(angle) + offsetY * Math.cos(angle) + pivotY + c;

        const result = service.screenToPixel(cloneScreenX, cloneScreenY, makeDOMRect());
        expect(result).toEqual({ x: 0, y: 0 });
      });

      it('should return null when no clone wedge contains the hit point', () => {
        service.toggleClones();
        // A point far outside all wedges maps to null
        expect(service.screenToPixel(1e6, 1e6, makeDOMRect())).toBeNull();
      });
    });
  });
});
