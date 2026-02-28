import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import {
  PxlFile,
  PXL_FORMAT_VERSION,
  PxlFileSchema,
  RgpProject,
  RgpProjectSchema,
  base64ToUint8Array,
  letterToColor,
  computeBufferPixelCount,
} from '../models';
import type { Color } from '../models';
import { createLayer } from '../models/layer.model';
import { LayerService } from './layer.service';
import { CanvasStateService } from './canvas-state.service';
import { ColorService } from './color.service';
import { HistoryService } from './history.service';
import { ProjectService } from './project.service';
import { deserializeCommand } from '../commands/command-serialization';
import { LayerCommand } from '../commands/layer.command';
import {
  ImportPngDialogComponent,
  type ImportPngDialogData,
  type ImportPngResult,
} from '../components/import-png-dialog/import-png-dialog.component';

const ACCEPTED_TYPES = '.png,.jpg,.jpeg,.pxl,.rgp';

/** PNG magic bytes: 0x89 P N G */
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
/** JPEG magic bytes: 0xFF 0xD8 0xFF */
const JPG_MAGIC = [0xff, 0xd8, 0xff];
/** Gzip magic bytes: 0x1F 0x8B */
const GZIP_MAGIC = [0x1f, 0x8b];

@Injectable({ providedIn: 'root' })
export class ImportService {
  private readonly layerService = inject(LayerService);
  private readonly canvasState = inject(CanvasStateService);
  private readonly colorService = inject(ColorService);
  private readonly historyService = inject(HistoryService);
  private readonly projectService = inject(ProjectService);
  private readonly dialog = inject(MatDialog);

  /**
   * Open a native file picker filtered to PNG, PXL, and RGP files.
   * Pass `accept` to restrict to a specific set of extensions (e.g. `.rgp`).
   * Returns the selected File, or null if the user cancels.
   */
  openFilePicker(accept: string = ACCEPTED_TYPES): Promise<File | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
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

