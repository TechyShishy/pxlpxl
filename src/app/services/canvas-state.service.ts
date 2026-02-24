import { Injectable, signal, computed, inject } from '@angular/core';
import { ViewTransform, GridType, computeBufferDimensions, computeBufferPixelCount } from '../models';
import { GridService } from './grid.service';

@Injectable({ providedIn: 'root' })
export class CanvasStateService {
  private readonly gridService = inject(GridService);

  /** Visual canvas width (number of visual columns). */
  readonly canvasWidth = signal<number>(32);
  /** Visual canvas height (for square: rows; for peyote: visible bead rows). */
  readonly canvasHeight = signal<number>(32);
  readonly showGrid = signal<boolean>(true);
  readonly showRulers = signal<boolean>(false);
  readonly gridType = signal<GridType>('square');

  /** First-row width for triangular grids. */
  readonly triangularA = signal<number>(1);
  /** Per-row growth for triangular grids. */
  readonly triangularD = signal<number>(1);
  /** Fractional growth numerator for triangular grids. */
  readonly triangularDNum = signal<number>(1);
  /** Fractional growth denominator for triangular grids. */
  readonly triangularDDen = signal<number>(1);

  /** Buffer width — for peyote: ceil(visualColumns / 2); for square: same as canvasWidth. */
  readonly bufferWidth = computed(() => {
    const { bufferWidth } = computeBufferDimensions(
      this.canvasWidth(),
      this.canvasHeight(),
      this.gridType(),
      this.triangularA(),
      this.triangularD(),
      this.triangularDNum(),
      this.triangularDDen(),
    );
    return bufferWidth;
  });

  /** Buffer height — for peyote: same as canvasHeight (visual rows); for square: same as canvasHeight. */
  readonly bufferHeight = computed(() => {
    const { bufferHeight } = computeBufferDimensions(
      this.canvasWidth(),
      this.canvasHeight(),
      this.gridType(),
      this.triangularA(),
      this.triangularD(),
      this.triangularDNum(),
      this.triangularDDen(),
    );
    return bufferHeight;
  });

  /** Total number of pixels for buffer allocation. */
  readonly bufferPixelCount = computed(() =>
    computeBufferPixelCount(
      this.canvasWidth(),
      this.canvasHeight(),
      this.gridType(),
      this.triangularA(),
      this.triangularD(),
      this.triangularDNum(),
      this.triangularDDen(),
    ),
  );

  readonly transform = signal<ViewTransform>({
    scale: 10,
    offsetX: 0,
    offsetY: 0,
  });

  readonly zoomPercent = computed(() => Math.round(this.transform().scale * 100));

  setCanvasSize(width: number, height: number): void {
    this.canvasWidth.set(width);
    this.canvasHeight.set(height);
  }

  setGridType(type: GridType): void {
    this.gridType.set(type);
  }

  setTriangularParams(a: number, d: number, dNum?: number, dDen?: number): void {
    this.triangularA.set(a);
    this.triangularD.set(d);
    if (dNum !== undefined && dDen !== undefined) {
      this.triangularDNum.set(dNum);
      this.triangularDDen.set(dDen);
    } else {
      // Legacy: integer d means dNum=d, dDen=1 (fast growth)
      this.triangularDNum.set(d);
      this.triangularDDen.set(1);
    }
  }

  setZoom(scale: number): void {
    const clamped = Math.max(0.5, Math.min(64, scale));
    this.transform.update((t) => ({ ...t, scale: clamped }));
  }

  zoomIn(): void {
    this.setZoom(this.transform().scale * 1.25);
  }

  zoomOut(): void {
    this.setZoom(this.transform().scale / 1.25);
  }

  resetZoom(): void {
    this.transform.set({ scale: 10, offsetX: 0, offsetY: 0 });
  }

  pan(deltaX: number, deltaY: number): void {
    this.transform.update((t) => ({
      ...t,
      offsetX: t.offsetX + deltaX,
      offsetY: t.offsetY + deltaY,
    }));
  }

  setPan(offsetX: number, offsetY: number): void {
    this.transform.update((t) => ({ ...t, offsetX, offsetY }));
  }

  toggleGrid(): void {
    this.showGrid.update((v) => !v);
  }

  toggleRulers(): void {
    this.showRulers.update((v) => !v);
  }

  /** Convert screen coordinates to buffer coordinates on the canvas */
  screenToPixel(
    screenX: number,
    screenY: number,
    canvasRect: DOMRect,
  ): { x: number; y: number } | null {
    const t = this.transform();
    const localX = screenX - canvasRect.left - t.offsetX;
    const localY = screenY - canvasRect.top - t.offsetY;

    return this.gridService.screenToPixel(
      localX,
      localY,
      t.scale,
      this.bufferWidth(),
      this.bufferHeight(),
      this.gridType(),
      this.canvasWidth(),
      this.triangularA(),
      this.triangularD(),
      this.triangularDNum(),
      this.triangularDDen(),
    );
  }
}
