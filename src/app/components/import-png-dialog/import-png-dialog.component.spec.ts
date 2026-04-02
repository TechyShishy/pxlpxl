import { TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import {
  ImportPngDialogComponent,
  ImportPngDialogData,
  SamplingMode,
  QuantizeAlgorithm,
  type ImportPngResult,
} from './import-png-dialog.component';
import type { ColorPoolId } from '../../utils/color-pools';

// ── OffscreenCanvas shim for test environment ────────────────────────

function makeMockImageBitmap(width = 4, height = 4): ImageBitmap {
  return { width, height, close: vi.fn() } as unknown as ImageBitmap;
}

function makeDialogData(overrides: Partial<ImportPngDialogData> = {}): ImportPngDialogData {
  return {
    imageBitmap: makeMockImageBitmap(),
    canvasWidth: 4,
    canvasHeight: 4,
    gridType: 'square',
    bufferWidth: 4,
    bufferHeight: 4,
    bufferPixelCount: 16,
    ...overrides,
  };
}

describe('ImportPngDialogComponent', () => {
  function setup(data: ImportPngDialogData = makeDialogData()) {
    const closeSpy = vi.fn();
    TestBed.configureTestingModule({
      imports: [ImportPngDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close: closeSpy } },
      ],
    });
    const fixture = TestBed.createComponent(ImportPngDialogComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, closeSpy };
  }

  it('should create without errors', () => {
    const { component } = setup();
    expect(component).toBeTruthy();
  });

  it('should default sampling mode to nearest', () => {
    const { component } = setup();
    const mode = (component as unknown as { samplingMode: { (): SamplingMode } }).samplingMode();
    expect(mode).toBe('nearest');
  });

  it('should allow sampling mode to be set to area', () => {
    const { component } = setup();
    const c = component as unknown as { samplingMode: { (): SamplingMode; set: (v: SamplingMode) => void } };
    c.samplingMode.set('area');
    expect(c.samplingMode()).toBe('area');
  });

  it('should close with undefined when cancelled', () => {
    const { component, closeSpy } = setup();
    (component as unknown as { onCancel: () => void }).onCancel();
    expect(closeSpy).toHaveBeenCalledWith(undefined);
  });

  it('should close with a Uint8ClampedArray when import is confirmed', () => {
    // Polyfill OffscreenCanvas in the test environment.
    const originalOffscreen = (globalThis as Record<string, unknown>)['OffscreenCanvas'];
    const mockCtx = {
      drawImage: vi.fn(),
      getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4).fill(128),
        width: w,
        height: h,
      })),
    };
    (globalThis as Record<string, unknown>)['OffscreenCanvas'] = class {
      constructor(public width: number, public height: number) {}
      getContext() { return mockCtx; }
    };

    try {
      const { component, closeSpy } = setup();
      (component as unknown as { onImport: () => void }).onImport();
      expect(closeSpy).toHaveBeenCalled();
      const [result] = closeSpy.mock.calls[0] as [ImportPngResult];
      expect(result.buffer).toBeInstanceOf(Uint8ClampedArray);
      expect(Array.isArray(result.palette)).toBe(true);
    } finally {
      (globalThis as Record<string, unknown>)['OffscreenCanvas'] = originalOffscreen;
    }
  });

  it('should produce a buffer of the correct size for a square grid', () => {
    const originalOffscreen = (globalThis as Record<string, unknown>)['OffscreenCanvas'];
    const mockCtx = {
      drawImage: vi.fn(),
      getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4).fill(255),
        width: w,
        height: h,
      })),
    };
    (globalThis as Record<string, unknown>)['OffscreenCanvas'] = class {
      constructor(public width: number, public height: number) {}
      getContext() { return mockCtx; }
    };

    try {
      const data = makeDialogData({ canvasWidth: 2, canvasHeight: 2, bufferWidth: 2, bufferHeight: 2, bufferPixelCount: 4 });
      const { component, closeSpy } = setup(data);
      (component as unknown as { onImport: () => void }).onImport();
      const [result] = closeSpy.mock.calls[0] as [ImportPngResult];
      // bufferPixelCount * 4 RGBA bytes
      expect(result.buffer.length).toBe(4 * 4);
    } finally {
      (globalThis as Record<string, unknown>)['OffscreenCanvas'] = originalOffscreen;
    }
  });

  it('should produce a buffer of the correct size for a peyote grid', () => {
    const originalOffscreen = (globalThis as Record<string, unknown>)['OffscreenCanvas'];
    const mockCtx = {
      drawImage: vi.fn(),
      getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4).fill(200),
        width: w,
        height: h,
      })),
    };
    (globalThis as Record<string, unknown>)['OffscreenCanvas'] = class {
      constructor(public width: number, public height: number) {}
      getContext() { return mockCtx; }
    };

    try {
      // 4 visual columns, 2 visual bead rows: canvasWidth = bufferWidth = 2 (column-pair count),
      // bufferHeight = 4 (interleaved rows), bufferPixelCount = 8.
      const data = makeDialogData({
        canvasWidth: 2,
        canvasHeight: 4,
        gridType: 'peyote',
        bufferWidth: 2,
        bufferHeight: 4,
        bufferPixelCount: 8,
      });
      const { component, closeSpy } = setup(data);
      (component as unknown as { onImport: () => void }).onImport();
      const [result] = closeSpy.mock.calls[0] as [ImportPngResult];
      expect(result.buffer.length).toBe(8 * 4); // 8 pixels × 4 RGBA bytes
    } finally {
      (globalThis as Record<string, unknown>)['OffscreenCanvas'] = originalOffscreen;
    }
  });

  describe('processed preview rendering', () => {
    function setupWithOffscreen(data?: ImportPngDialogData) {
      const originalOffscreen = (globalThis as Record<string, unknown>)['OffscreenCanvas'];
      const mockOffscreenCtx = {
        drawImage: vi.fn(),
        getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({
          data: new Uint8ClampedArray(w * h * 4).fill(128),
          width: w,
          height: h,
        })),
      };
      (globalThis as Record<string, unknown>)['OffscreenCanvas'] = class {
        constructor(public width: number, public height: number) {}
        getContext() { return mockOffscreenCtx; }
      };

      const result = setup(data ?? makeDialogData());
      return { ...result, mockOffscreenCtx, restore: () => {
        (globalThis as Record<string, unknown>)['OffscreenCanvas'] = originalOffscreen;
      }};
    }

    it('should call computeProcessedBuffer when importing', () => {
      const { component, closeSpy, restore } = setupWithOffscreen();
      try {
        (component as unknown as { onImport: () => void }).onImport();
        expect(closeSpy).toHaveBeenCalled();
        const [result] = closeSpy.mock.calls[0] as [ImportPngResult];
        expect(result.buffer).toBeInstanceOf(Uint8ClampedArray);
        expect(result.palette).toBeDefined();
        expect(Array.isArray(result.palette)).toBe(true);
      } finally {
        restore();
      }
    });

    it('should use settled cache for import when available', () => {
      const { component, closeSpy, restore } = setupWithOffscreen();
      try {
        // Access private members to simulate settle
        const c = component as unknown as Record<string, unknown>;

        // Manually trigger computeProcessedBuffer to populate a result
        const computeFn = (c['computeProcessedBuffer'] as (algo: QuantizeAlgorithm | undefined) => { buffer: Uint8ClampedArray; palette: unknown[] }).bind(component);
        const result = computeFn('median-cut');

        // Simulate settled state
        c['settledBuffer'] = result.buffer;
        c['settledPalette'] = result.palette;
        c['settledDirty'] = false;

        (component as unknown as { onImport: () => void }).onImport();
        const [importResult] = closeSpy.mock.calls[0] as [ImportPngResult];
        // Should use the cached buffer
        expect(importResult.buffer).toBe(result.buffer);
      } finally {
        restore();
      }
    });

    it('should invalidate settled cache when invalidateSettled is called', () => {
      const { component, restore } = setupWithOffscreen();
      try {
        const c = component as unknown as Record<string, unknown>;
        // Simulate that settled cache was populated
        c['settledDirty'] = false;
        c['settledBuffer'] = new Uint8ClampedArray(64);
        c['settledPalette'] = [{ r: 128, g: 128, b: 128, a: 128 }];

        // Call invalidateSettled directly
        (c['invalidateSettled'] as () => void).call(component);

        // Settled should be invalidated
        expect(c['settledDirty']).toBe(true);
        expect(c['settledBuffer']).toBeNull();
        expect(c['settledPalette']).toBeNull();
      } finally {
        restore();
      }
    });

    it('should produce quantized buffer when maxColors is set', () => {
      const { component, closeSpy, restore } = setupWithOffscreen();
      try {
        // All pixels are rgba(128,128,128,128) from the mock — 1 unique color.
        // Set maxColors to 1 so quantization path is exercised but doesn't reduce.
        (component as unknown as { maxColors: { set: (v: number) => void } }).maxColors.set(1);
        (component as unknown as { onImport: () => void }).onImport();
        const [result] = closeSpy.mock.calls[0] as [ImportPngResult];
        expect(result.palette.length).toBeLessThanOrEqual(1);
      } finally {
        restore();
      }
    });
  });

  describe('peyote grid import (new buffer model: canvasWidth = bufferWidth)', () => {
    function setupPeyoteWithOffscreen(overrides: Partial<ImportPngDialogData> = {}) {
      const originalOffscreen = (globalThis as Record<string, unknown>)['OffscreenCanvas'];
      const mockCtx = {
        imageSmoothingEnabled: false,
        drawImage: vi.fn(),
        getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({
          data: new Uint8ClampedArray(w * h * 4).fill(255),
          width: w,
          height: h,
        })),
      };
      let createdWidth = 0;
      (globalThis as Record<string, unknown>)['OffscreenCanvas'] = class {
        constructor(public width: number, public height: number) {
          createdWidth = width;
        }
        getContext() { return mockCtx; }
      };

      // New-model peyote: canvasWidth = bufferWidth = 2 (two column-pairs → 4 visual columns).
      // bufferHeight = 4 (interleaved rows for 2 visual bead rows).
      const data = makeDialogData({
        canvasWidth: 2,
        canvasHeight: 4,
        gridType: 'peyote',
        bufferWidth: 2,
        bufferHeight: 4,
        bufferPixelCount: 8,
        ...overrides,
      });

      const result = setup(data);
      return {
        ...result,
        mockCtx,
        getCreatedWidth: () => createdWidth,
        restore: () => {
          (globalThis as Record<string, unknown>)['OffscreenCanvas'] = originalOffscreen;
        },
      };
    }

    it('should size the offscreen canvas to bufferWidth*2 wide (visual columns)', () => {
      const { restore, getCreatedWidth, component } = setupPeyoteWithOffscreen();
      try {
        // Trigger produceLayerData via onImport
        (component as unknown as { onImport: () => void }).onImport();
        // gridVisualW must be bufferWidth * 2 = 4, so the offscreen canvas width = round(4) = 4
        expect(getCreatedWidth()).toBe(4);
      } finally {
        restore();
      }
    });

    it('should populate all buffer pixels (no pixels skipped by wrong guard)', () => {
      const { restore, component, closeSpy } = setupPeyoteWithOffscreen();
      try {
        (component as unknown as { onImport: () => void }).onImport();
        const [result] = closeSpy.mock.calls[0] as [ImportPngResult];
        // All 8 pixels × 4 bytes.  Source is all-white (alpha=255), so every pixel
        // should have non-zero alpha.  With the visual-width bug, bx=1 (col 2 & 3)
        // is skipped, leaving 4 pixels as zero.
        const alphas: number[] = [];
        for (let i = 3; i < result.buffer.length; i += 4) {
          alphas.push(result.buffer[i]);
        }
        expect(alphas).toHaveLength(8);
        expect(alphas.every((a) => a > 0)).toBe(true);
      } finally {
        restore();
      }
    });
  });

  describe('colorPoolId', () => {
    it('should default to "any"', () => {
      const { component } = setup();
      const c = component as unknown as { colorPoolId: { (): ColorPoolId } };
      expect(c.colorPoolId()).toBe('any');
    });

    it('should allow colorPoolId to be set to "delica"', () => {
      const { component } = setup();
      const c = component as unknown as {
        colorPoolId: { (): ColorPoolId; set: (v: ColorPoolId) => void };
      };
      c.colorPoolId.set('delica');
      expect(c.colorPoolId()).toBe('delica');
    });
  });
});
