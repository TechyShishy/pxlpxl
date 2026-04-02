import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  afterNextRender,
  ElementRef,
  viewChild,
  effect,
  DestroyRef,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { GridService } from '../../services/grid.service';
import { GridType, triangularRowWidth, pixelOffset, extractUniqueColors } from '../../models';
import type { Color } from '../../models';
import { medianCut, kMeans, quantizeBuffer } from '../../utils/color-quantize';
import { type ColorPoolId, getColorPool } from '../../utils/color-pools';
import { SettingsService } from '../../services/settings.service';

/** Data passed into the dialog from ImportService. */
export interface ImportPngDialogData {
  imageBitmap: ImageBitmap;
  /** Visual canvas width (number of visual columns). For peyote, equals bufferWidth (column-pair count); visual columns = bufferWidth * 2. */
  canvasWidth: number;
  /** Visual canvas height. For peyote, equals bufferHeight (interleaved row count); visible bead rows = bufferHeight / 2. Not used in the peyote layout path — bufferHeight is used directly. */
  canvasHeight: number;
  gridType: GridType;
  bufferWidth: number;
  bufferHeight: number;
  bufferPixelCount: number;
  triangularA?: number;
  triangularDNum?: number;
  triangularDDen?: number;
  triangularShift?: number;
}

export type { SamplingMode, QuantizeAlgorithm } from '../../models/settings.model';
import type { SamplingMode, QuantizeAlgorithm } from '../../models/settings.model';

/** Value returned when the user confirms the import dialog. */
export interface ImportPngResult {
  buffer: Uint8ClampedArray;
  /** All unique colors present in the (possibly quantized) buffer. */
  palette: Color[];
}

/** Pixel size of the square preview container inside the dialog. */
const CONTAINER = 480;

/**
 * Dialog for cropping and zooming a PNG before importing it into a layer.
 *
 * The crop box is fixed in the center of the canvas and sized to match the
 * visual bounding box of the grid. The user pans/zooms the imported image
 * underneath the crop box. On Import, the visible region is sampled into the
 * layer buffer using the selected sampling mode.
 */
