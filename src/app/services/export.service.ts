import { Injectable, inject } from '@angular/core';
import { RenderService } from './render.service';
import { CanvasStateService } from './canvas-state.service';
import { GridService } from './grid.service';

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

  /**
   * Export the current canvas as a Blob in the specified format.
   */
  async exportAsBlob(options: ExportOptions): Promise<Blob> {
    const gridType = this.canvasState.gridType();

    if (this.gridService.isPeyote(gridType)) {
      return this.exportPeyote(options);
    }

    const imageData = this.renderService.compositeToImageData();
    const width = this.canvasState.canvasWidth();
    const height = this.canvasState.canvasHeight();
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
   * Trigger a download in the browser.
   */
  async downloadExport(options: ExportOptions, filename: string): Promise<void> {
    const blob = await this.exportAsBlob(options);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