    if (matchesMagic(header, PNG_MAGIC) || matchesMagic(header, JPG_MAGIC)) {
      await this.importPng(buffer, filename);
    } else if (matchesMagic(header, GZIP_MAGIC)) {
      await this.importGzip(buffer, filename);
    } else {
      throw new Error(
        `Unrecognised file format for "${filename}". Expected a PNG or JPEG image, a .pxl project file, or a .rgp RowGuide project file.`,
      );
    }
  }

  /**
   * Decompress a gzip buffer, parse as JSON, then dispatch to the appropriate
   * import handler by schema validation.
   */
  private async importGzip(buffer: ArrayBuffer, filename: string): Promise<void> {
    const json = await decompressGzip(buffer);
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error(`Failed to parse "${filename}" as JSON.`);
    }

    const rgpResult = RgpProjectSchema.safeParse(parsed);
    if (rgpResult.success) {
      return this.importRgp(rgpResult.data);
    }

    const pxlResult = PxlFileSchema.safeParse(parsed);
    if (pxlResult.success) {
      return this.hydrateFromPxlFile(pxlResult.data as PxlFile);
    }

    throw new Error(
      `Unrecognised gzip file format for "${filename}". Expected a .pxl or .rgp project file.`,
    );
  }

  // ── PNG import ────────────────────────────────────────────────────────

  private async importPng(buffer: ArrayBuffer, filename: string): Promise<void> {
    const bitmap = await createImageBitmap(new Blob([buffer]));

    const canvasW = this.canvasState.canvasWidth();
    const canvasH = this.canvasState.canvasHeight();
    const gridType = this.canvasState.gridType();
    const bufferW = this.canvasState.bufferWidth();
    const bufferH = this.canvasState.bufferHeight();
    const bufferPixelCount = this.canvasState.bufferPixelCount();

    const dialogData: ImportPngDialogData = {
      imageBitmap: bitmap,
      canvasWidth: canvasW,
      canvasHeight: canvasH,
      gridType,
      bufferWidth: bufferW,
      bufferHeight: bufferH,
      bufferPixelCount,
      triangularA: this.canvasState.triangularA(),
      triangularDNum: this.canvasState.triangularDNum(),
      triangularDDen: this.canvasState.triangularDDen(),
      triangularShift: this.canvasState.triangularShift(),
    };

    const dialogRef = this.dialog.open(ImportPngDialogComponent, {
      data: dialogData,
      minWidth: 'min(860px, 95vw)',
      maxWidth: '95vw',
    });
    const result = await firstValueFrom(dialogRef.afterClosed()) as ImportPngResult | undefined;

    bitmap.close();

    if (!(result?.buffer instanceof Uint8ClampedArray)) return; // user cancelled

    // Replace the palette outright when importing into a brand-new, untouched
    // project — i.e. the project has never been saved (no project ID) AND the
    // history stacks are both empty (nothing drawn, not even then undone).
    // All three conditions together mean the canvas has genuinely never been
    // touched.  In all other cases merge the imported colors into the existing
    // palette so nothing is lost.
    const isBlankNewProject =
      this.projectService.currentId === undefined &&
      !this.historyService.canUndo() &&
      !this.historyService.canRedo();
    if (isBlankNewProject) {
      this.colorService.setPalette(result.palette);
    } else {
      this.colorService.mergePalette(result.palette);
    }

    // Add a new layer and copy the mapped pixel data.
    this.layerService.addLayer(canvasW, canvasH, bufferPixelCount);
    const newLayerIndex = this.layerService.activeLayerIndex();
    const previousData = this.layerService.getLayerData(newLayerIndex)!;

    this.layerService.setLayerData(newLayerIndex, result.buffer);

    // Record as undoable LayerCommand.
    this.historyService.execute(
      new ImportLayerCommand(
        this.layerService,
        newLayerIndex,
        previousData,
        result.buffer,
        `Import "${filename}"`,
      ),
    );
  }

  // ── PXL import ────────────────────────────────────────────────────────

  private hydrateFromPxlFile(pxl: PxlFile): void {
    if (pxl.version !== PXL_FORMAT_VERSION) {
      throw new Error(
        `Unsupported .pxl version ${pxl.version}. Expected version ${PXL_FORMAT_VERSION}.`,
      );
    }

    // Legacy: remap 'triangular-slow' → 'triangular'
    let gridType = pxl.gridType;
    let dNum = pxl.triangularDNum;
    let dDen = pxl.triangularDDen;
    if (gridType === 'triangular-slow' as string) {
      gridType = 'triangular';
      // Legacy triangular-slow: if no dNum/dDen, derive from integer d (dNum=1, dDen=d)
      if (dNum === undefined || dDen === undefined) {
        dNum = 1;
        dDen = pxl.triangularD ?? 2;
      }
    }
    // Legacy: old 'triangular' files had integer d but no dNum/dDen — convert to fast-growth
    if (gridType === 'triangular' && dNum === undefined && dDen === undefined && pxl.triangularD !== undefined) {
      dNum = pxl.triangularD;
      dDen = 1;
    }

    // Hydrate canvas
    this.canvasState.setCanvasSize(pxl.width, pxl.height);
    this.canvasState.setGridType(gridType);
    if (gridType === 'triangular' && pxl.triangularA !== undefined) {
      this.canvasState.setTriangularParams(pxl.triangularA, pxl.triangularD ?? 1, dNum, dDen, pxl.triangularShift);
    }
    this.canvasState.resetZoom();

    // Hydrate layers
    const expectedBytes = computeBufferPixelCount(
      pxl.width, pxl.height, gridType,
      pxl.triangularA, pxl.triangularD, dNum, dDen, pxl.triangularShift,
    ) * 4;
    const layers = pxl.layers.map((l) => {
      const data = base64ToUint8Array(l.data);
      if (data.length !== expectedBytes) {
        throw new Error(
          `Layer "${l.name}" buffer size mismatch: expected ${expectedBytes} bytes, got ${data.length}`,
        );
      }
      return {
        id: l.id,
        name: l.name,
        visible: l.visible,
        opacity: l.opacity,
        data,
      };
    });
    this.layerService.setLayers(layers);

    // Hydrate palette
    this.colorService.setPalette(pxl.palette);

    // Hydrate history
    if (pxl.history) {
      const undoStack = pxl.history.undoStack.map((e) =>
        deserializeCommand(e, this.layerService, this.colorService),
      );
      const redoStack = pxl.history.redoStack.map((e) =>
        deserializeCommand(e, this.layerService, this.colorService),
      );
      this.historyService.setStacks(undoStack, redoStack);
    } else {
      this.historyService.clear();
    }
  }

  // ── RGP import ────────────────────────────────────────────────────────

  private importRgp(project: RgpProject): void {
    // Derive buffer dimensions from the RGP data.
    // bufferHeight = number of rows; bufferWidth = total bead count per row.
    const bufferHeight = project.rows.length;
    const bufferWidth = project.rows.reduce((max, row) => {
      const rowCount = row.steps.reduce((sum, s) => sum + s.count, 0);
      return Math.max(max, rowCount);
    }, 0);

    if (bufferHeight === 0 || bufferWidth === 0) {
      throw new Error('RGP project contains no bead data.');
    }

    // Visual canvas width for peyote: bufferWidth = ceil(visualCols / 2),
    // so visualCols = bufferWidth * 2.
    const visualWidth = bufferWidth * 2;
    const visualHeight = bufferHeight;

    const colorMapping: Record<string, string> = project.colorMapping ?? {};

    // Expand rows into a flat RGBA buffer
    const pixelData = new Uint8ClampedArray(bufferWidth * bufferHeight * 4);
    for (let by = 0; by < project.rows.length; by++) {
      // Expand RLE to a flat color array for this row.
      const rowColors: Color[] = [];
      for (const step of project.rows[by].steps) {
        const color = letterToColor(step.description, colorMapping);
        for (let k = 0; k < step.count; k++) {
          rowColors.push(color);
        }
      }
      // Even rows (0-indexed) are encoded right-to-left in the RGP format.
      if (by % 2 === 0) rowColors.reverse();
      for (let bx = 0; bx < bufferWidth && bx < rowColors.length; bx++) {
        const offset = (by * bufferWidth + bx) * 4;
        const color = rowColors[bx];
        pixelData[offset] = color.r;
        pixelData[offset + 1] = color.g;
        pixelData[offset + 2] = color.b;
        pixelData[offset + 3] = color.a;
      }
    }

    // Hydrate canvas state
    this.canvasState.setCanvasSize(visualWidth, visualHeight);
    this.canvasState.setGridType('peyote');
    this.canvasState.resetZoom();

    // Create a single layer sized to the buffer dimensions
    const layer = createLayer(crypto.randomUUID(), 'Layer 1', bufferWidth, bufferHeight);
    layer.data.set(pixelData);
    this.layerService.setLayers([layer]);

    // Build palette from colorMapping values
    const palette = Object.entries(colorMapping).map(([letter, _hex]) =>
      letterToColor(letter, colorMapping),
    );
    this.colorService.setPalette(palette.length > 0 ? palette : []);

    this.historyService.clear();
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
