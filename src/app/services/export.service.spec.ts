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
import * as CapacitorCore from '@capacitor/core';
import * as CapacitorFilesystem from '@capacitor/filesystem';
import * as CapacitorShare from '@capacitor/share';

// Mock Capacitor modules
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
  },
}));

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    writeFile: vi.fn(),
  },
  Directory: {
    Cache: 'CACHE',
  },
}));

vi.mock('@capacitor/share', () => ({
  Share: {
    share: vi.fn(),
  },
}));
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
  const testBlob = new Blob(['test'], { type: 'image/png' });

  beforeEach(() => {
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
          },
        },
        {
          provide: GridService,
          useValue: {
            isPeyote: vi.fn(() => false),
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
      ],
    });

    service = TestBed.inject(ExportService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('downloadExport (browser)', () => {
    it('should create an anchor element and trigger click on web', async () => {
      vi.mocked(CapacitorCore.Capacitor.isNativePlatform).mockReturnValue(false);

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
      vi.mocked(CapacitorCore.Capacitor.isNativePlatform).mockReturnValue(false);
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

      expect(CapacitorFilesystem.Filesystem.writeFile).not.toHaveBeenCalled();
      expect(CapacitorShare.Share.share).not.toHaveBeenCalled();
    });
  });

  describe('downloadExport (native)', () => {
    it('should write file and share on native platform', async () => {
      vi.mocked(CapacitorCore.Capacitor.isNativePlatform).mockReturnValue(true);
      vi.spyOn(service, 'exportAsBlob').mockResolvedValue(testBlob);
      vi.mocked(CapacitorFilesystem.Filesystem.writeFile).mockResolvedValue({
        uri: 'file:///cache/test.png',
      });
      vi.mocked(CapacitorShare.Share.share).mockResolvedValue({ activityType: undefined });

      await service.downloadExport(
        { format: 'png', scale: 1, transparent: true },
        'test.png',
      );

      expect(CapacitorFilesystem.Filesystem.writeFile).toHaveBeenCalledWith({
        path: 'test.png',
        data: expect.any(String),
        directory: CapacitorFilesystem.Directory.Cache,
      });

      expect(CapacitorShare.Share.share).toHaveBeenCalledWith({
        title: 'test.png',
        url: 'file:///cache/test.png',
        dialogTitle: 'Share test.png',
      });
    });

    it('should not create an anchor element on native', async () => {
      vi.mocked(CapacitorCore.Capacitor.isNativePlatform).mockReturnValue(true);
      vi.spyOn(service, 'exportAsBlob').mockResolvedValue(testBlob);
      vi.mocked(CapacitorFilesystem.Filesystem.writeFile).mockResolvedValue({
        uri: 'file:///cache/test.png',
      });
      vi.mocked(CapacitorShare.Share.share).mockResolvedValue({ activityType: undefined });

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
      vi.mocked(CapacitorCore.Capacitor.isNativePlatform).mockReturnValue(false);
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
      vi.mocked(CapacitorCore.Capacitor.isNativePlatform).mockReturnValue(true);
      vi.spyOn(service, 'exportAsPxl').mockResolvedValue(testBlob);
      vi.mocked(CapacitorFilesystem.Filesystem.writeFile).mockResolvedValue({
        uri: 'file:///cache/test.pxl',
      });
      vi.mocked(CapacitorShare.Share.share).mockResolvedValue({ activityType: undefined });

      await service.downloadPxl('test.pxl');

      expect(CapacitorFilesystem.Filesystem.writeFile).toHaveBeenCalledWith({
        path: 'test.pxl',
        data: expect.any(String),
        directory: CapacitorFilesystem.Directory.Cache,
      });

      expect(CapacitorShare.Share.share).toHaveBeenCalledWith({
        title: 'test.pxl',
        url: 'file:///cache/test.pxl',
        dialogTitle: 'Share test.pxl',
      });
    });
  });

  describe('downloadRgp (browser)', () => {
    it('should create an anchor element and trigger click on web', async () => {
      vi.mocked(CapacitorCore.Capacitor.isNativePlatform).mockReturnValue(false);
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
      vi.mocked(CapacitorCore.Capacitor.isNativePlatform).mockReturnValue(false);
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
      // Row 0 is even-indexed, so it is encoded right-to-left (bx=1 first).
      // bx=1 is white (B) and bx=0 is black (A).
      expect(parsed.rows[0].steps[0]).toMatchObject({ count: 1, description: 'B' });
      expect(parsed.rows[0].steps[1]).toMatchObject({ count: 1, description: 'A' });
    });

    it('should include 1-based row ids', async () => {
      const layerServiceMock = TestBed.inject(LayerService) as unknown as { layers: ReturnType<typeof vi.fn> };
      layerServiceMock.layers.mockReturnValue([]);

      const blob = await service.exportAsRgp();
      const parsed = JSON.parse(await decompressBlob(blob));

      expect(parsed.rows[0].id).toBe(1);
      expect(parsed.rows[1].id).toBe(2);
    });

    it('should encode even rows (0-indexed) right-to-left and odd rows left-to-right', async () => {
      // 2 rows, bufferWidth=2: row 0 (even) right-to-left, row 1 (odd) left-to-right
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

      // Row 0 (even): encoded right-to-left → bx1 (white=B) comes first, then bx0 (black=A)
      expect(parsed.rows[0].steps[0]).toMatchObject({ count: 1, description: 'B' });
      expect(parsed.rows[0].steps[1]).toMatchObject({ count: 1, description: 'A' });

      // Row 1 (odd): encoded left-to-right → bx0 (black=A) comes first, then bx1 (white=B)
      expect(parsed.rows[1].steps[0]).toMatchObject({ count: 1, description: 'A' });
      expect(parsed.rows[1].steps[1]).toMatchObject({ count: 1, description: 'B' });
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
    });

    afterEach(() => {
      const canvasMock = getCanvasMock();
      canvasMock.gridType.mockReturnValue('square');
      canvasMock.bufferWidth.mockReturnValue(2);
      canvasMock.bufferHeight.mockReturnValue(2);
      canvasMock.triangularA.mockReturnValue(1);
      canvasMock.triangularD.mockReturnValue(1);
      canvasMock.triangularDNum.mockReturnValue(1);
      canvasMock.triangularDDen.mockReturnValue(1);
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

    it('should respect even-RTL / odd-LTR scan direction within each triangular row', async () => {
      // Row 1 (odd, width 2, LTR): bx0=B, bx1=C → steps should be B then C
      // Row 2 (even, width 3, RTL): bx0=A, bx1=B, bx2=C → read bx2..0 → C, B, A
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

      // Row 1 (odd, LTR): first step = B ('B'), second step = C ('C')
      expect(parsed.rows[1].steps[0]).toMatchObject({ count: 1, description: 'B' });
      expect(parsed.rows[1].steps[1]).toMatchObject({ count: 1, description: 'C' });

      // Row 2 (even, RTL): bx2=C first, then bx1=B, then bx0=A
      expect(parsed.rows[2].steps[0]).toMatchObject({ count: 1, description: 'C' });
      expect(parsed.rows[2].steps[2]).toMatchObject({ count: 1, description: 'A' });
    });
  });
});
