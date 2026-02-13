import { Injectable, inject } from '@angular/core';
import {
  PxlFile,
  PXL_FORMAT_VERSION,
  base64ToUint8Array,
  GridType,
} from '../models';
import { LayerService } from './layer.service';
import { CanvasStateService } from './canvas-state.service';
import { ColorService } from './color.service';
import { HistoryService } from './history.service';
import { GridService } from './grid.service';
import { deserializeCommand } from '../commands/command-serialization';
import { LayerCommand } from '../commands/layer.command';

const ACCEPTED_TYPES = '.png,.pxl';

/** PNG magic bytes: 0x89 P N G */
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
/** Gzip magic bytes: 0x1F 0x8B */
const GZIP_MAGIC = [0x1f, 0x8b];

@Injectable({ providedIn: 'root' })
export class ImportService {
  private readonly layerService = inject(LayerService);
  private readonly canvasState = inject(CanvasStateService);
  private readonly colorService = inject(ColorService);
  private readonly historyService = inject(HistoryService);
  private readonly gridService = inject(GridService);

  /**
   * Open a native file picker filtered to PNG and PXL files.
   * Returns the selected File, or null if the user cancels.
   */
  openFilePicker(): Promise<File | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = ACCEPTED_TYPES;
      input.style.display = 'none';

      input.addEventListener('change', () => {
        const file = input.files?.[0] ?? null;
        input.remove();
        resolve(file);
      });

      const onFocus = (): void => {
        window.removeEventListener('focus', onFocus);
        setTimeout(() => {
          if (!input.files?.length) {
            input.remove();
            resolve(null);
          }
        }, 300);
      };
      window.addEventListener('focus', onFocus);

      document.body.appendChild(input);
      input.click();
    });
  }

  /**
   * Import a file into the editor. Detects type by magic bytes.
   */
  async importFile(file: File): Promise<void> {
    const buffer = await readFileAsArrayBuffer(file);
    return this.importFromBuffer(buffer, file.name);
  }

  /**
   * Import from a raw ArrayBuffer. Public to support testing without
   * browser File APIs.
   */
  async importFromBuffer(buffer: ArrayBuffer, filename: string): Promise<void> {
    const header = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));

    if (matchesMagic(header, PNG_MAGIC)) {
      await this.importPng(buffer, filename);
    } else if (matchesMagic(header, GZIP_MAGIC)) {
      await this.importPxl(buffer);
    } else {
      throw new Error(
        `Unrecognised file format for "${filename}". Expected a PNG image or a .pxl project file.`,
      );
    }
  }

  // ── PNG import ────────────────────────────────────────────────────────

  private async importPng(buffer: ArrayBuffer, filename: string): Promise<void> {
    const gridType = this.canvasState.gridType();
    if (this.gridService.isPeyote(gridType)) {
      // eslint-disable-next-line no-console
      console.warn('[ImportService] PNG import on peyote grids is not yet implemented.');
      return;
    }

    const bitmap = await createImageBitmap(new Blob([buffer]));
    const canvasW = this.canvasState.canvasWidth();
    const canvasH = this.canvasState.canvasHeight();

    // Draw the image onto an offscreen canvas to extract RGBA data
    const drawW = Math.min(bitmap.width, canvasW);
    const drawH = Math.min(bitmap.height, canvasH);

    const offscreen = new OffscreenCanvas(canvasW, canvasH);
    const ctx = offscreen.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0, drawW, drawH);
    const imageData = ctx.getImageData(0, 0, canvasW, canvasH);
    bitmap.close();

    // Add a new layer and copy the pixel data into it
    this.layerService.addLayer(canvasW, canvasH);
    const newLayerIndex = this.layerService.activeLayerIndex();
    const previousData = this.layerService.getLayerData(newLayerIndex)!;
    const newData = new Uint8ClampedArray(imageData.data);

    this.layerService.setLayerData(newLayerIndex, newData);

    // Record as undoable LayerCommand
    this.historyService.execute(
      new ImportLayerCommand(
        this.layerService,
        newLayerIndex,
        previousData,
        newData,
        `Import "${filename}"`,
      ),
    );
  }

  // ── PXL import ────────────────────────────────────────────────────────

  private async importPxl(buffer: ArrayBuffer): Promise<void> {
    const json = await decompressGzip(buffer);
    let pxl: PxlFile;
    try {
      pxl = JSON.parse(json) as PxlFile;
    } catch {
      throw new Error('Failed to parse project file as JSON.');
    }

    if (pxl.version !== PXL_FORMAT_VERSION) {
      throw new Error(
        `Unsupported .pxl version ${pxl.version}. Expected version ${PXL_FORMAT_VERSION}.`,
      );
    }

    // Hydrate canvas
    this.canvasState.setCanvasSize(pxl.width, pxl.height);
    this.canvasState.setGridType(pxl.gridType);
    this.canvasState.resetZoom();

    // Hydrate layers
    const layers = pxl.layers.map((l) => ({
      id: l.id,
      name: l.name,
      visible: l.visible,
      opacity: l.opacity,
      data: base64ToUint8Array(l.data),
    }));
    this.layerService.setLayers(layers);

    // Hydrate palette
    this.colorService.setPalette(pxl.palette);

    // Hydrate history
    if (pxl.history) {
      const undoStack = pxl.history.undoStack.map((e) =>
        deserializeCommand(e, this.layerService),
      );
      const redoStack = pxl.history.redoStack.map((e) =>
        deserializeCommand(e, this.layerService),
      );
      this.historyService.setStacks(undoStack, redoStack);
    } else {
      this.historyService.clear();
    }
  }
}

/**
 * LayerCommand subclass that skips execute() on first call since the data
 * was already set directly. Subsequent calls (redo) work normally.
 */
class ImportLayerCommand extends LayerCommand {
  private firstExecute = true;

  override execute(): void {
    if (this.firstExecute) {
      this.firstExecute = false;
      return; // data already applied before command was pushed
    }
    super.execute();
  }
}

// ── Utility functions ─────────────────────────────────────────────────

function matchesMagic(header: Uint8Array, magic: number[]): boolean {
  return magic.every((byte, i) => header[i] === byte);
}

async function decompressGzip(buffer: ArrayBuffer): Promise<string> {
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

  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return new TextDecoder().decode(result);
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (): void => resolve(reader.result as ArrayBuffer);
    reader.onerror = (): void => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}
