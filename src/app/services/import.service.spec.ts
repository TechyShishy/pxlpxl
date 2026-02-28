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
import type { ImportPngResult } from '../components/import-png-dialog/import-png-dialog.component';

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

/** Create a minimal valid 1x1 JPEG as an ArrayBuffer */
function createMinimalJpg(): ArrayBuffer {
  // Smallest valid 1x1 white JPEG
  const base64Jpg =
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVIP/2Q==';
  const binary = atob(base64Jpg);
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
  function makeDialogMock(result: ImportPngResult | undefined = { buffer: new Uint8ClampedArray(4 * 4 * 4), palette: [] }) {
    const mockDialogRef = { afterClosed: () => of(result as ImportPngResult | undefined) };
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

    it('should route JPG files to PNG import (opens dialog)', async () => {
      const jpgBuffer = createMinimalJpg();

      await expect(service.importFromBuffer(jpgBuffer, 'test.jpg'))
        .resolves.toBeUndefined();
      expect(dialogMock.open).toHaveBeenCalledOnce();
    });

    it('should route JPEG files with .jpeg extension to PNG import (opens dialog)', async () => {
      const jpgBuffer = createMinimalJpg();

      await expect(service.importFromBuffer(jpgBuffer, 'test.jpeg'))
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
        afterClosed: () => of({ buffer: new Uint8ClampedArray(8 * 4), palette: [] } satisfies ImportPngResult),
      });

      const pngBuffer = createMinimalPng();
      await service.importFromBuffer(pngBuffer, 'beads.png');

      expect(dialogMock.open).toHaveBeenCalledOnce();
      expect(layerService.layerCount()).toBe(2);
    });

    it('should not add a layer when the dialog is cancelled', async () => {
      // Override to simulate cancellation (result = undefined)
      dialogMock.open.mockReturnValueOnce({
        afterClosed: () => of(undefined as ImportPngResult | undefined),
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

  // ── JPG import ────────────────────────────────────────────────────────

  describe('importJpg', () => {
    beforeEach(() => mockCanvasApis());
    afterEach(() => vi.unstubAllGlobals());

    it('should add a new layer after user confirms import in the dialog', async () => {
      const jpgBuffer = createMinimalJpg();

      await service.importFromBuffer(jpgBuffer, 'photo.jpg');

      expect(layerService.layerCount()).toBe(2);
    });

    it('should not add a layer when the dialog is cancelled', async () => {
      dialogMock.open.mockReturnValueOnce({
        afterClosed: () => of(undefined as ImportPngResult | undefined),
      });

      const jpgBuffer = createMinimalJpg();
      await service.importFromBuffer(jpgBuffer, 'photo.jpg');

      expect(layerService.layerCount()).toBe(1); // no new layer
    });

    it('should record an undoable command for the import', async () => {
      const jpgBuffer = createMinimalJpg();

      await service.importFromBuffer(jpgBuffer, 'photo.jpg');

      expect(historyService.canUndo()).toBe(true);
      historyService.undo();
    });
  });

  // ── PNG/JPG import — palette behavior ─────────────────────────────────

  describe('importPng/Jpg – palette behavior', () => {
    beforeEach(() => mockCanvasApis());
    afterEach(() => vi.unstubAllGlobals());

    it('should add new palette colors from import without removing existing ones', async () => {
      const RED = { r: 255, g: 0, b: 0, a: 255 };
      const BLUE = { r: 0, g: 0, b: 255, a: 255 };

      // Set up an existing single-color palette
      colorService.setPalette([RED]);
      // Seed the undo stack — non-empty undo stack triggers merge behavior.
      historyService.execute({ description: 'seed', execute: () => {}, undo: () => {} });
      const paletteBefore = colorService.palette().length;

      // Dialog returns a buffer with BLUE pixels
      dialogMock.open.mockReturnValueOnce({
        afterClosed: () => of({ buffer: new Uint8ClampedArray(4 * 4 * 4), palette: [BLUE] } satisfies ImportPngResult),
      });

      await service.importFromBuffer(createMinimalPng(), 'import.png');

      const palette = colorService.palette();
      // Existing RED is still there
      expect(palette.some((c) => c.r === 255 && c.g === 0 && c.b === 0)).toBe(true);
      // BLUE was added
      expect(palette.some((c) => c.r === 0 && c.g === 0 && c.b === 255)).toBe(true);
      // Palette grew by exactly 1
      expect(palette.length).toBe(paletteBefore + 1);
    });

    it('should not duplicate palette entries already present', async () => {
      const RED = { r: 255, g: 0, b: 0, a: 255 };
      colorService.setPalette([RED]);
      // Seed the undo stack — non-empty undo stack triggers merge behavior.
      historyService.execute({ description: 'seed', execute: () => {}, undo: () => {} });

      // Dialog returns a palette that includes RED again
      dialogMock.open.mockReturnValueOnce({
        afterClosed: () => of({ buffer: new Uint8ClampedArray(4 * 4 * 4), palette: [RED] } satisfies ImportPngResult),
      });

      await service.importFromBuffer(createMinimalPng(), 'import.png');

      const palette = colorService.palette();
      const redCount = palette.filter((c) => c.r === 255 && c.g === 0 && c.b === 0).length;
      expect(redCount).toBe(1);
    });

    it('should not modify the palette when all imported colors are transparent (empty palette list)', async () => {
      const ORIGINAL = colorService.palette().slice();
      // Seed the undo stack — non-empty undo stack triggers merge behavior (empty list → no change).
      historyService.execute({ description: 'seed', execute: () => {}, undo: () => {} });

      // Dialog returns an empty palette (all-transparent image)
      dialogMock.open.mockReturnValueOnce({
        afterClosed: () => of({ buffer: new Uint8ClampedArray(4 * 4 * 4), palette: [] } satisfies ImportPngResult),
      });

      await service.importFromBuffer(createMinimalPng(), 'import.png');

      expect(colorService.palette().length).toBe(ORIGINAL.length);
    });

    // ── Replace behavior (empty undo stack) ────────────────────────────

    describe('palette replace on empty undo stack', () => {
      it('should replace the palette with imported colors when undo stack is empty', async () => {
        const RED = { r: 255, g: 0, b: 0, a: 255 };
        const BLUE = { r: 0, g: 0, b: 255, a: 255 };
        colorService.setPalette([RED]);

        // No commands executed — undo stack stays empty → replace behavior.
        dialogMock.open.mockReturnValueOnce({
          afterClosed: () => of({ buffer: new Uint8ClampedArray(4 * 4 * 4), palette: [BLUE] } satisfies ImportPngResult),
        });

        await service.importFromBuffer(createMinimalPng(), 'import.png');

        const palette = colorService.palette();
        expect(palette.some((c) => c.r === 0 && c.g === 0 && c.b === 255)).toBe(true);
        // RED was not preserved — palette was replaced, not merged.
        expect(palette.some((c) => c.r === 255 && c.g === 0 && c.b === 0)).toBe(false);
      });

      it('should result in an empty palette when imported colors are all transparent and undo stack is empty', async () => {
        // Empty palette list + replace behavior = palette cleared.
        dialogMock.open.mockReturnValueOnce({
          afterClosed: () => of({ buffer: new Uint8ClampedArray(4 * 4 * 4), palette: [] } satisfies ImportPngResult),
        });

        await service.importFromBuffer(createMinimalPng(), 'import.png');

        expect(colorService.palette().length).toBe(0);
      });
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

    it('should hydrate triangularShift from pxl file', async () => {
      // a=2, dNum=1, dDen=1, height=4: rows=[2,3,4,5] = 14 pixels = 56 bytes
      const bufSize = 14 * 4;
      const pxl = makePxlFile({
        gridType: 'triangular',
        triangularA: 2,
        triangularD: 1,
        triangularDNum: 1,
        triangularDDen: 1,
        triangularShift: 5,
        layers: [{
          id: 'l1', name: 'Layer 1', visible: true, opacity: 1,
          data: uint8ArrayToBase64(new Uint8ClampedArray(bufSize)),
        }],
      });
      const gzipped = await compressToGzip(JSON.stringify(pxl));

      await service.importFromBuffer(gzipped, 'shift.pxl');

      expect(canvasState.triangularShift()).toBe(5);
    });

    it('should throw when layer data length does not match expected buffer size', async () => {
      // 4x4 square grid expects 4*4*4 = 64 bytes, we give 32
      const wrongSizeData = new Uint8ClampedArray(32);
      const pxl = makePxlFile({
        layers: [{
          id: 'l1', name: 'Layer 1', visible: true, opacity: 1,
          data: uint8ArrayToBase64(wrongSizeData),
        }],
      });
      const gzipped = await compressToGzip(JSON.stringify(pxl));

      await expect(service.importFromBuffer(gzipped, 'bad-layer.pxl'))
        .rejects.toThrow(/buffer size mismatch/i);
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
