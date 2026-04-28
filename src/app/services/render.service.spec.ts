import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { RenderService } from './render.service';
import { LayerService } from './layer.service';
import { CanvasStateService } from './canvas-state.service';
import { GridService } from './grid.service';

// Polyfill ImageData for JSDOM test environment
beforeAll(() => {
  if (typeof globalThis.ImageData === 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-extraneous-class
    class ImageDataPolyfill {
      readonly width: number;
      readonly height: number;
      readonly data: Uint8ClampedArray;
      constructor(widthOrData: number | Uint8ClampedArray, heightOrWidth: number, maybeHeight?: number) {
        if (widthOrData instanceof Uint8ClampedArray) {
          this.data = widthOrData;
          this.width = heightOrWidth;
          this.height = maybeHeight ?? (widthOrData.length / 4 / heightOrWidth);
        } else {
          this.width = widthOrData;
          this.height = heightOrWidth;
          this.data = new Uint8ClampedArray(this.width * this.height * 4);
        }
      }
    }
    (globalThis as Record<string, unknown>)['ImageData'] = ImageDataPolyfill;
  }
});

describe('RenderService', () => {
  let service: RenderService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        RenderService,
        {
          provide: LayerService,
          useValue: {
            layers: vi.fn(() => []),
          },
        },
        {
          provide: CanvasStateService,
          useValue: {
            canvasWidth: vi.fn(() => 2),
            canvasHeight: vi.fn(() => 2),
            bufferWidth: vi.fn(() => 2),
            bufferHeight: vi.fn(() => 2),
            gridType: vi.fn(() => 'square'),
            showGrid: vi.fn(() => false),
            transform: vi.fn(() => ({ scale: 10, offsetX: 0, offsetY: 0, rotation: 0 as const })),
            beadSize: vi.fn(() => ({ width: 10, height: 10 })),
            triangularA: vi.fn(() => 1),
            triangularD: vi.fn(() => 1),
            triangularDNum: vi.fn(() => 1),
            triangularDDen: vi.fn(() => 1),
            triangularShift: vi.fn(() => 0),
          },
        },
        {
          provide: GridService,
          useValue: {
            isPeyote: vi.fn(() => false),
            isAnyTriangular: vi.fn(() => false),
            isValidPixel: vi.fn(() => true),
            pixelToScreen: vi.fn(
              (bx: number, by: number, beadSize: { width: number; height: number }) => ({ sx: bx * beadSize.width, sy: by * beadSize.height }),
            ),
            bufferToVisual: vi.fn((bx: number, by: number) => ({ col: bx, beadRow: by })),
            getAnyTriangularRowWidth: vi.fn(() => 1),
            getAnyTriangularMaxWidth: vi.fn(() => 1),
            usesPeyoteStagger: vi.fn(() => false),
          },
        },
      ],
    });

    service = TestBed.inject(RenderService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('compositeToImageData', () => {
    it('should return empty ImageData when there are no layers', () => {
      const result = service.compositeToImageData();
      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
      // All pixels should be fully transparent
      for (let i = 0; i < result.data.length; i++) {
        expect(result.data[i]).toBe(0);
      }
    });

    it('should copy a single fully opaque layer exactly', () => {
      const data = new Uint8ClampedArray(2 * 2 * 4);
      // Set pixel (0,0) to red
      data[0] = 255; data[1] = 0; data[2] = 0; data[3] = 255;
      // Set pixel (1,0) to green
      data[4] = 0; data[5] = 255; data[6] = 0; data[7] = 255;
      // Set pixel (0,1) to blue
      data[8] = 0; data[9] = 0; data[10] = 255; data[11] = 255;
      // Set pixel (1,1) to white
      data[12] = 255; data[13] = 255; data[14] = 255; data[15] = 255;

      const layerMock = TestBed.inject(LayerService) as unknown as { layers: ReturnType<typeof vi.fn> };
      layerMock.layers.mockReturnValue([{ visible: true, opacity: 1, data }]);

      const result = service.compositeToImageData();

      // Red pixel
      expect(result.data[0]).toBe(255);
      expect(result.data[1]).toBe(0);
      expect(result.data[2]).toBe(0);
      expect(result.data[3]).toBe(255);

      // Green pixel
      expect(result.data[4]).toBe(0);
      expect(result.data[5]).toBe(255);
      expect(result.data[6]).toBe(0);
      expect(result.data[7]).toBe(255);

      // Blue pixel
      expect(result.data[8]).toBe(0);
      expect(result.data[9]).toBe(0);
      expect(result.data[10]).toBe(255);
      expect(result.data[11]).toBe(255);
    });

    it('should skip hidden layers', () => {
      const data = new Uint8ClampedArray(2 * 2 * 4);
      data[0] = 255; data[1] = 0; data[2] = 0; data[3] = 255;

      const layerMock = TestBed.inject(LayerService) as unknown as { layers: ReturnType<typeof vi.fn> };
      layerMock.layers.mockReturnValue([{ visible: false, opacity: 1, data }]);

      const result = service.compositeToImageData();

      // Should all be transparent — hidden layer skipped
      expect(result.data[0]).toBe(0);
      expect(result.data[3]).toBe(0);
    });

    it('should skip layers with zero opacity', () => {
      const data = new Uint8ClampedArray(2 * 2 * 4);
      data[0] = 255; data[1] = 0; data[2] = 0; data[3] = 255;

      const layerMock = TestBed.inject(LayerService) as unknown as { layers: ReturnType<typeof vi.fn> };
      layerMock.layers.mockReturnValue([{ visible: true, opacity: 0, data }]);

      const result = service.compositeToImageData();

      expect(result.data[0]).toBe(0);
      expect(result.data[3]).toBe(0);
    });

    it('should composite two opaque layers (top layer overwrites)', () => {
      // Bottom layer: red pixel at (0,0)
      const bottomData = new Uint8ClampedArray(2 * 2 * 4);
      bottomData[0] = 255; bottomData[1] = 0; bottomData[2] = 0; bottomData[3] = 255;

      // Top layer: blue pixel at (0,0)
      const topData = new Uint8ClampedArray(2 * 2 * 4);
      topData[0] = 0; topData[1] = 0; topData[2] = 255; topData[3] = 255;

      const layerMock = TestBed.inject(LayerService) as unknown as { layers: ReturnType<typeof vi.fn> };
      layerMock.layers.mockReturnValue([
        { visible: true, opacity: 1, data: bottomData },
        { visible: true, opacity: 1, data: topData },
      ]);

      const result = service.compositeToImageData();

      // Blue overwrites red (both fully opaque, "over" compositing)
      expect(result.data[0]).toBe(0);
      expect(result.data[1]).toBe(0);
      expect(result.data[2]).toBe(255);
      expect(result.data[3]).toBe(255);
    });

    it('should apply Porter-Duff "over" alpha compositing', () => {
      // Bottom layer: red at full alpha
      const bottomData = new Uint8ClampedArray(2 * 2 * 4);
      bottomData[0] = 255; bottomData[1] = 0; bottomData[2] = 0; bottomData[3] = 255;

      // Top layer: blue at 50% alpha
      const topData = new Uint8ClampedArray(2 * 2 * 4);
      topData[0] = 0; topData[1] = 0; topData[2] = 255; topData[3] = 128;

      const layerMock = TestBed.inject(LayerService) as unknown as { layers: ReturnType<typeof vi.fn> };
      layerMock.layers.mockReturnValue([
        { visible: true, opacity: 1, data: bottomData },
        { visible: true, opacity: 1, data: topData },
      ]);

      const result = service.compositeToImageData();

      // srcA = 128/255 ≈ 0.502, dstA = 1.0
      // outA = 0.502 + 1.0*(1-0.502) = 1.0
      // outR = (0*0.502 + 255*1.0*0.498)/1.0 ≈ 127
      // outG = 0
      // outB = (255*0.502 + 0*1.0*0.498)/1.0 ≈ 128
      expect(result.data[3]).toBe(255); // output alpha = 255
      // Red channel: should be approximately 127
      expect(result.data[0]).toBeGreaterThanOrEqual(125);
      expect(result.data[0]).toBeLessThanOrEqual(129);
      // Blue channel should be approximately 128
      expect(result.data[2]).toBeGreaterThanOrEqual(126);
      expect(result.data[2]).toBeLessThanOrEqual(130);
    });

    it('should apply layer opacity as a multiplier on alpha', () => {
      // Single layer: red at full pixel alpha but 50% layer opacity
      const data = new Uint8ClampedArray(2 * 2 * 4);
      data[0] = 255; data[1] = 0; data[2] = 0; data[3] = 255;

      const layerMock = TestBed.inject(LayerService) as unknown as { layers: ReturnType<typeof vi.fn> };
      layerMock.layers.mockReturnValue([{ visible: true, opacity: 0.5, data }]);

      const result = service.compositeToImageData();

      // srcA = (255/255) * 0.5 = 0.5, outA = 0.5
      // outR = 255*0.5/0.5 = 255
      expect(result.data[0]).toBe(255);
      // outA ≈ 0.5 * 255 ≈ 127.5
      expect(result.data[3]).toBeGreaterThanOrEqual(126);
      expect(result.data[3]).toBeLessThanOrEqual(129);
    });

    it('should composite transparent pixels over opaque ones without change', () => {
      // Bottom: green
      const bottomData = new Uint8ClampedArray(2 * 2 * 4);
      bottomData[0] = 0; bottomData[1] = 200; bottomData[2] = 0; bottomData[3] = 255;

      // Top: fully transparent
      const topData = new Uint8ClampedArray(2 * 2 * 4);
      // all zeros — transparent

      const layerMock = TestBed.inject(LayerService) as unknown as { layers: ReturnType<typeof vi.fn> };
      layerMock.layers.mockReturnValue([
        { visible: true, opacity: 1, data: bottomData },
        { visible: true, opacity: 1, data: topData },
      ]);

      const result = service.compositeToImageData();

      // Green should be unchanged
      expect(result.data[0]).toBe(0);
      expect(result.data[1]).toBe(200);
      expect(result.data[2]).toBe(0);
      expect(result.data[3]).toBe(255);
    });

    it('should composite three layers correctly', () => {
      // Layer 1 (bottom): red, fully opaque
      const l1 = new Uint8ClampedArray(2 * 2 * 4);
      l1[0] = 255; l1[1] = 0; l1[2] = 0; l1[3] = 255;

      // Layer 2 (middle): green, fully opaque — should overwrite red
      const l2 = new Uint8ClampedArray(2 * 2 * 4);
      l2[0] = 0; l2[1] = 255; l2[2] = 0; l2[3] = 255;

      // Layer 3 (top): transparent — should preserve green
      const l3 = new Uint8ClampedArray(2 * 2 * 4);

      const layerMock = TestBed.inject(LayerService) as unknown as { layers: ReturnType<typeof vi.fn> };
      layerMock.layers.mockReturnValue([
        { visible: true, opacity: 1, data: l1 },
        { visible: true, opacity: 1, data: l2 },
        { visible: true, opacity: 1, data: l3 },
      ]);

      const result = service.compositeToImageData();

      expect(result.data[0]).toBe(0);
      expect(result.data[1]).toBe(255);
      expect(result.data[2]).toBe(0);
      expect(result.data[3]).toBe(255);
    });

    it('should handle semi-transparent source onto transparent destination', () => {
      // Single layer: blue at 50% alpha onto empty
      const data = new Uint8ClampedArray(2 * 2 * 4);
      data[0] = 0; data[1] = 0; data[2] = 255; data[3] = 128;

      const layerMock = TestBed.inject(LayerService) as unknown as { layers: ReturnType<typeof vi.fn> };
      layerMock.layers.mockReturnValue([{ visible: true, opacity: 1, data }]);

      const result = service.compositeToImageData();

      // srcA = 128/255 ≈ 0.502, dstA = 0 → outA = srcA
      // outB = 255*srcA / srcA = 255
      expect(result.data[2]).toBe(255);
      expect(result.data[3]).toBe(128);
    });
  });

  describe('drawGrid peyote offset parity', () => {
    let peyoteService: RenderService;

    beforeEach(() => {
      TestBed.resetTestingModule();

      // Real bufferToVisual convention: even buffer rows → even visual cols (UP),
      // odd buffer rows → odd visual cols (DOWN).
      const mockGridServicePeyote = {
        isPeyote: vi.fn(() => true),
        isAnyTriangular: vi.fn(() => false),
        bufferToVisual: vi.fn((bx: number, by: number) => ({
          col: by % 2 === 1 ? bx * 2 + 1 : bx * 2,
          beadRow: Math.floor(by / 2),
        })),
        pixelToScreen: vi.fn((bx: number, by: number, beadSize: { width: number; height: number }) => ({
          sx: bx * beadSize.width,
          sy: by * beadSize.height,
        })),
        // Note: pixelToScreen is only called from drawCheckerboard (fillRect, no moveTo),
        // so this simplified formula does not affect the moveTo assertions below.
        getAnyTriangularRowWidth: vi.fn(() => 1),
        getAnyTriangularMaxWidth: vi.fn(() => 1),
        usesPeyoteStagger: vi.fn(() => false),
        isValidPixel: vi.fn(() => true),
      };

      TestBed.configureTestingModule({
        providers: [
          RenderService,
          {
            provide: LayerService,
            useValue: { layers: vi.fn(() => []) },
          },
          {
            provide: CanvasStateService,
            useValue: {
              canvasWidth: vi.fn(() => 2),
              canvasHeight: vi.fn(() => 3),
              bufferWidth: vi.fn(() => 1),
              bufferHeight: vi.fn(() => 3),
              gridType: vi.fn(() => 'peyote'),
              showGrid: vi.fn(() => true),
              showClones: vi.fn(() => false),
              sideCount: vi.fn(() => 1),
              transform: vi.fn(() => ({ scale: 1, offsetX: 0, offsetY: 0, rotation: 0 as const })),
              beadSize: vi.fn(() => ({ width: 10, height: 10 })),
              triangularA: vi.fn(() => 1),
              triangularD: vi.fn(() => 1),
              triangularDNum: vi.fn(() => 1),
              triangularDDen: vi.fn(() => 1),
              triangularShift: vi.fn(() => 0),
            },
          },
          { provide: GridService, useValue: mockGridServicePeyote },
        ],
      });

      peyoteService = TestBed.inject(RenderService);
    });

    it('should apply half-bead Y offset to odd visual sub-columns and zero offset to even sub-columns', () => {
      // bufWidth=1, bufHeight=3:
      //   beadsEven = Math.ceil(3/2) = 2  → for even visual cols (up/unshifted)
      //   beadsOdd  = Math.floor(3/2) = 1 → for odd  visual cols (down/shifted)
      //
      // Expected horizontal line moveTo Y values:
      //   col 0 (even): offsetY=0,  colBeads=2 → y = 0, 10, 20
      //   col 1 (odd):  offsetY=5,  colBeads=1 → y = 5, 15
      const ctx = {
        clearRect: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        scale: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        fillRect: vi.fn(),
        fillStyle: '' as string | CanvasGradient | CanvasPattern,
        strokeStyle: '' as string | CanvasGradient | CanvasPattern,
        lineWidth: 0,
        imageSmoothingEnabled: false,
        globalAlpha: 1,
      } as unknown as CanvasRenderingContext2D;

      peyoteService.render(ctx, 200, 200);

      // Only drawGrid uses moveTo — drawCheckerboard (fillRect only) and
      // renderPeyoteLayers (empty layers) do not emit moveTo calls.
      const moveArgs = (ctx.moveTo as ReturnType<typeof vi.fn>).mock.calls as [number, number][];
      const lineArgs = (ctx.lineTo as ReturnType<typeof vi.fn>).mock.calls as [number, number][];

      // Horizontal lines: paired lineTo has same y and x = moveTo.x + beadSize.width (10).
      const horizontalMoves = moveArgs.filter((mv, i) => {
        const ln = lineArgs[i];
        return ln !== undefined && ln[1] === mv[1] && ln[0] === mv[0] + 10;
      });

      // Even visual col (col=0, x=0): zero Y offset, 3 horizontal lines
      const col0 = horizontalMoves.filter(([x]) => x === 0).map(([, y]) => y);
      expect(col0).toEqual([0, 10, 20]);

      // Odd visual col (col=1, x=10): half-bead Y offset (5), 2 horizontal lines
      const col1 = horizontalMoves.filter(([x]) => x === 10).map(([, y]) => y);
      expect(col1).toEqual([5, 15]);
    });
  });
});
