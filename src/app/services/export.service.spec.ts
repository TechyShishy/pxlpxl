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
            gridType: vi.fn(() => 'square'),
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
});
