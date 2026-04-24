import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExportService } from './export.service';
import { RenderService } from './render.service';
import { CanvasStateService } from './canvas-state.service';
import { GridService } from './grid.service';
import { LayerService } from './layer.service';
import { ColorService } from './color.service';
import { HistoryService } from './history.service';
import { ProjectService } from './project.service';
import { SettingsService } from './settings.service';
import { Capacitor } from '@capacitor/core';
import { Directory } from '@capacitor/filesystem';
import { PxlFile, base64ToUint8Array } from '../models';
/** Decompress a gzip Blob produced by exportAsRgp back to a JSON string */
async function decompressBlob(blob: Blob): Promise<string> {
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(new Uint8Array(buffer));
  writer.close();
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { result.set(c, offset); offset += c.length; }
  return new TextDecoder().decode(result);
}

describe('ExportService', () => {
  let service: ExportService;
  let isNativePlatformSpy: ReturnType<typeof vi.spyOn>;
  let getPlatformSpy: ReturnType<typeof vi.spyOn>;
  let writeFileSpy: ReturnType<typeof vi.spyOn>;
  let shareSpy: ReturnType<typeof vi.spyOn>;
  const testBlob = new Blob(['test'], { type: 'image/png' });

  beforeEach(() => {
    isNativePlatformSpy = vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    getPlatformSpy = vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('web');

    TestBed.configureTestingModule({
      providers: [
        ExportService,
        {
          provide: RenderService,
          useValue: {
            compositeToImageData: vi.fn(),
            compositeToCanvas: vi.fn(),
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
          },
        },
        {
          provide: LayerService,
          useValue: {
            layers: vi.fn(() => []),
          },
        },
        {
          provide: ColorService,
          useValue: {
            palette: vi.fn(() => []),
          },
        },
        {
          provide: HistoryService,
          useValue: {
            getUndoStack: vi.fn(() => []),
            getRedoStack: vi.fn(() => []),
          },
        },
        {
          provide: ProjectService,
          useValue: {
            currentProjectName: vi.fn(() => 'test-project'),
          },
        },
        {
          provide: SettingsService,
          useValue: {
            defaultColorPool: vi.fn(() => 'any'),
          },
        },
      ],
    });

    service = TestBed.inject(ExportService);
    writeFileSpy = vi.spyOn(service as any, 'writeToFilesystem').mockResolvedValue({ uri: '' });
    shareSpy = vi.spyOn(service as any, 'shareNative').mockResolvedValue({ activityType: undefined });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('exportAsPxl', () => {
    it('should include triangularShift in output for triangular grids', async () => {
      // The existing TestBed uses mocks, so update the mock to return triangular config
      const canvasStateMock = TestBed.inject(CanvasStateService);
      const layersMock = TestBed.inject(LayerService);
      const colorMock = TestBed.inject(ColorService);

      (canvasStateMock.gridType as unknown as ReturnType<typeof vi.fn>).mockReturnValue('triangular');
      (canvasStateMock.canvasWidth as unknown as ReturnType<typeof vi.fn>).mockReturnValue(4);
      (canvasStateMock.canvasHeight as unknown as ReturnType<typeof vi.fn>).mockReturnValue(4);
      (canvasStateMock.triangularA as unknown as ReturnType<typeof vi.fn>).mockReturnValue(2);
      (canvasStateMock.triangularD as unknown as ReturnType<typeof vi.fn>).mockReturnValue(1);
      (canvasStateMock.triangularDNum as unknown as ReturnType<typeof vi.fn>).mockReturnValue(1);
      (canvasStateMock.triangularDDen as unknown as ReturnType<typeof vi.fn>).mockReturnValue(1);
      // Add triangularShift to the mock (not present in original mock setup)
      (canvasStateMock as unknown as Record<string, unknown>)['triangularShift'] = vi.fn(() => 3);
      (layersMock.layers as unknown as ReturnType<typeof vi.fn>).mockReturnValue([]);
      (colorMock.palette as unknown as ReturnType<typeof vi.fn>).mockReturnValue([]);

      const blob = await service.exportAsPxl();
      const json = await decompressBlob(blob);
      const pxl = JSON.parse(json) as PxlFile;

      expect(pxl.triangularShift).toBe(3);
    });

    it('should produce a valid PxlFile with all required fields for square grid', async () => {
      const canvasStateMock = TestBed.inject(CanvasStateService);
      const layersMock = TestBed.inject(LayerService);
      const colorMock = TestBed.inject(ColorService);
      const projectMock = TestBed.inject(ProjectService);

      (canvasStateMock.gridType as unknown as ReturnType<typeof vi.fn>).mockReturnValue('square');
      (canvasStateMock.canvasWidth as unknown as ReturnType<typeof vi.fn>).mockReturnValue(2);
      (canvasStateMock.canvasHeight as unknown as ReturnType<typeof vi.fn>).mockReturnValue(2);

      // Set up one layer with known pixel data: red at (0,0)
      const layerData = new Uint8ClampedArray(2 * 2 * 4);
      layerData[0] = 255; layerData[1] = 0; layerData[2] = 0; layerData[3] = 255;
      (layersMock.layers as unknown as ReturnType<typeof vi.fn>).mockReturnValue([
        { id: 'layer-1', name: 'Background', visible: true, opacity: 0.8, data: layerData },
      ]);

      (colorMock.palette as unknown as ReturnType<typeof vi.fn>).mockReturnValue([
        { r: 255, g: 0, b: 0, a: 255 },
        { r: 0, g: 255, b: 0, a: 255 },
      ]);

      (projectMock.currentProjectName as unknown as ReturnType<typeof vi.fn>).mockReturnValue('My Project');

      const blob = await service.exportAsPxl();
      const json = await decompressBlob(blob);
      const pxl = JSON.parse(json) as PxlFile;

      expect(pxl.version).toBe(2);
      expect(pxl.name).toBe('My Project');
      expect(pxl.width).toBe(2);
      expect(pxl.height).toBe(2);
      expect(pxl.gridType).toBe('square');

      // Palette
      expect(pxl.palette).toHaveLength(2);
      expect(pxl.palette[0]).toEqual({ r: 255, g: 0, b: 0, a: 255 });
      expect(pxl.palette[1]).toEqual({ r: 0, g: 255, b: 0, a: 255 });

      // Layers
      expect(pxl.layers).toHaveLength(1);
      expect(pxl.layers[0].id).toBe('layer-1');
      expect(pxl.layers[0].name).toBe('Background');
      expect(pxl.layers[0].visible).toBe(true);
      expect(pxl.layers[0].opacity).toBe(0.8);

      // Layer data should be base64-encoded and decode back to the original RGBA bytes
      const decoded = base64ToUint8Array(pxl.layers[0].data);
      expect(decoded[0]).toBe(255); // R
      expect(decoded[1]).toBe(0);   // G
      expect(decoded[2]).toBe(0);   // B
      expect(decoded[3]).toBe(255); // A

      // Timestamps
      expect(pxl.createdAt).toBeDefined();
      expect(pxl.updatedAt).toBeDefined();
      expect(() => new Date(pxl.createdAt)).not.toThrow();

      // Triangular fields should be undefined for square grids
      expect(pxl.triangularA).toBeUndefined();
      expect(pxl.triangularD).toBeUndefined();
      expect(pxl.triangularDNum).toBeUndefined();
      expect(pxl.triangularDDen).toBeUndefined();
      expect(pxl.triangularShift).toBeUndefined();
    });

    it('should include serialized history when undo/redo stacks are non-empty', async () => {
      const historyMock = TestBed.inject(HistoryService);
      const layersMock = TestBed.inject(LayerService);
      const colorMock = TestBed.inject(ColorService);

      (layersMock.layers as unknown as ReturnType<typeof vi.fn>).mockReturnValue([]);
      (colorMock.palette as unknown as ReturnType<typeof vi.fn>).mockReturnValue([]);

      // Provide a mock command that serializeCommand can process
      const mockCommand = {
        type: 'draw',
        description: 'Draw pixel',
        layerIndex: 0,
        canvasWidth: 2,
        execute: vi.fn(),
        undo: vi.fn(),
        pixels: [{ x: 0, y: 0, oldColor: { r: 0, g: 0, b: 0, a: 0 }, newColor: { r: 255, g: 0, b: 0, a: 255 } }],
        gridType: 'square' as const,
      };

      (historyMock.getUndoStack as unknown as ReturnType<typeof vi.fn>).mockReturnValue([mockCommand]);
      (historyMock.getRedoStack as unknown as ReturnType<typeof vi.fn>).mockReturnValue([]);

      const blob = await service.exportAsPxl();
      const json = await decompressBlob(blob);
      const pxl = JSON.parse(json) as PxlFile;

      expect(pxl.history).toBeDefined();
      expect(pxl.history!.undoStack.length).toBeGreaterThanOrEqual(0);
    });

    it('should omit history when both stacks are empty', async () => {
      const layersMock = TestBed.inject(LayerService);
      const colorMock = TestBed.inject(ColorService);

      (layersMock.layers as unknown as ReturnType<typeof vi.fn>).mockReturnValue([]);
      (colorMock.palette as unknown as ReturnType<typeof vi.fn>).mockReturnValue([]);

      const blob = await service.exportAsPxl();
      const json = await decompressBlob(blob);
      const pxl = JSON.parse(json) as PxlFile;

      expect(pxl.history).toBeUndefined();
    });

    it('should preserve multiple layers with correct ordering', async () => {
      const layersMock = TestBed.inject(LayerService);
      const colorMock = TestBed.inject(ColorService);

      const layer1Data = new Uint8ClampedArray(2 * 2 * 4);
      const layer2Data = new Uint8ClampedArray(2 * 2 * 4);
      layer2Data[0] = 128;

      (layersMock.layers as unknown as ReturnType<typeof vi.fn>).mockReturnValue([
        { id: 'l1', name: 'Bottom', visible: true, opacity: 1, data: layer1Data },
        { id: 'l2', name: 'Top', visible: false, opacity: 0.5, data: layer2Data },
      ]);
      (colorMock.palette as unknown as ReturnType<typeof vi.fn>).mockReturnValue([]);

      const blob = await service.exportAsPxl();
      const json = await decompressBlob(blob);
      const pxl = JSON.parse(json) as PxlFile;

      expect(pxl.layers).toHaveLength(2);
      expect(pxl.layers[0].id).toBe('l1');
      expect(pxl.layers[0].name).toBe('Bottom');
      expect(pxl.layers[0].visible).toBe(true);
      expect(pxl.layers[0].opacity).toBe(1);
      expect(pxl.layers[1].id).toBe('l2');
      expect(pxl.layers[1].name).toBe('Top');
      expect(pxl.layers[1].visible).toBe(false);
      expect(pxl.layers[1].opacity).toBe(0.5);

      // Verify second layer's data decodes correctly
      const decoded = base64ToUint8Array(pxl.layers[1].data);
      expect(decoded[0]).toBe(128);
    });

    it('should produce a gzip-compressed blob', async () => {
      const layersMock = TestBed.inject(LayerService);
      const colorMock = TestBed.inject(ColorService);

      (layersMock.layers as unknown as ReturnType<typeof vi.fn>).mockReturnValue([]);
      (colorMock.palette as unknown as ReturnType<typeof vi.fn>).mockReturnValue([]);

      const blob = await service.exportAsPxl();

      // Verify it's a valid gzip blob by decompressing it
      const json = await decompressBlob(blob);
      const parsed = JSON.parse(json);
      expect(parsed.version).toBeDefined();
    });
  });

  describe('downloadExport (browser)', () => {
    it('should create an anchor element and trigger click on web', async () => {
      isNativePlatformSpy.mockReturnValue(false);

      // Stub exportAsBlob to avoid OffscreenCanvas
      vi.spyOn(service, 'exportAsBlob').mockResolvedValue(testBlob);

      const clickSpy = vi.fn();
      vi.spyOn(document, 'createElement').mockReturnValue({
        set href(_: string) { /* noop */ },
        set download(_: string) { /* noop */ },
        click: clickSpy,
      } as unknown as HTMLAnchorElement);
      const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      await service.downloadExport(
        { format: 'png', scale: 1, transparent: true },
        'test.png',
      );

      expect(clickSpy).toHaveBeenCalled();
      expect(revokeObjectURLSpy).toHaveBeenCalled();
    });

    it('should not call native APIs on web', async () => {
      isNativePlatformSpy.mockReturnValue(false);
      vi.spyOn(service, 'exportAsBlob').mockResolvedValue(testBlob);
      vi.spyOn(document, 'createElement').mockReturnValue({
        set href(_: string) { /* noop */ },
        set download(_: string) { /* noop */ },
        click: vi.fn(),
      } as unknown as HTMLAnchorElement);
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      await service.downloadExport(
        { format: 'png', scale: 1, transparent: true },
        'test.png',
      );

      expect(writeFileSpy).not.toHaveBeenCalled();
      expect(shareSpy).not.toHaveBeenCalled();
    });
  });

  describe('downloadExport (native)', () => {
    it('should write file and share on native platform', async () => {
      isNativePlatformSpy.mockReturnValue(true);
      vi.spyOn(service, 'exportAsBlob').mockResolvedValue(testBlob);
      writeFileSpy.mockResolvedValue({ uri: 'file:///cache/test.png' });
      shareSpy.mockResolvedValue({ activityType: undefined });

      await service.downloadExport(
        { format: 'png', scale: 1, transparent: true },
        'test.png',
      );

      expect(writeFileSpy).toHaveBeenCalledWith({
        path: 'test.png',
        data: expect.any(String),
        directory: Directory.Cache,
      });

      expect(shareSpy).toHaveBeenCalledWith({
        title: 'test.png',
        url: 'file:///cache/test.png',
        dialogTitle: 'Share test.png',
      });
    });

    it('should not create an anchor element on native', async () => {
      isNativePlatformSpy.mockReturnValue(true);
      vi.spyOn(service, 'exportAsBlob').mockResolvedValue(testBlob);
      writeFileSpy.mockResolvedValue({ uri: 'file:///cache/test.png' });
      shareSpy.mockResolvedValue({ activityType: undefined });

      const createElementSpy = vi.spyOn(document, 'createElement');

      await service.downloadExport(
        { format: 'png', scale: 1, transparent: true },
        'test.png',
      );

      expect(createElementSpy).not.toHaveBeenCalled();
    });
  });

  describe('downloadPxl (browser)', () => {
    it('should create an anchor element on web', async () => {
      isNativePlatformSpy.mockReturnValue(false);
      vi.spyOn(service, 'exportAsPxl').mockResolvedValue(testBlob);

      const clickSpy = vi.fn();
      vi.spyOn(document, 'createElement').mockReturnValue({
        set href(_: string) { /* noop */ },
        set download(_: string) { /* noop */ },
        click: clickSpy,
      } as unknown as HTMLAnchorElement);
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      await service.downloadPxl('test.pxl');

      expect(clickSpy).toHaveBeenCalled();
    });
  });

  describe('downloadPxl (native)', () => {
    it('should write file and share on native platform', async () => {
      isNativePlatformSpy.mockReturnValue(true);
      vi.spyOn(service, 'exportAsPxl').mockResolvedValue(testBlob);
      writeFileSpy.mockResolvedValue({ uri: 'file:///cache/test.pxl' });
      shareSpy.mockResolvedValue({ activityType: undefined });

      await service.downloadPxl('test.pxl');

      expect(writeFileSpy).toHaveBeenCalledWith({
        path: 'test.pxl',
        data: expect.any(String),
        directory: Directory.Cache,
      });

      expect(shareSpy).toHaveBeenCalledWith({
        title: 'test.pxl',
        url: 'file:///cache/test.pxl',
        dialogTitle: 'Share test.pxl',
      });
    });
  });

  describe('downloadRgp (browser)', () => {
    it('should create an anchor element and trigger click on web', async () => {
      isNativePlatformSpy.mockReturnValue(false);
      vi.spyOn(service, 'exportAsRgp').mockResolvedValue(
        new Blob(['{}'], { type: 'application/x-rowguide-project' }),
      );

      const clickSpy = vi.fn();
      vi.spyOn(document, 'createElement').mockReturnValue({
        set href(_: string) { /* noop */ },
        set download(_: string) { /* noop */ },
        click: clickSpy,
      } as unknown as HTMLAnchorElement);
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      await service.downloadRgp('test.rgp');

      expect(clickSpy).toHaveBeenCalled();
    });
  });

  describe('downloadExport with rgp format', () => {
    it('should call downloadRgp and replace extension with .rgp', async () => {
      isNativePlatformSpy.mockReturnValue(false);
      const downloadRgpSpy = vi
        .spyOn(service, 'downloadRgp')
        .mockResolvedValue(undefined);

      await service.downloadExport({ format: 'rgp', scale: 1, transparent: true }, 'canvas.png');

      expect(downloadRgpSpy).toHaveBeenCalledWith('canvas.rgp');
    });
  });

  describe('exportAsRgp', () => {
    it('should return a Blob with the RGP MIME type', async () => {
      const layerServiceMock = TestBed.inject(LayerService) as unknown as { layers: ReturnType<typeof vi.fn> };
      layerServiceMock.layers.mockReturnValue([]);

      const blob = await service.exportAsRgp();

      expect(blob.type).toBe('application/x-rowguide-project');
    });

    it('should run-length encode same-color pixels in a row', async () => {
      const bw = 2;
      const bh = 2;
      const data = new Uint8ClampedArray(bw * bh * 4);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
      }

      const layerServiceMock = TestBed.inject(LayerService) as unknown as { layers: ReturnType<typeof vi.fn> };
      layerServiceMock.layers.mockReturnValue([{ visible: true, opacity: 1, data }]);

      const colorServiceMock = TestBed.inject(ColorService) as unknown as { palette: ReturnType<typeof vi.fn> };
      colorServiceMock.palette.mockReturnValue([{ r: 0, g: 0, b: 0, a: 255 }]);

      const blob = await service.exportAsRgp();
      const parsed = JSON.parse(await decompressBlob(blob));

      expect(parsed.rows).toHaveLength(bh);
      expect(parsed.rows[0].steps).toHaveLength(1);
      expect(parsed.rows[0].steps[0].count).toBe(2);
      expect(parsed.rows[0].steps[0].description).toBe('A');
    });

    it('should produce separate steps for different colors in a row', async () => {
      const data = new Uint8ClampedArray(2 * 1 * 4);
      data.set([0, 0, 0, 255, 255, 255, 255, 255]);

      const canvasMock = TestBed.inject(CanvasStateService) as unknown as {
        bufferHeight: ReturnType<typeof vi.fn>;
      };
      canvasMock.bufferHeight.mockReturnValue(1);

      const layerServiceMock = TestBed.inject(LayerService) as unknown as { layers: ReturnType<typeof vi.fn> };
      layerServiceMock.layers.mockReturnValue([{ visible: true, opacity: 1, data }]);

      const colorServiceMock = TestBed.inject(ColorService) as unknown as { palette: ReturnType<typeof vi.fn> };
      colorServiceMock.palette.mockReturnValue([
        { r: 0, g: 0, b: 0, a: 255 },
        { r: 255, g: 255, b: 255, a: 255 },
      ]);

      const blob = await service.exportAsRgp();
      const parsed = JSON.parse(await decompressBlob(blob));

      expect(parsed.rows[0].steps).toHaveLength(2);
      // Row 0 is even-indexed, so it is encoded left-to-right (bx=0 first).
      // bx=0 is black (A) and bx=1 is white (B).
      expect(parsed.rows[0].steps[0]).toMatchObject({ count: 1, description: 'A' });
      expect(parsed.rows[0].steps[1]).toMatchObject({ count: 1, description: 'B' });
    });

    it('should include 1-based row ids', async () => {
      const layerServiceMock = TestBed.inject(LayerService) as unknown as { layers: ReturnType<typeof vi.fn> };
      layerServiceMock.layers.mockReturnValue([]);

      const blob = await service.exportAsRgp();
      const parsed = JSON.parse(await decompressBlob(blob));

      expect(parsed.rows[0].id).toBe(1);
      expect(parsed.rows[1].id).toBe(2);
    });

    it('should encode odd rows (0-indexed) right-to-left and even rows left-to-right', async () => {
      // 2 rows, bufferWidth=2: row 0 (even) left-to-right, row 1 (odd) right-to-left
      const bw = 2;
      const bh = 2;
      const data = new Uint8ClampedArray(bw * bh * 4);
      // Row 0: bx0=black, bx1=white
      data.set([0, 0, 0, 255,   255, 255, 255, 255], 0);
      // Row 1: bx0=black, bx1=white
      data.set([0, 0, 0, 255,   255, 255, 255, 255], bw * 4);

      const layerServiceMock = TestBed.inject(LayerService) as unknown as { layers: ReturnType<typeof vi.fn> };
      layerServiceMock.layers.mockReturnValue([{ visible: true, opacity: 1, data }]);

      const colorServiceMock = TestBed.inject(ColorService) as unknown as { palette: ReturnType<typeof vi.fn> };
      colorServiceMock.palette.mockReturnValue([
        { r: 0, g: 0, b: 0, a: 255 },
        { r: 255, g: 255, b: 255, a: 255 },
      ]);

      const blob = await service.exportAsRgp();
      const parsed = JSON.parse(await decompressBlob(blob));

      // Row 0 (even): encoded left-to-right → bx0 (black=A) comes first, then bx1 (white=B)
      expect(parsed.rows[0].steps[0]).toMatchObject({ count: 1, description: 'A' });
      expect(parsed.rows[0].steps[1]).toMatchObject({ count: 1, description: 'B' });

      // Row 1 (odd): encoded right-to-left → bx1 (white=B) comes first, then bx0 (black=A)
      expect(parsed.rows[1].steps[0]).toMatchObject({ count: 1, description: 'B' });
      expect(parsed.rows[1].steps[1]).toMatchObject({ count: 1, description: 'A' });
    });

    it('should include colorMapping with letter keys', async () => {
      const layerServiceMock = TestBed.inject(LayerService) as unknown as { layers: ReturnType<typeof vi.fn> };
      layerServiceMock.layers.mockReturnValue([]);

      const colorServiceMock = TestBed.inject(ColorService) as unknown as { palette: ReturnType<typeof vi.fn> };
      colorServiceMock.palette.mockReturnValue([{ r: 0, g: 0, b: 0, a: 255 }]);

      const blob = await service.exportAsRgp();
      const parsed = JSON.parse(await decompressBlob(blob));

      expect(parsed.colorMapping).toBeDefined();
      expect(parsed.colorMapping['A']).toBeDefined();
    });

    it('should use DB codes in colorMapping when defaultColorPool is delica', async () => {
      const settingsServiceMock = TestBed.inject(SettingsService) as unknown as { defaultColorPool: ReturnType<typeof vi.fn> };
      settingsServiceMock.defaultColorPool.mockReturnValue('delica');

      const layerServiceMock = TestBed.inject(LayerService) as unknown as { layers: ReturnType<typeof vi.fn> };
      layerServiceMock.layers.mockReturnValue([]);

      // DB0001 → #23242d per the Miyuki Delica catalog
      const colorServiceMock = TestBed.inject(ColorService) as unknown as { palette: ReturnType<typeof vi.fn> };
      colorServiceMock.palette.mockReturnValue([{ r: 0x23, g: 0x24, b: 0x2d, a: 255 }]);

      const blob = await service.exportAsRgp();
      const parsed = JSON.parse(await decompressBlob(blob));

      expect(parsed.colorMapping['A']).toBe('DB0001');
    });

    it('should fall back to hex in colorMapping when delica mode but color is not in catalog', async () => {
      const settingsServiceMock = TestBed.inject(SettingsService) as unknown as { defaultColorPool: ReturnType<typeof vi.fn> };
      settingsServiceMock.defaultColorPool.mockReturnValue('delica');

      const layerServiceMock = TestBed.inject(LayerService) as unknown as { layers: ReturnType<typeof vi.fn> };
      layerServiceMock.layers.mockReturnValue([]);

      // This color is not in the Delica catalog
      const colorServiceMock = TestBed.inject(ColorService) as unknown as { palette: ReturnType<typeof vi.fn> };
      colorServiceMock.palette.mockReturnValue([{ r: 1, g: 2, b: 3, a: 255 }]);

      const blob = await service.exportAsRgp();
      const parsed = JSON.parse(await decompressBlob(blob));

      expect(parsed.colorMapping['A']).toBe('#010203ff');
    });

    it('should use hex codes in colorMapping when defaultColorPool is any', async () => {
      const layerServiceMock = TestBed.inject(LayerService) as unknown as { layers: ReturnType<typeof vi.fn> };
      layerServiceMock.layers.mockReturnValue([]);

      // DB0001 → #23242d — in non-delica mode this should still be a hex string
      const colorServiceMock = TestBed.inject(ColorService) as unknown as { palette: ReturnType<typeof vi.fn> };
      colorServiceMock.palette.mockReturnValue([{ r: 0x23, g: 0x24, b: 0x2d, a: 255 }]);

      const blob = await service.exportAsRgp();
      const parsed = JSON.parse(await decompressBlob(blob));

      expect(parsed.colorMapping['A']).toBe('#23242dff');
    });
  });

  describe('exportAsRgp — triangular grid', () => {
    // Triangular grid: a=1, dNum=1, dDen=1, height=3
    // Row 0: width 1, row 1: width 2, row 2: width 3  (total 6 pixels)
    // Buffer is packed — offsets use triangularCumPixels, not by*bufferWidth.
    const A = [0, 0, 0, 255];       // black
    const B = [255, 0, 0, 255];     // red
    const C = [0, 255, 0, 255];     // green

    type CanvasMock = {
      gridType: ReturnType<typeof vi.fn>;
      bufferWidth: ReturnType<typeof vi.fn>;
      bufferHeight: ReturnType<typeof vi.fn>;
      triangularA: ReturnType<typeof vi.fn>;
      triangularD: ReturnType<typeof vi.fn>;
      triangularDNum: ReturnType<typeof vi.fn>;
      triangularDDen: ReturnType<typeof vi.fn>;
      triangularShift: ReturnType<typeof vi.fn>;
    };

    function getCanvasMock(): CanvasMock {
      return TestBed.inject(CanvasStateService) as unknown as CanvasMock;
    }

    beforeEach(() => {
      const canvasMock = getCanvasMock();
      canvasMock.gridType.mockReturnValue('triangular');
      canvasMock.bufferWidth.mockReturnValue(3);
      canvasMock.bufferHeight.mockReturnValue(3);
      canvasMock.triangularA.mockReturnValue(1);
      canvasMock.triangularD.mockReturnValue(1);
      canvasMock.triangularDNum.mockReturnValue(1);
      canvasMock.triangularDDen.mockReturnValue(1);
      canvasMock.triangularShift.mockReturnValue(0);
    });

    it('should produce exactly 3 rows matching the triangular row count', async () => {
      // 6 packed pixels, all color A
      const data = new Uint8ClampedArray(6 * 4);
      for (let i = 0; i < data.length; i += 4) data.set(A, i);

      const layerServiceMock = TestBed.inject(LayerService) as unknown as { layers: ReturnType<typeof vi.fn> };
      layerServiceMock.layers.mockReturnValue([{ visible: true, opacity: 1, data }]);
      const colorServiceMock = TestBed.inject(ColorService) as unknown as { palette: ReturnType<typeof vi.fn> };
      colorServiceMock.palette.mockReturnValue([{ r: 0, g: 0, b: 0, a: 255 }]);

      const blob = await service.exportAsRgp();
      const parsed = JSON.parse(await decompressBlob(blob));

      expect(parsed.rows).toHaveLength(3);
    });

    it('should produce exactly 1 step in row 0 (1 bead wide)', async () => {
      // Row 0 = 1 pixel (A), row 1 = 2 pixels (A,A), row 2 = 3 pixels (A,A,A)
      const data = new Uint8ClampedArray(6 * 4);
      for (let i = 0; i < data.length; i += 4) data.set(A, i);

      const layerServiceMock = TestBed.inject(LayerService) as unknown as { layers: ReturnType<typeof vi.fn> };
      layerServiceMock.layers.mockReturnValue([{ visible: true, opacity: 1, data }]);
      const colorServiceMock = TestBed.inject(ColorService) as unknown as { palette: ReturnType<typeof vi.fn> };
      colorServiceMock.palette.mockReturnValue([{ r: 0, g: 0, b: 0, a: 255 }]);

      const blob = await service.exportAsRgp();
      const parsed = JSON.parse(await decompressBlob(blob));

      expect(parsed.rows[0].steps).toHaveLength(1);
      expect(parsed.rows[0].steps[0].count).toBe(1);
    });

    it('should produce steps whose count sums to the row width', async () => {
      // Row 0 (width 1): A
      // Row 1 (width 2): B, C  (2 steps, each count 1)
      // Row 2 (width 3): A, B, C  (3 steps, each count 1)
      const data = new Uint8ClampedArray([
        ...A,              // row 0, bx 0
        ...B, ...C,        // row 1, bx 0..1
        ...A, ...B, ...C,  // row 2, bx 0..2
      ]);

      const layerServiceMock = TestBed.inject(LayerService) as unknown as { layers: ReturnType<typeof vi.fn> };
      layerServiceMock.layers.mockReturnValue([{ visible: true, opacity: 1, data }]);
      const colorServiceMock = TestBed.inject(ColorService) as unknown as { palette: ReturnType<typeof vi.fn> };
      colorServiceMock.palette.mockReturnValue([
        { r: 0, g: 0, b: 0, a: 255 },
        { r: 255, g: 0, b: 0, a: 255 },
        { r: 0, g: 255, b: 0, a: 255 },
      ]);

      const blob = await service.exportAsRgp();
      const parsed = JSON.parse(await decompressBlob(blob));

      const sumCounts = (row: { steps: { count: number }[] }) =>
        row.steps.reduce((s: number, step: { count: number }) => s + step.count, 0);

      expect(sumCounts(parsed.rows[0])).toBe(1);
      expect(sumCounts(parsed.rows[1])).toBe(2);
      expect(sumCounts(parsed.rows[2])).toBe(3);
    });

    it('should respect odd-RTL / even-LTR scan direction within each triangular row', async () => {
      // Row 1 (odd, width 2, RTL): bx0=B, bx1=C → read bx1..0 → C, B
      // Row 2 (even, width 3, LTR): bx0=A, bx1=B, bx2=C → read bx0..2 → A, B, C
      const data = new Uint8ClampedArray([
        ...A,              // row 0, bx 0
        ...B, ...C,        // row 1, bx 0..1
        ...A, ...B, ...C,  // row 2, bx 0..2
      ]);

      const layerServiceMock = TestBed.inject(LayerService) as unknown as { layers: ReturnType<typeof vi.fn> };
      layerServiceMock.layers.mockReturnValue([{ visible: true, opacity: 1, data }]);
      const colorServiceMock = TestBed.inject(ColorService) as unknown as { palette: ReturnType<typeof vi.fn> };
      colorServiceMock.palette.mockReturnValue([
        { r: 0, g: 0, b: 0, a: 255 },
        { r: 255, g: 0, b: 0, a: 255 },
        { r: 0, g: 255, b: 0, a: 255 },
      ]);

      const blob = await service.exportAsRgp();
      const parsed = JSON.parse(await decompressBlob(blob));

      // Row 1 (odd, RTL): bx1=C first, then bx0=B
      expect(parsed.rows[1].steps[0]).toMatchObject({ count: 1, description: 'C' });
      expect(parsed.rows[1].steps[1]).toMatchObject({ count: 1, description: 'B' });

      // Row 2 (even, LTR): bx0=A first, then bx1=B, then bx2=C
      expect(parsed.rows[2].steps[0]).toMatchObject({ count: 1, description: 'A' });
      expect(parsed.rows[2].steps[2]).toMatchObject({ count: 1, description: 'C' });
    });

    it('should use triangularShift in buffer size and row width calculations', async () => {
      // a=1, dNum=1, dDen=2, shift=1, height=4
      // With shift=1: row0=1, row1=2, row2=1, row3=2 (total 6 pixels)
      // With shift=0: row0=1, row1=0, row2=1, row3=2 — different distribution
      const canvasMock = getCanvasMock();
      canvasMock.triangularA.mockReturnValue(1);
      canvasMock.triangularD.mockReturnValue(1);
      canvasMock.triangularDNum.mockReturnValue(1);
      canvasMock.triangularDDen.mockReturnValue(2);
      canvasMock.triangularShift.mockReturnValue(1);
      canvasMock.bufferHeight.mockReturnValue(4);
      canvasMock.bufferWidth.mockReturnValue(2);

      // Build buffer with correct packed pixel count for shift=1
      const { computeBufferPixelCount: computeBuf } = await import('../models');
      const totalPixels = computeBuf(0, 4, 'triangular', 1, undefined, 1, 2, 1);
      const data = new Uint8ClampedArray(totalPixels * 4);
      const color = [128, 64, 32, 255];
      for (let i = 0; i < data.length; i += 4) data.set(color, i);

      const layerServiceMock = TestBed.inject(LayerService) as unknown as { layers: ReturnType<typeof vi.fn> };
      layerServiceMock.layers.mockReturnValue([{ visible: true, opacity: 1, data }]);
      const colorServiceMock = TestBed.inject(ColorService) as unknown as { palette: ReturnType<typeof vi.fn> };
      colorServiceMock.palette.mockReturnValue([{ r: 128, g: 64, b: 32, a: 255 }]);

      const blob = await service.exportAsRgp();
      const parsed = JSON.parse(await decompressBlob(blob));

      expect(parsed.rows).toHaveLength(4);
      // Verify row step counts match the shift-aware row widths
      const sumCounts = (row: { steps: { count: number }[] }) =>
        row.steps.reduce((s: number, step: { count: number }) => s + step.count, 0);
      expect(sumCounts(parsed.rows[0])).toBe(1);
      expect(sumCounts(parsed.rows[1])).toBe(2);
      expect(sumCounts(parsed.rows[2])).toBe(1);
      expect(sumCounts(parsed.rows[3])).toBe(2);
    });
  });
});