@Component({
  selector: 'app-import-png-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatButtonToggleModule, MatDividerModule, MatFormFieldModule, MatInputModule, FormsModule],
  templateUrl: './import-png-dialog.component.html',
  styleUrl: './import-png-dialog.component.scss',
})
export class ImportPngDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<ImportPngDialogComponent>);
  private readonly data = inject<ImportPngDialogData>(MAT_DIALOG_DATA);
  private readonly gridService = inject(GridService);
  private readonly settingsService = inject(SettingsService);

  private readonly previewCanvas =
    viewChild.required<ElementRef<HTMLCanvasElement>>('preview');

  readonly samplingMode = signal<SamplingMode>(this.settingsService.settings().defaultSamplingMode);
  readonly maxColors = signal<number>(this.settingsService.settings().defaultMaxColors);
  readonly quantizeAlgorithm = signal<QuantizeAlgorithm>(this.settingsService.settings().defaultQuantizeAlgorithm);
  readonly colorPoolId = signal<ColorPoolId>(this.settingsService.settings().defaultColorPool);

  // Image pan/zoom state
  private readonly imageOffsetX = signal(0);
  private readonly imageOffsetY = signal(0);
  private readonly imageScale = signal(1);

  // Crop box layout, computed once on first render
  private cropBoxX = 0;
  private cropBoxY = 0;
  private cropBoxW = 0;
  private cropBoxH = 0;
  /** Size of one "virtual grid unit" in dialog-canvas pixels. */
  private cellSize = 1;
  /** Grid visual bounding box width, in virtual grid units. */
  private gridVisualW = 1;
  /** Grid visual bounding box height, in virtual grid units. */
  private gridVisualH = 1;

  private readonly activePointers = new Map<number, { x: number; y: number }>();
  private lastPinchDistance = 0;
  private animFrameId = 0;

  // ── Processed preview state ────────────────────────────────────────

  /** Whether live median-cut is too slow and should be skipped during interaction. */
  private skipLiveQuantize = false;
  /** Timer for the debounced "settle" re-render with the user's selected algorithm. */
  private settleTimeout: ReturnType<typeof setTimeout> | undefined;
  /** Cached fully-processed buffer from the last settle render. */
  private settledBuffer: Uint8ClampedArray | null = null;
  /** Cached palette from the last settle render. */
  private settledPalette: Color[] | null = null;
  /** Whether the settled cache is still valid or needs recomputation. */
  private settledDirty = true;
  /** Whether layout has been initialised (guards against effect running too early). */
  private layoutReady = false;

  private readonly destroyRef = inject(DestroyRef);

  /** Settle delay in ms — wait for interaction to stop before running full quantization. */
  private static readonly SETTLE_MS = 300;
  /** Max time in ms for live quantization per frame before disabling it. */
  private static readonly LIVE_QUANTIZE_BUDGET_MS = 16;

  constructor() {
    afterNextRender(() => {
      this.initLayout();
      this.layoutReady = true;
      this.scheduleDraw();
      this.scheduleSettle();
    });

    // React to option changes: re-render preview when sampling, maxColors, or algorithm change.
    effect(() => {
      // Read signals to subscribe.
      this.samplingMode();
      this.maxColors();
      this.quantizeAlgorithm();
      this.colorPoolId();
      if (!this.layoutReady) return;
      this.invalidateSettled();
      this.scheduleDraw();
      this.scheduleSettle();
    });

    this.destroyRef.onDestroy(() => {
      if (this.settleTimeout !== undefined) clearTimeout(this.settleTimeout);
      if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    });
  }

  // ── Layout initialisation ──────────────────────────────────────────

  private initLayout(): void {
    const {
      canvasWidth,
      canvasHeight,
      gridType,
      triangularA,
      triangularDNum,
      triangularDDen,
      triangularShift,
      bufferHeight,
    } = this.data;

    const dNum = triangularDNum ?? 1;
    const dDen = triangularDDen ?? 1;
    const shift = triangularShift ?? 0;

    // Compute the visual bounding box of the grid in abstract "grid units".
    if (gridType === 'triangular' && triangularA !== undefined) {
      const usePeyote = this.gridService.usesPeyoteStagger(gridType, 0, dNum, dDen);
      let maxRowWidth = 0;
      for (let r = 0; r < bufferHeight; r++) {
        maxRowWidth = Math.max(maxRowWidth, triangularRowWidth(r, triangularA, dNum, dDen, shift));
      }
      if (usePeyote) {
        // 2-stride horizontal layout, half-height rows.
        this.gridVisualW = maxRowWidth * 2;
        this.gridVisualH = bufferHeight / 2;
      } else {
        this.gridVisualW = maxRowWidth;
        this.gridVisualH = bufferHeight;
      }
    } else if (gridType === 'peyote') {
      // Each buffer column pair encodes two visual columns (even and odd).
      // beadsPerColumn = bufferHeight / 2; odd columns add a half-bead visual offset.
      // bufferWidth is accessed directly (not via the destructure above) because
      // canvasWidth == bufferWidth for peyote and using bufferWidth makes the
      // ×2 relationship to visual columns self-documenting.
      this.gridVisualW = this.data.bufferWidth * 2;
      this.gridVisualH = bufferHeight / 2 + 0.5;
    } else {
      this.gridVisualW = canvasWidth;
      this.gridVisualH = canvasHeight;
    }

    // Fit the crop box in the CONTAINER, maintaining the grid's visual aspect ratio.
    const cellW = CONTAINER / this.gridVisualW;
    const cellH = CONTAINER / this.gridVisualH;
    this.cellSize = Math.min(cellW, cellH);

    this.cropBoxW = this.gridVisualW * this.cellSize;
    this.cropBoxH = this.gridVisualH * this.cellSize;
    this.cropBoxX = (CONTAINER - this.cropBoxW) / 2;
    this.cropBoxY = (CONTAINER - this.cropBoxH) / 2;

    // Initial image placement: cover the crop box.
    const { imageBitmap } = this.data;
    const scaleX = this.cropBoxW / imageBitmap.width;
    const scaleY = this.cropBoxH / imageBitmap.height;
    const initScale = Math.max(scaleX, scaleY);
    this.imageScale.set(initScale);
    const imgW = imageBitmap.width * initScale;
    const imgH = imageBitmap.height * initScale;
    this.imageOffsetX.set(this.cropBoxX + (this.cropBoxW - imgW) / 2);
    this.imageOffsetY.set(this.cropBoxY + (this.cropBoxH - imgH) / 2);
  }

  // ── Settle / cache helpers ─────────────────────────────────────────

  /** Mark the settled cache as stale. */
  private invalidateSettled(): void {
    this.settledDirty = true;
    this.settledBuffer = null;
    this.settledPalette = null;
    this.skipLiveQuantize = false;
  }

  /** Schedule a debounced full-quality re-render. */
  private scheduleSettle(): void {
    if (this.settleTimeout !== undefined) clearTimeout(this.settleTimeout);
    this.settleTimeout = setTimeout(() => {
      this.settleTimeout = undefined;
      this.runSettleRender();
    }, ImportPngDialogComponent.SETTLE_MS);
  }

  /** Perform the full-quality render with the user's selected algorithm. */
  private runSettleRender(): void {
    const { buffer, palette } = this.computeProcessedBuffer(this.quantizeAlgorithm());
    this.settledBuffer = buffer;
    this.settledPalette = palette;
    this.settledDirty = false;
    this.skipLiveQuantize = false;
    this.scheduleDraw();
  }

  // ── Drawing ────────────────────────────────────────────────────────

  private scheduleDraw(): void {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    this.animFrameId = requestAnimationFrame(() => {
      this.animFrameId = 0;
      this.draw();
    });
  }

  private draw(): void {
    const canvasEl = this.previewCanvas().nativeElement;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    // Dark background so transparent pixels are visible.
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, CONTAINER, CONTAINER);

    // Draw a subtle transparency checkerboard inside the crop box.
    this.drawCheckerboard(ctx);

    // Get the processed buffer to render.
    let buffer: Uint8ClampedArray;
    if (!this.settledDirty && this.settledBuffer) {
      // Use the fully-settled (user-selected algorithm) result.
      buffer = this.settledBuffer;
    } else {
      // Live path: fast median-cut (or no quantization if too slow).
      const liveAlgorithm = this.skipLiveQuantize ? undefined : 'median-cut' as QuantizeAlgorithm;
      const t0 = performance.now();
      const result = this.computeProcessedBuffer(liveAlgorithm);
      const elapsed = performance.now() - t0;
      if (elapsed > ImportPngDialogComponent.LIVE_QUANTIZE_BUDGET_MS && liveAlgorithm !== undefined) {
        // Median-cut was too slow — skip quantization for subsequent live frames.
        this.skipLiveQuantize = true;
      }
      buffer = result.buffer;
    }

    // Render the pixelated buffer onto the crop box.
    this.renderBuffer(ctx, buffer);

    // Draw grey overlay around the crop box (4 rects forming a "vignette").
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, CONTAINER, this.cropBoxY);
    ctx.fillRect(
      0,
      this.cropBoxY + this.cropBoxH,
      CONTAINER,
      CONTAINER - this.cropBoxY - this.cropBoxH,
    );
    ctx.fillRect(0, this.cropBoxY, this.cropBoxX, this.cropBoxH);
    ctx.fillRect(
      this.cropBoxX + this.cropBoxW,
      this.cropBoxY,
      CONTAINER - this.cropBoxX - this.cropBoxW,
      this.cropBoxH,
    );

    // Crop box border.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.cropBoxX, this.cropBoxY, this.cropBoxW, this.cropBoxH);
  }

  /** Draw a subtle checkerboard inside the crop box to indicate transparency. */
  private drawCheckerboard(ctx: CanvasRenderingContext2D): void {
    const checkSize = 8;
    const x0 = this.cropBoxX;
    const y0 = this.cropBoxY;
    const x1 = x0 + this.cropBoxW;
    const y1 = y0 + this.cropBoxH;
    for (let y = y0; y < y1; y += checkSize) {
      for (let x = x0; x < x1; x += checkSize) {
        const col = Math.floor((x - x0) / checkSize);
        const row = Math.floor((y - y0) / checkSize);
        ctx.fillStyle = (col + row) % 2 === 0 ? '#2a2a2a' : '#3a3a3a';
        ctx.fillRect(x, y, Math.min(checkSize, x1 - x), Math.min(checkSize, y1 - y));
      }
    }
  }

  // ── Pointer events (pan + pinch) ─────────────────────────────────

  onPointerDown(e: PointerEvent): void {
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (this.activePointers.size === 2) {
      this.lastPinchDistance = this.getPinchDistance();
    }
  }

  onPointerMove(e: PointerEvent): void {
    const ptr = this.activePointers.get(e.pointerId);
    if (!ptr) return;

    const prevX = ptr.x;
    const prevY = ptr.y;
    ptr.x = e.clientX;
    ptr.y = e.clientY;

    if (this.activePointers.size === 1) {
      // Single pointer — pan
      this.imageOffsetX.update((v) => v + (ptr.x - prevX));
      this.imageOffsetY.update((v) => v + (ptr.y - prevY));
    } else if (this.activePointers.size === 2 && this.lastPinchDistance > 0) {
      // Two pointers — pinch zoom centered on midpoint
      const dist = this.getPinchDistance();
      const factor = dist / this.lastPinchDistance;
      const center = this.getPinchCenter();
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const cx = center.x - rect.left;
      const cy = center.y - rect.top;
      const oldScale = this.imageScale();
      const newScale = Math.max(0.01, Math.min(200, oldScale * factor));
      this.imageScale.set(newScale);
      this.imageOffsetX.set(cx + (this.imageOffsetX() - cx) * (newScale / oldScale));
      this.imageOffsetY.set(cy + (this.imageOffsetY() - cy) * (newScale / oldScale));
      this.lastPinchDistance = dist;
    }
    this.invalidateSettled();
    this.scheduleDraw();
    this.scheduleSettle();
  }

  onPointerUp(e: PointerEvent): void {
    this.activePointers.delete(e.pointerId);
    if (this.activePointers.size < 2) {
      this.lastPinchDistance = 0;
    }
  }

  private getPinchDistance(): number {
    const pts = Array.from(this.activePointers.values());
    if (pts.length < 2) return 0;
    const dx = pts[0].x - pts[1].x;
    const dy = pts[0].y - pts[1].y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private getPinchCenter(): { x: number; y: number } {
    const pts = Array.from(this.activePointers.values());
    return {
      x: (pts[0].x + pts[1].x) / 2,
      y: (pts[0].y + pts[1].y) / 2,
    };
  }

  // ── Wheel event (zoom) ────────────────────────────────────────────

  onWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = Math.exp(-e.deltaY * 0.001);
    const oldScale = this.imageScale();
    const newScale = Math.max(0.01, Math.min(200, oldScale * factor));
    const ox = this.imageOffsetX();
    const oy = this.imageOffsetY();
    this.imageScale.set(newScale);
    // Zoom toward the cursor position.
    this.imageOffsetX.set(cx + (ox - cx) * (newScale / oldScale));
    this.imageOffsetY.set(cy + (oy - cy) * (newScale / oldScale));
    this.invalidateSettled();
    this.scheduleDraw();
    this.scheduleSettle();
  }

  // ── Dialog actions ────────────────────────────────────────────────

  onImport(): void {
    // Use the settled cache if available; otherwise compute fresh.
    let buffer: Uint8ClampedArray;
    let palette: Color[];
    if (!this.settledDirty && this.settledBuffer && this.settledPalette) {
      buffer = this.settledBuffer;
      palette = this.settledPalette;
    } else {
      const result = this.computeProcessedBuffer(this.quantizeAlgorithm());
      buffer = result.buffer;
      palette = result.palette;
    }
    this.dialogRef.close({ buffer, palette } satisfies ImportPngResult);
  }

  onCancel(): void {
    this.dialogRef.close(undefined);
  }

  // ── Processing pipeline ───────────────────────────────────────────

  /**
   * Produce the sampled + quantized buffer ready for import or preview.
   *
   * @param algorithm - The quantization algorithm to use. Pass `undefined` to
   *   skip quantization entirely (raw sampled pixels only).
   */
  private computeProcessedBuffer(
    algorithm: QuantizeAlgorithm | undefined,
  ): { buffer: Uint8ClampedArray; palette: Color[] } {
    const raw = this.produceLayerData();
    const uniqueColors = extractUniqueColors(raw);
    const max = this.maxColors();
    const pool = getColorPool(this.colorPoolId());

    if (algorithm !== undefined && max > 0 && uniqueColors.length > max) {
      const palette =
        algorithm === 'k-means'
          ? kMeans(uniqueColors, max, 20, pool)
          : medianCut(uniqueColors, max, pool);
      return { buffer: quantizeBuffer(raw, palette), palette };
    }

    return { buffer: raw, palette: uniqueColors };
  }

  // ── Grid-aware preview renderer ───────────────────────────────────

  /**
   * Render a processed pixel buffer onto the preview canvas inside the crop box,
   * using grid-type-aware positioning so peyote and triangular layouts look correct.
   */
  private renderBuffer(ctx: CanvasRenderingContext2D, buffer: Uint8ClampedArray): void {
    const {
      gridType,
      bufferWidth,
      bufferHeight,
      triangularA,
      triangularDNum,
      triangularDDen,
      triangularShift,
    } = this.data;

    const dNum = triangularDNum ?? 1;
    const dDen = triangularDDen ?? 1;
    const shift = triangularShift ?? 0;

    if (gridType === 'triangular' && triangularA !== undefined) {
      this.renderTriangularBuffer(ctx, buffer, bufferWidth, bufferHeight, triangularA, dNum, dDen, shift);
    } else if (gridType === 'peyote') {
      this.renderPeyoteBuffer(ctx, buffer, bufferWidth, bufferHeight);
    } else {
      this.renderSquareBuffer(ctx, buffer, bufferWidth, bufferHeight);
    }
  }

  private renderSquareBuffer(
    ctx: CanvasRenderingContext2D,
    buffer: Uint8ClampedArray,
    bufW: number,
    bufH: number,
  ): void {
    const cs = this.cellSize;
    for (let by = 0; by < bufH; by++) {
      for (let bx = 0; bx < bufW; bx++) {
        const off = (by * bufW + bx) * 4;
        const a = buffer[off + 3];
        if (a === 0) continue;
        ctx.fillStyle = `rgba(${buffer[off]},${buffer[off + 1]},${buffer[off + 2]},${a / 255})`;
        ctx.fillRect(
          this.cropBoxX + bx * cs,
          this.cropBoxY + by * cs,
          Math.ceil(cs),
          Math.ceil(cs),
        );
      }
    }
  }

  private renderPeyoteBuffer(
    ctx: CanvasRenderingContext2D,
    buffer: Uint8ClampedArray,
    bufW: number,
    bufH: number,
  ): void {
    const cs = this.cellSize;
    for (let by = 0; by < bufH; by++) {
      for (let bx = 0; bx < bufW; bx++) {
        const off = (by * bufW + bx) * 4;
        const a = buffer[off + 3];
        if (a === 0) continue;
        const { col, beadRow } = this.gridService.bufferToVisual(bx, by);
        if (col >= this.data.bufferWidth * 2) continue; // unreachable for valid buffer coords
        const isOddCol = col % 2 === 1;
        const vx = col;
        const vy = beadRow + (isOddCol ? 0.5 : 0);
        ctx.fillStyle = `rgba(${buffer[off]},${buffer[off + 1]},${buffer[off + 2]},${a / 255})`;
        ctx.fillRect(
          this.cropBoxX + vx * cs,
          this.cropBoxY + vy * cs,
          Math.ceil(cs),
          Math.ceil(cs),
        );
      }
    }
  }

  private renderTriangularBuffer(
    ctx: CanvasRenderingContext2D,
    buffer: Uint8ClampedArray,
    bufW: number,
    bufH: number,
    triA: number,
    dNum: number,
    dDen: number,
    shift: number,
  ): void {
    const cs = this.cellSize;
    const usePeyote = this.gridService.usesPeyoteStagger(this.data.gridType, 0, dNum, dDen);
    let maxRowWidth = 0;
    for (let r = 0; r < bufH; r++) {
      maxRowWidth = Math.max(maxRowWidth, triangularRowWidth(r, triA, dNum, dDen, shift));
    }
    for (let by = 0; by < bufH; by++) {
      const rowWidth = triangularRowWidth(by, triA, dNum, dDen, shift);
      for (let bx = 0; bx < rowWidth; bx++) {
        const off = pixelOffset(bx, by, bufW, 'triangular', triA, undefined, dNum, dDen, shift);
        const a = buffer[off + 3];
        if (a === 0) continue;
        let vx: number, vy: number;
        if (usePeyote) {
          const centerOffset = maxRowWidth - rowWidth;
          vx = centerOffset + bx * 2;
          vy = by / 2;
        } else {
          const centerOffset = (maxRowWidth - rowWidth) / 2;
          vx = centerOffset + bx;
          vy = by;
        }
        ctx.fillStyle = `rgba(${buffer[off]},${buffer[off + 1]},${buffer[off + 2]},${a / 255})`;
        ctx.fillRect(
          this.cropBoxX + vx * cs,
          this.cropBoxY + vy * cs,
          Math.ceil(cs),
          Math.ceil(cs),
        );
      }
    }
  }

  // ── Core sampling logic ───────────────────────────────────────────

  /**
   * Render the image into a virtual-unit offscreen canvas and sample each grid
   * cell to produce the final layer buffer.
   */
  private produceLayerData(): Uint8ClampedArray {
    const {
      imageBitmap,
      gridType,
      bufferWidth,
      bufferHeight,
      bufferPixelCount,
      triangularA,
      triangularDNum,
      triangularDDen,
      triangularShift,
    } = this.data;

    const dNum = triangularDNum ?? 1;
    const dDen = triangularDDen ?? 1;
    const shift = triangularShift ?? 0;

    // Render the image into an OffscreenCanvas where 1px = 1 virtual grid unit.
    // The grid virtual-unit canvas has dimensions gridVisualW × gridVisualH.
    const vw = Math.max(1, Math.round(this.gridVisualW));
    const vh = Math.max(1, Math.round(this.gridVisualH));

    const offscreen = new OffscreenCanvas(vw, vh);
    const ctx = offscreen.getContext('2d')!;

    // For nearest-neighbour sampling, disable browser smoothing so the canvas
    // picks the closest source pixel.  For area-average sampling, leave
    // smoothing enabled so the browser blends source pixels when downscaling.
    ctx.imageSmoothingEnabled = this.samplingMode() === 'area';

    // Map the image from dialog-canvas coords to virtual-unit coords.
    const ox = this.imageOffsetX();
    const oy = this.imageOffsetY();
    const scale = this.imageScale();
    const imgX = (ox - this.cropBoxX) / this.cellSize;
    const imgY = (oy - this.cropBoxY) / this.cellSize;
    const imgW = (imageBitmap.width * scale) / this.cellSize;
    const imgH = (imageBitmap.height * scale) / this.cellSize;
    ctx.drawImage(imageBitmap, imgX, imgY, imgW, imgH);

    const imageData = ctx.getImageData(0, 0, vw, vh);
    const outputBuffer = new Uint8ClampedArray(bufferPixelCount * 4);

    const sampleNearest = (vx: number, vy: number): readonly [number, number, number, number] => {
      const px = Math.min(vw - 1, Math.max(0, Math.round(vx)));
      const py = Math.min(vh - 1, Math.max(0, Math.round(vy)));
      const base = (py * vw + px) * 4;
      return [
        imageData.data[base],
        imageData.data[base + 1],
        imageData.data[base + 2],
        imageData.data[base + 3],
      ] as const;
    };

    // Area-average sampling: the colour blending is done by the browser when
    // drawing the image onto the offscreen canvas (imageSmoothingEnabled=true
    // above).  We read the same centre pixel as nearest — the difference is in
    // the resampled source data, not in post-hoc neighbourhood averaging.
    const sampleArea = sampleNearest;

    const sample = this.samplingMode() === 'nearest' ? sampleNearest : sampleArea;

    const writePixel = (
      bx: number,
      by: number,
      vx: number,
      vy: number,
      bufW: number,
    ): void => {
      const [r, g, b, a] = sample(vx, vy);
      const off =
        gridType === 'triangular' && triangularA !== undefined
          ? pixelOffset(bx, by, bufW, gridType, triangularA, undefined, dNum, dDen, shift)
          : (by * bufW + bx) * 4;
      outputBuffer[off] = r;
      outputBuffer[off + 1] = g;
      outputBuffer[off + 2] = b;
      outputBuffer[off + 3] = a;
    };

    if (gridType === 'triangular' && triangularA !== undefined) {
      const usePeyote = this.gridService.usesPeyoteStagger(gridType, 0, dNum, dDen);
      let maxRowWidth = 0;
      for (let r = 0; r < bufferHeight; r++) {
        maxRowWidth = Math.max(maxRowWidth, triangularRowWidth(r, triangularA, dNum, dDen, shift));
      }
      for (let by = 0; by < bufferHeight; by++) {
        const rowWidth = triangularRowWidth(by, triangularA, dNum, dDen, shift);
        for (let bx = 0; bx < rowWidth; bx++) {
          let vx: number, vy: number;
          if (usePeyote) {
            // 2-stride: centerOffset + bx*2, half-height rows.
            const centerOffset = maxRowWidth - rowWidth;
            vx = centerOffset + bx * 2;
            vy = by / 2;
          } else {
            const centerOffset = (maxRowWidth - rowWidth) / 2;
            vx = centerOffset + bx;
            vy = by;
          }
          writePixel(bx, by, vx, vy, bufferWidth);
        }
      }
    } else if (gridType === 'peyote') {
      for (let by = 0; by < bufferHeight; by++) {
        for (let bx = 0; bx < bufferWidth; bx++) {
          const { col, beadRow } = this.gridService.bufferToVisual(bx, by);
          if (col >= bufferWidth * 2) continue; // unreachable for valid buffer coords
          const isOddCol = col % 2 === 1;
          const vx = col;
          const vy = beadRow + (isOddCol ? 0.5 : 0);
          writePixel(bx, by, vx, vy, bufferWidth);
        }
      }
    } else {
      // Square grid.
      for (let by = 0; by < bufferHeight; by++) {
        for (let bx = 0; bx < bufferWidth; bx++) {
          writePixel(bx, by, bx, by, bufferWidth);
        }
      }
    }

    return outputBuffer;
  }
}
