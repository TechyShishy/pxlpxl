import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { RenderService } from './render.service';
import { CanvasStateService } from './canvas-state.service';
import { GridService } from './grid.service';
import { LayerService } from './layer.service';
import { ColorService } from './color.service';
import { HistoryService } from './history.service';
import { ProjectService } from './project.service';
import {
  PxlFile,
  PXL_FORMAT_VERSION,
  uint8ArrayToBase64,
} from '../models';
import { serializeCommand } from '../commands/command-serialization';

export type ExportFormat = 'png' | 'gif' | 'spritesheet';

export interface ExportOptions {
  format: ExportFormat;
  scale: number; // Upscale factor (1 = original size, 2 = 2x, etc.)
  transparent: boolean;
}

@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly renderService = inject(RenderService);
  private readonly canvasState = inject(CanvasStateService);
  private readonly gridService = inject(GridService);
  private readonly layerService = inject(LayerService);
  private readonly colorService = inject(ColorService);
  private readonly historyService = inject(HistoryService);
  private readonly projectService = inject(ProjectService);

  /**
   * Export the current canvas as a Blob in the specified format.
   */
  async exportAsBlob(options: ExportOptions): Promise<Blob> {
    const gridType = this.canvasState.gridType();

    if (this.gridService.isPeyote(gridType)) {
      return this.exportPeyote(options);
    }

    const imageData = this.renderService.compositeToImageData();
    const width = this.canvasState.bufferWidth();
    const height = this.canvasState.bufferHeight();
    const scaledWidth = width * options.scale;
    const scaledHeight = height * options.scale;

    const canvas = new OffscreenCanvas(scaledWidth, scaledHeight);
    const ctx = canvas.getContext('2d')!;

    // If not transparent, fill with white background
    if (!options.transparent) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, scaledWidth, scaledHeight);
    }

    // Draw the composite at the specified scale
    const tempCanvas = new OffscreenCanvas(width, height);
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.putImageData(imageData, 0, 0);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tempCanvas, 0, 0, scaledWidth, scaledHeight);

    switch (options.format) {
      case 'png':
        return canvas.convertToBlob({ type: 'image/png' });
      case 'gif':
        return canvas.convertToBlob({ type: 'image/png' });
      case 'spritesheet':
        return canvas.convertToBlob({ type: 'image/png' });
      default:
        return canvas.convertToBlob({ type: 'image/png' });
    }
  }

  private async exportPeyote(options: ExportOptions): Promise<Blob> {
    const composited = this.renderService.compositeToCanvas(options.scale);
    const w = composited.width;
    const h = composited.height;

    if (!options.transparent) {
      // Draw white background behind composited content
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(composited, 0, 0);
      return canvas.convertToBlob({ type: 'image/png' });
    }

    return composited.convertToBlob({ type: 'image/png' });
  }

  /**
   * Trigger a download in the browser or share via native on mobile.
   */
  async downloadExport(options: ExportOptions, filename: string): Promise<void> {
    const blob = await this.exportAsBlob(options);

    if (Capacitor.isNativePlatform()) {
      await this.shareFileNative(blob, filename, this.mimeTypeForFormat(options.format));
    } else {
      this.downloadBlobInBrowser(blob, filename);
    }
  }

  /**
   * Export the current project as a .pxl file (gzipped JSON).
   */
  async exportAsPxl(): Promise<Blob> {
    const undoStack = this.historyService.getUndoStack();
    const redoStack = this.historyService.getRedoStack();

    const pxl: PxlFile = {
      version: PXL_FORMAT_VERSION,
      name: this.projectService.currentProjectName(),
      width: this.canvasState.canvasWidth(),
      height: this.canvasState.canvasHeight(),
      gridType: this.canvasState.gridType(),
      palette: this.colorService.palette().map((c) => ({ ...c })),
      layers: this.layerService.layers().map((l) => ({
        id: l.id,
        name: l.name,
        visible: l.visible,
        opacity: l.opacity,
        data: uint8ArrayToBase64(l.data),
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (undoStack.length > 0 || redoStack.length > 0) {
      pxl.history = {
        undoStack: undoStack.map(serializeCommand)
          .filter((e): e is NonNullable<typeof e> => e !== null),
        redoStack: redoStack.map(serializeCommand)
          .filter((e): e is NonNullable<typeof e> => e !== null),
      };
    }

    const json = JSON.stringify(pxl);
    return compressGzip(json);
  }

  /**
   * Download the current project as a .pxl file.
   */
  async downloadPxl(filename: string): Promise<void> {
    const blob = await this.exportAsPxl();

    if (Capacitor.isNativePlatform()) {
      await this.shareFileNative(blob, filename, 'application/gzip');
    } else {
      this.downloadBlobInBrowser(blob, filename);
    }
  }

  /**
   * Download a blob via an anchor element (browser-only).
   */
  private downloadBlobInBrowser(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Write a blob to the Capacitor cache directory, then trigger the native
   * share sheet so the user can save, send, or otherwise export the file.
   */
  private async shareFileNative(blob: Blob, filename: string, mimeType: string): Promise<void> {
    const base64 = await this.blobToBase64(blob);

    const writeResult = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Cache,
    });

    await Share.share({
      title: filename,
      url: writeResult.uri,
      dialogTitle: `Share ${filename}`,
    });
  }

  /**
   * Convert a Blob to a base64 string (without data-URI prefix).
   */
  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        // Strip the "data:...;base64," prefix
        resolve(dataUrl.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private mimeTypeForFormat(format: ExportFormat): string {
    switch (format) {
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'spritesheet':
        return 'image/png';
      default:
        return 'application/octet-stream';
    }
  }
}

async function compressGzip(text: string): Promise<Blob> {
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(new TextEncoder().encode(text));
  writer.close();

  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return new Blob(chunks as BlobPart[], { type: 'application/gzip' });
}
