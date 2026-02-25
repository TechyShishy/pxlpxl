import { TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import {
  ImportPngDialogComponent,
  ImportPngDialogData,
  SamplingMode,
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
      const [result] = closeSpy.mock.calls[0] as [unknown];
      expect(result).toBeInstanceOf(Uint8ClampedArray);
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
      const [result] = closeSpy.mock.calls[0] as [Uint8ClampedArray];
      // bufferPixelCount * 4 RGBA bytes
      expect(result.length).toBe(4 * 4);
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
      const [result] = closeSpy.mock.calls[0] as [Uint8ClampedArray];
      expect(result.length).toBe(8 * 4); // 8 pixels × 4 RGBA bytes
    } finally {
      (globalThis as Record<string, unknown>)['OffscreenCanvas'] = originalOffscreen;
    }
  });
});
