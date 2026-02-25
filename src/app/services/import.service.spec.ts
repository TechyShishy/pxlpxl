import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { ImportService } from './import.service';
import { LayerService } from './layer.service';
import { CanvasStateService } from './canvas-state.service';
import { ColorService } from './color.service';
import { HistoryService } from './history.service';
import { GridService } from './grid.service';
import {
  PxlFile,
  PXL_FORMAT_VERSION,
  uint8ArrayToBase64,
  BLACK,
  WHITE,
} from '../models';

/** Build a minimal valid PxlFile object */
function makePxlFile(
  overrides?: Partial<PxlFile>,
): PxlFile {
  const data = new Uint8ClampedArray(4 * 4 * 4); // 4x4 transparent
  return {
    version: PXL_FORMAT_VERSION,
    name: 'test',
    width: 4,
    height: 4,
    gridType: 'square',
    palette: [BLACK, WHITE],
    layers: [
      { id: 'l1', name: 'Layer 1', visible: true, opacity: 1, data: uint8ArrayToBase64(data) },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Gzip-compress a string and return an ArrayBuffer */
async function compressToGzip(json: string): Promise<ArrayBuffer> {
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(new TextEncoder().encode(json));
  writer.close();

  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result.buffer;
}

/** Create a minimal valid 1x1 red PNG as an ArrayBuffer */
function createMinimalPng(): ArrayBuffer {
  // Smallest valid PNG: 1x1 red pixel (RGBA)
  // This is a pre-built minimal PNG binary
  const base64Png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
  const binary = atob(base64Png);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

describe('ImportService', () => {
  let service: ImportService;
  let layerService: LayerService;
  let canvasState: CanvasStateService;
  let colorService: ColorService;
  let historyService: HistoryService;
  let gridService: GridService;

  /**
   * Build a MatDialog mock whose open() returns a dialog ref that emits
   * `result` from afterClosed(). Pass `undefined` to simulate cancellation.
   */
  function makeDialogMock(result: Uint8ClampedArray | undefined = new Uint8ClampedArray(4 * 4 * 4)) {
    const mockDialogRef = { afterClosed: () => of(result as Uint8ClampedArray | undefined) };
    return { open: vi.fn(() => mockDialogRef) };
  }

  let dialogMock: ReturnType<typeof makeDialogMock>;

  beforeEach(() => {
    dialogMock = makeDialogMock();
    TestBed.configureTestingModule({
      providers: [{ provide: MatDialog, useValue: dialogMock }],
    });
    service = TestBed.inject(ImportService);
    layerService = TestBed.inject(LayerService);
    canvasState = TestBed.inject(CanvasStateService);
    colorService = TestBed.inject(ColorService);
    historyService = TestBed.inject(HistoryService);
    gridService = TestBed.inject(GridService);

    // Set up a baseline canvas
    canvasState.setCanvasSize(4, 4);
    canvasState.setGridType('square');
    layerService.initLayers(4, 4);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ── Magic byte detection ──────────────────────────────────────────────

  /** Set up mocks for browser canvas APIs not available in test env */
  function mockCanvasApis(): void {
    const fakeImageData = { data: new Uint8ClampedArray(4 * 4 * 4) };
    const fakeCtx = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => fakeImageData),
    };
    vi.stubGlobal('OffscreenCanvas', class {
      getContext(): unknown { return fakeCtx; }
    });
    vi.stubGlobal('createImageBitmap', vi.fn(() =>
      Promise.resolve({ width: 4, height: 4, close: vi.fn() }),
    ));
  }

  describe('importFromBuffer – magic byte detection', () => {
    beforeEach(() => mockCanvasApis());
    afterEach(() => vi.unstubAllGlobals());

    it('should throw for an unrecognised file format', async () => {
      const garbage = new Uint8Array([0x00, 0x00, 0x00, 0x00]).buffer;

      await expect(service.importFromBuffer(garbage, 'bad.dat'))
        .rejects.toThrow('Unrecognised file format');
    });

    it('should route PNG files to PNG import (opens dialog)', async () => {
      const pngBuffer = createMinimalPng();

      await expect(service.importFromBuffer(pngBuffer, 'test.png'))
        .resolves.toBeUndefined();
      expect(dialogMock.open).toHaveBeenCalledOnce();
    });

    it('should route gzip files to PXL import', async () => {
      const pxl = makePxlFile();
      const gzipped = await compressToGzip(JSON.stringify(pxl));

      await expect(service.importFromBuffer(gzipped, 'project.pxl'))
        .resolves.toBeUndefined();
    });
  });

  // ── PNG import ────────────────────────────────────────────────────────

  describe('importPng', () => {
    beforeEach(() => mockCanvasApis());
    afterEach(() => vi.unstubAllGlobals());

    it('should add a new layer after user confirms import in the dialog', async () => {
      // dialogMock is configured to emit a 4×4 buffer (default)
      const pngBuffer = createMinimalPng();

      await service.importFromBuffer(pngBuffer, 'icon.png');

      expect(layerService.layerCount()).toBe(2);
    });

    it('should open the dialog for peyote grids', async () => {
      canvasState.setGridType('peyote');
      // dialogMock returns a peyote-sized buffer (bufferPixelCount = 2×4 = 8)
      dialogMock.open.mockReturnValueOnce({
        afterClosed: () => of(new Uint8ClampedArray(8 * 4)),
      });

      const pngBuffer = createMinimalPng();
      await service.importFromBuffer(pngBuffer, 'beads.png');

      expect(dialogMock.open).toHaveBeenCalledOnce();
      expect(layerService.layerCount()).toBe(2);
    });

    it('should not add a layer when the dialog is cancelled', async () => {
      // Override to simulate cancellation (result = undefined)
      dialogMock.open.mockReturnValueOnce({
        afterClosed: () => of(undefined as Uint8ClampedArray | undefined),
      });

      const pngBuffer = createMinimalPng();
      await service.importFromBuffer(pngBuffer, 'icon.png');

      expect(layerService.layerCount()).toBe(1); // no new layer
    });

    it('should record an undoable command for the import', async () => {
      const pngBuffer = createMinimalPng();

      await service.importFromBuffer(pngBuffer, 'icon.png');

      expect(historyService.canUndo()).toBe(true);
      historyService.undo();
    });
  });

  // ── PXL import ────────────────────────────────────────────────────────

  describe('importPxl', () => {
    it('should hydrate canvas dimensions', async () => {
      const pxl = makePxlFile({ width: 8, height: 8, layers: [{
        id: 'l1', name: 'Layer 1', visible: true, opacity: 1,
        data: uint8ArrayToBase64(new Uint8ClampedArray(8 * 8 * 4)),
      }] });
      const gzipped = await compressToGzip(JSON.stringify(pxl));

      await service.importFromBuffer(gzipped, 'project.pxl');

      expect(canvasState.canvasWidth()).toBe(8);
      expect(canvasState.canvasHeight()).toBe(8);
    });

    it('should hydrate layers', async () => {
      const layer1Data = new Uint8ClampedArray(4 * 4 * 4);
      const layer2Data = new Uint8ClampedArray(4 * 4 * 4);
      layer2Data[0] = 255;

      const pxl = makePxlFile({
        layers: [
          { id: 'a', name: 'BG', visible: true, opacity: 1, data: uint8ArrayToBase64(layer1Data) },
          { id: 'b', name: 'FG', visible: false, opacity: 0.5, data: uint8ArrayToBase64(layer2Data) },
        ],
      });
      const gzipped = await compressToGzip(JSON.stringify(pxl));

      await service.importFromBuffer(gzipped, 'art.pxl');

      expect(layerService.layerCount()).toBe(2);
      const layers = layerService.layers();
      expect(layers[0].name).toBe('BG');
      expect(layers[1].name).toBe('FG');
      expect(layers[1].visible).toBe(false);
      expect(layers[1].opacity).toBe(0.5);
    });

    it('should hydrate palette', async () => {
      const pxl = makePxlFile({ palette: [{ r: 1, g: 2, b: 3, a: 255 }] });
      const gzipped = await compressToGzip(JSON.stringify(pxl));

      await service.importFromBuffer(gzipped, 'pal.pxl');

      expect(colorService.palette().length).toBe(1);
      expect(colorService.palette()[0].r).toBe(1);
    });

    it('should clear history when pxl has no history block', async () => {
      const mockCmd = { description: 'x', execute: vi.fn(), undo: vi.fn() };
      historyService.execute(mockCmd);
      expect(historyService.canUndo()).toBe(true);

      const pxl = makePxlFile();
      delete (pxl as unknown as Record<string, unknown>)['history'];
      const gzipped = await compressToGzip(JSON.stringify(pxl));

      await service.importFromBuffer(gzipped, 'no-hist.pxl');

      expect(historyService.canUndo()).toBe(false);
    });

    it('should throw for unsupported version', async () => {
      const pxl = makePxlFile({ version: 999 });
      const gzipped = await compressToGzip(JSON.stringify(pxl));

      await expect(service.importFromBuffer(gzipped, 'future.pxl'))
        .rejects.toThrow('Unsupported .pxl version');
    });

    it('should throw for corrupt JSON', async () => {
      const gzipped = await compressToGzip('this is not json{{{');

      await expect(service.importFromBuffer(gzipped, 'corrupt.pxl'))
        .rejects.toThrow('Failed to parse');
    });
  });

  // ── openFilePicker ────────────────────────────────────────────────────

  describe('openFilePicker', () => {
    it('should create a file input element', async () => {
      const createElementSpy = vi.spyOn(document, 'createElement');

      const mockInput = document.createElement('input');
      Object.defineProperty(mockInput, 'click', {
        value: vi.fn(() => {
          setTimeout(() => {
            window.dispatchEvent(new Event('focus'));
          }, 10);
        }),
      });
      createElementSpy.mockReturnValueOnce(mockInput);

      const result = await service.openFilePicker();

      expect(createElementSpy).toHaveBeenCalledWith('input');
      expect(result).toBeNull();
      createElementSpy.mockRestore();
    });
  });
});
