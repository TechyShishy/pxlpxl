import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { FileSave } from '../plugins/file-save.plugin';
import { RenderService } from './render.service';
import { CanvasStateService } from './canvas-state.service';
import { GridService } from './grid.service';
import { LayerService } from './layer.service';
import { ColorService } from './color.service';
import { HistoryService } from './history.service';
import { ProjectService } from './project.service';
import { SettingsService } from './settings.service';
import {
  PxlFile,
  PXL_FORMAT_VERSION,
  uint8ArrayToBase64,
  buildPaletteLetterMap,
  RgpProject,
  RgpRow,
  resolveTriangularD,
  triangularRowWidth,
  triangularCumPixels,
  computeBufferPixelCount,
  BeadSize,
} from '../models';
import { colorToHex } from '../models';
import { colorToDbCode } from '../utils/color-pools';
import { serializeCommand } from '../commands/command-serialization';

export type ExportFormat = 'png' | 'gif' | 'spritesheet' | 'rgp';

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
  private readonly settingsService = inject(SettingsService);
  private readonly snackBar = inject(MatSnackBar);

  /**
   * Export the current canvas as a Blob in the specified format.
   */
  async exportAsBlob(options: ExportOptions): Promise<Blob> {
    const gridType = this.canvasState.gridType();

    if (this.gridService.isPeyote(gridType) || this.gridService.isAnyTriangular(gridType)) {
      return this.exportNonSquare(options);
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

  private async exportNonSquare(options: ExportOptions): Promise<Blob> {
    // For triangular grids the bead aspect ratio (width/height) may differ
    // from 1:1. Derive it from the current beadSize signal and apply to the
    // export scale so the exported image matches what the viewport shows.
    const bs = this.canvasState.beadSize();
    const viewZoom = this.canvasState.transform().scale;
    const xScale = viewZoom > 0 ? bs.width / viewZoom : 1;
    const exportBeadSize: BeadSize = { width: options.scale * xScale, height: options.scale };
    const composited = this.renderService.compositeToCanvas(exportBeadSize);
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
    if (options.format === 'rgp') {
      const rgpFilename = filename.replace(/\.[^.]+$/, '') + '.rgp';
      await this.downloadRgp(rgpFilename);
      return;
    }
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
      triangularA: this.canvasState.gridType() === 'triangular' ? this.canvasState.triangularA() : undefined,
      triangularD: this.canvasState.gridType() === 'triangular' ? this.canvasState.triangularD() : undefined,
      triangularDNum: this.canvasState.gridType() === 'triangular' ? this.canvasState.triangularDNum() : undefined,
      triangularDDen: this.canvasState.gridType() === 'triangular' ? this.canvasState.triangularDDen() : undefined,
      triangularShift: this.canvasState.gridType() === 'triangular' ? this.canvasState.triangularShift() : undefined,
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
   * Export the current project as an .rgp file (RowGuide Project, gzipped JSON).
   * Composites all visible layers and run-length encodes each buffer row.
   */
  async exportAsRgp(oddRowDirection: 'ltr' | 'rtl' = 'rtl'): Promise<Blob> {
    const bufferWidth = this.canvasState.bufferWidth();
    const bufferHeight = this.canvasState.bufferHeight();
    const gridType = this.canvasState.gridType();

    // For triangular grids, the buffer is packed (variable row widths),
    // so we need the true pixel count rather than bufferWidth × bufferHeight.
    const isTriangular = gridType === 'triangular';
    const triangularA = isTriangular ? this.canvasState.triangularA() : 0;
    const triShift = isTriangular ? this.canvasState.triangularShift() : 0;
    const { dNum: triDNum, dDen: triDDen } = isTriangular
      ? resolveTriangularD(
          this.canvasState.triangularD(),
          this.canvasState.triangularDNum(),
          this.canvasState.triangularDDen(),
        )
      : { dNum: 0, dDen: 1 };

    const bufferSize = isTriangular
      ? computeBufferPixelCount(0, bufferHeight, 'triangular', triangularA, undefined, triDNum, triDDen, triShift) * 4
      : bufferWidth * bufferHeight * 4;

    // Composite visible layers bottom-to-top using Porter-Duff 'over'
    const composited = new Uint8ClampedArray(bufferSize);
    for (const layer of this.layerService.layers()) {
      if (!layer.visible) continue;
      const src = layer.data;
      const opacityFactor = layer.opacity; // 0–1
      for (let i = 0; i < bufferSize; i += 4) {
        const aSrc = (src[i + 3] / 255) * opacityFactor;
        if (aSrc === 0) continue;
        const aDst = composited[i + 3] / 255;
        const aOut = aSrc + aDst * (1 - aSrc);
        if (aOut === 0) continue;
        composited[i] = Math.round(
          (src[i] * aSrc + composited[i] * aDst * (1 - aSrc)) / aOut,
        );
        composited[i + 1] = Math.round(
          (src[i + 1] * aSrc + composited[i + 1] * aDst * (1 - aSrc)) / aOut,
        );
        composited[i + 2] = Math.round(
          (src[i + 2] * aSrc + composited[i + 2] * aDst * (1 - aSrc)) / aOut,
        );
        composited[i + 3] = Math.round(aOut * 255);
      }
    }

    // Build hex→letter map from the current palette
    const palette = this.colorService.palette();
    const hexToLetter = buildPaletteLetterMap(palette);

    // Build letter→value for the colorMapping field in the RGP payload.
    // In delica mode, values are DB codes (e.g. "DB0031"); otherwise hex.
    // colorToDbCode matches on RGB only (alpha is irrelevant for physical beads).
    const useDbCodes = this.settingsService.defaultColorPool() === 'delica';
    const colorMapping: Record<string, string> = {};
    for (const color of palette) {
      const hex = colorToHex(color);
      // hexToLetter is built from the same palette array, so every entry has a letter.
      const letter = hexToLetter.get(hex)!;
      colorMapping[letter] = useDbCodes ? (colorToDbCode(color) ?? hex) : hex;
    }

    // Run-length encode each buffer row into RgpRow
    const rows: RgpRow[] = [];
    for (let by = 0; by < bufferHeight; by++) {
      let stepId = 1;
      let currentDesc: string | null = null;
      let currentCount = 0;
      const steps: RgpRow['steps'] = [];

      // Determine the width and base offset for this row.
      // Triangular grids have variable row widths and packed offsets;
      // square/peyote rows all have the same width and fixed stride.
      const rowWidth = isTriangular
        ? triangularRowWidth(by, triangularA, triDNum, triDDen, triShift)
        : bufferWidth;
      const rowBaseOffset = isTriangular
        ? triangularCumPixels(by, triangularA, triDNum, triDDen, triShift)
        : by * bufferWidth;

      // Odd buffer rows are stored right-to-left in the RGP format.
      // The oddRowDirection option controls only these rows; even rows always go LTR.
      const isRtl = by % 2 === 1 && oddRowDirection === 'rtl';
      const bxStart = isRtl ? rowWidth - 1 : 0;
      const bxEnd   = isRtl ? -1 : rowWidth;
      const bxStep  = isRtl ? -1 : 1;
      for (let bx = bxStart; bx !== bxEnd; bx += bxStep) {
        const offset = (rowBaseOffset + bx) * 4;
        const r = composited[offset];
        const g = composited[offset + 1];
        const b = composited[offset + 2];
        const a = composited[offset + 3];
        const hex = colorToHex({ r, g, b, a });
        const letter = hexToLetter.get(hex) ?? hex;

        if (letter === currentDesc) {
          currentCount++;
        } else {
          if (currentDesc !== null) {
            steps.push({ id: stepId++, count: currentCount, description: currentDesc });
          }
          currentDesc = letter;
          currentCount = 1;
        }
      }
      if (currentDesc !== null) {
        steps.push({ id: stepId, count: currentCount, description: currentDesc });
      }

      rows.push({ id: by + 1, steps });
    }

    const rgpProject: RgpProject = {
      id: uuidToInt(
        this.projectService.currentId !== undefined
          ? String(this.projectService.currentId)
          : (this.layerService.layers()[0]?.id ?? ''),
      ),
      name: this.projectService.currentProjectName(),
      rows,
      colorMapping,
    };

    return compressGzip(JSON.stringify(rgpProject), 'application/x-rowguide-project');
  }

  /**
   * Download the current project as an .rgp file.
   */
  async downloadRgp(filename: string, oddRowDirection: 'ltr' | 'rtl' = 'rtl'): Promise<void> {
    const blob = await this.exportAsRgp(oddRowDirection);
    if (Capacitor.isNativePlatform()) {
      await this.shareFileNative(blob, filename, 'application/x-rowguide-project');
    } else {
      this.downloadBlobInBrowser(blob, filename);
    }
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
   * On Android: save the file directly to the device's Downloads folder using
   * the MediaStore API (API 29+) or the legacy public Downloads directory
   * (API 28 and below), then show a confirmation snackbar.
   *
   * On all other platforms: write to the Capacitor cache directory and trigger
   * the native share sheet so the user can save or send the file.
   */
  private async shareFileNative(blob: Blob, filename: string, mimeType: string): Promise<void> {
    const base64 = await this.blobToBase64(blob);

    if (Capacitor.getPlatform() === 'android') {
      try {
        const result = await FileSave.saveToDownloads({ filename, mimeType, data: base64 });
        this.snackBar.open(`Saved to Downloads/${filename}`, 'OK', {
          duration: 4000,
          panelClass: 'snack-success',
        });
        // Unused but kept for future caller use.
        void result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.snackBar.open(`Export failed: ${message}`, 'Dismiss', {
          duration: 6000,
          panelClass: 'snack-error',
        });
      }
      return;
    }

    const writeResult = await this.writeToFilesystem({
      path: filename,
      data: base64,
      directory: Directory.Cache,
    });

    await this.shareNative({
      title: filename,
      url: writeResult.uri,
      dialogTitle: `Share ${filename}`,
    });
  }

  /**
   * Write a file to the Capacitor filesystem. Protected to allow test spying.
   */
  protected writeToFilesystem(
    options: Parameters<typeof Filesystem.writeFile>[0],
  ): ReturnType<typeof Filesystem.writeFile> {
    return Filesystem.writeFile(options);
  }

  /**
   * Share a file via the Capacitor Share plugin. Protected to allow test spying.
   */
  protected shareNative(
    options: Parameters<typeof Share.share>[0],
  ): ReturnType<typeof Share.share> {
    return Share.share(options);
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
      case 'rgp':
        return 'application/x-rowguide-project';
      default:
        return 'application/octet-stream';
    }
  }
}

/**
 * Derive a stable non-negative integer from a UUID string using djb2 hashing.
 * Used to produce a consistent RGP project ID for unsaved projects.
 */
function uuidToInt(uuid: string): number {
  let hash = 5381;
  for (let i = 0; i < uuid.length; i++) {
    hash = ((hash << 5) + hash + uuid.charCodeAt(i)) & 0x7fffffff;
  }
  return hash;
}

async function compressGzip(text: string, mimeType = 'application/gzip'): Promise<Blob> {
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
  return new Blob(chunks as BlobPart[], { type: mimeType });
}
