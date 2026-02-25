import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  afterNextRender,
  ElementRef,
  viewChild,
} from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { GridService } from '../../services/grid.service';
import { GridType, triangularRowWidth, pixelOffset } from '../../models';

/** Data passed into the dialog from ImportService. */
export interface ImportPngDialogData {
  imageBitmap: ImageBitmap;
  /** Visual canvas width (number of visual columns). */
  canvasWidth: number;
  /** Visual canvas height (visible bead rows for peyote, rows for others). */
  canvasHeight: number;
  gridType: GridType;
  bufferWidth: number;
  bufferHeight: number;
  bufferPixelCount: number;
  triangularA?: number;
  triangularDNum?: number;
  triangularDDen?: number;
}

export type SamplingMode = 'nearest' | 'area';

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
  imports: [MatDialogModule, MatButtonModule, MatButtonToggleModule],
  templateUrl: './import-png-dialog.component.html',
  styleUrl: './import-png-dialog.component.scss',
})
export class ImportPngDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<ImportPngDialogComponent>);
  private readonly data = inject<ImportPngDialogData>(MAT_DIALOG_DATA);
  private readonly gridService = inject(GridService);

  private readonly previewCanvas =
    viewChild.required<ElementRef<HTMLCanvasElement>>('preview');

  readonly samplingMode = signal<SamplingMode>('nearest');

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

  private isDragging = false;
  private dragLastX = 0;
  private dragLastY = 0;
  private animFrameId = 0;

  constructor() {
    afterNextRender(() => {
      this.initLayout();
      this.scheduleDraw();
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
      bufferHeight,
    } = this.data;

    const dNum = triangularDNum ?? 1;
    const dDen = triangularDDen ?? 1;

    // Compute the visual bounding box of the grid in abstract "grid units".
    if (gridType === 'triangular' && triangularA !== undefined) {
      const usePeyote = this.gridService.usesPeyoteStagger(gridType, 0, dNum, dDen);
      let maxRowWidth = 0;
      for (let r = 0; r < bufferHeight; r++) {
        maxRowWidth = Math.max(maxRowWidth, triangularRowWidth(r, triangularA, dNum, dDen));
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
      // Each buffer row alternates between even- and odd-column beads.
      // beadsPerColumn = bufferHeight / 2; odd columns add a half-bead visual offset.
      this.gridVisualW = canvasWidth;
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

    ctx.clearRect(0, 0, CONTAINER, CONTAINER);

    // Draw the source image at current pan/zoom.
    const { imageBitmap } = this.data;
    const scale = this.imageScale();
    const ox = this.imageOffsetX();
    const oy = this.imageOffsetY();
    ctx.drawImage(imageBitmap, ox, oy, imageBitmap.width * scale, imageBitmap.height * scale);

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

  // ── Pointer events (pan) ──────────────────────────────────────────

  onPointerDown(e: PointerEvent): void {
    this.isDragging = true;
    this.dragLastX = e.clientX;
    this.dragLastY = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  onPointerMove(e: PointerEvent): void {
    if (!this.isDragging) return;
    const dx = e.clientX - this.dragLastX;
    const dy = e.clientY - this.dragLastY;
    this.dragLastX = e.clientX;
    this.dragLastY = e.clientY;
    this.imageOffsetX.update((v) => v + dx);
    this.imageOffsetY.update((v) => v + dy);
    this.scheduleDraw();
  }

  onPointerUp(): void {
    this.isDragging = false;
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
    this.scheduleDraw();
  }

  // ── Dialog actions ────────────────────────────────────────────────

  onImport(): void {
    this.dialogRef.close(this.produceLayerData());
  }

  onCancel(): void {
    this.dialogRef.close(undefined);
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
    } = this.data;

    const dNum = triangularDNum ?? 1;
    const dDen = triangularDDen ?? 1;

    // Render the image into an OffscreenCanvas where 1px = 1 virtual grid unit.
    // The grid virtual-unit canvas has dimensions gridVisualW × gridVisualH.
    const vw = Math.max(1, Math.round(this.gridVisualW));
    const vh = Math.max(1, Math.round(this.gridVisualH));

    const offscreen = new OffscreenCanvas(vw, vh);
    const ctx = offscreen.getContext('2d')!;

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

    const sampleArea = (vx: number, vy: number): readonly [number, number, number, number] => {
      // Sample a neighbourhood sized to roughly 1 grid cell in virtual-unit space.
      const cellPx = this.cellSize / scale;
      const radius = Math.max(0.5, cellPx / 2);
      const x0 = Math.max(0, Math.round(vx - radius));
      const x1 = Math.min(vw - 1, Math.round(vx + radius));
      const y0 = Math.max(0, Math.round(vy - radius));
      const y1 = Math.min(vh - 1, Math.round(vy + radius));
      let r = 0, g = 0, b = 0, a = 0, count = 0;
      for (let sy = y0; sy <= y1; sy++) {
        for (let sx = x0; sx <= x1; sx++) {
          const base = (sy * vw + sx) * 4;
          r += imageData.data[base];
          g += imageData.data[base + 1];
          b += imageData.data[base + 2];
          a += imageData.data[base + 3];
          count++;
        }
      }
      if (count === 0) return [0, 0, 0, 0] as const;
      return [
        Math.round(r / count),
        Math.round(g / count),
        Math.round(b / count),
        Math.round(a / count),
      ] as const;
    };

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
          ? pixelOffset(bx, by, bufW, gridType, triangularA, undefined, dNum, dDen)
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
        maxRowWidth = Math.max(maxRowWidth, triangularRowWidth(r, triangularA, dNum, dDen));
      }
      for (let by = 0; by < bufferHeight; by++) {
        const rowWidth = triangularRowWidth(by, triangularA, dNum, dDen);
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
          if (col >= this.data.canvasWidth) continue;
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
