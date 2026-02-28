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
      // 4-column peyote: bufferWidth=2, bufferHeight=4, pixelCount=8
      const data = makeDialogData({
        canvasWidth: 4,
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
});
