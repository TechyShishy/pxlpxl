import { Injectable, signal, computed, inject } from '@angular/core';
import { ViewTransform, GridType, computeBufferDimensions, computeBufferPixelCount } from '../models';
import { GridService } from './grid.service';

@Injectable({ providedIn: 'root' })
export class CanvasStateService {
  private readonly gridService = inject(GridService);

  /** Visual canvas width (number of visual columns). */
  private readonly _canvasWidth = signal<number>(32);
  /** Visual canvas height (for square: rows; for peyote: visible bead rows). */
  private readonly _canvasHeight = signal<number>(32);
  private readonly _showGrid = signal<boolean>(true);
  private readonly _showRulers = signal<boolean>(false);
  private readonly _gridType = signal<GridType>('square');

  /** First-row width for triangular grids. */
  private readonly _triangularA = signal<number>(1);
  /** Per-row growth for triangular grids. */
  private readonly _triangularD = signal<number>(1);
  /** Fractional growth numerator for triangular grids. */
  private readonly _triangularDNum = signal<number>(1);
  /** Fractional growth denominator for triangular grids. */
  private readonly _triangularDDen = signal<number>(1);
  /** Phase shift (0..dDen-1) for triangular grids. */
  private readonly _triangularShift = signal<number>(0);

  readonly canvasWidth = this._canvasWidth.asReadonly();
  readonly canvasHeight = this._canvasHeight.asReadonly();
  readonly showGrid = this._showGrid.asReadonly();
  readonly showRulers = this._showRulers.asReadonly();
  readonly gridType = this._gridType.asReadonly();
  readonly triangularA = this._triangularA.asReadonly();
  readonly triangularD = this._triangularD.asReadonly();
  readonly triangularDNum = this._triangularDNum.asReadonly();
  readonly triangularDDen = this._triangularDDen.asReadonly();
  readonly triangularShift = this._triangularShift.asReadonly();

  /** Buffer width — for peyote: ceil(visualColumns / 2); for square: same as canvasWidth. */
  readonly bufferWidth = computed(() => {
    const { bufferWidth } = computeBufferDimensions(
      this._canvasWidth(),
      this._canvasHeight(),
      this._gridType(),
      this._triangularA(),
      this._triangularD(),
      this._triangularDNum(),
      this._triangularDDen(),
      this._triangularShift(),
    );
    return bufferWidth;
  });

  /** Buffer height — for peyote: same as canvasHeight (visual rows); for square: same as canvasHeight. */
  readonly bufferHeight = computed(() => {
    const { bufferHeight } = computeBufferDimensions(
      this._canvasWidth(),
      this._canvasHeight(),
      this._gridType(),
      this._triangularA(),
      this._triangularD(),
      this._triangularDNum(),
      this._triangularDDen(),
      this._triangularShift(),
    );
    return bufferHeight;
  });

  /** Total number of pixels for buffer allocation. */
  readonly bufferPixelCount = computed(() =>
    computeBufferPixelCount(
      this._canvasWidth(),
      this._canvasHeight(),
      this._gridType(),
      this._triangularA(),
      this._triangularD(),
      this._triangularDNum(),
      this._triangularDDen(),
      this._triangularShift(),
    ),
  );

  private readonly _transform = signal<ViewTransform>({
    scale: 10,
    offsetX: 0,
    offsetY: 0,
  });

  readonly transform = this._transform.asReadonly();

  readonly zoomPercent = computed(() => Math.round(this._transform().scale * 100));

  setCanvasSize(width: number, height: number): void {
    this._canvasWidth.set(width);
    this._canvasHeight.set(height);
  }

  setGridType(type: GridType): void {
    this._gridType.set(type);
  }

  setTriangularParams(a: number, d: number, dNum?: number, dDen?: number, shift?: number): void {
    this._triangularA.set(a);
    this._triangularD.set(d);
    if (dNum !== undefined && dDen !== undefined) {
      this._triangularDNum.set(dNum);
      this._triangularDDen.set(dDen);
    } else {
      // Legacy: integer d means dNum=d, dDen=1 (fast growth)
      this._triangularDNum.set(d);
      this._triangularDDen.set(1);
    }
    this._triangularShift.set(shift ?? 0);
  }

  setZoom(scale: number): void {
    const clamped = Math.max(0.5, Math.min(64, scale));
    this._transform.update((t) => ({ ...t, scale: clamped }));
  }

  zoomIn(): void {
    this.setZoom(this._transform().scale * 1.25);
  }

  zoomOut(): void {
    this.setZoom(this._transform().scale / 1.25);
  }

  resetZoom(): void {
    this._transform.set({ scale: 10, offsetX: 0, offsetY: 0 });
  }

  pan(deltaX: number, deltaY: number): void {
    this._transform.update((t) => ({
      ...t,
      offsetX: t.offsetX + deltaX,
      offsetY: t.offsetY + deltaY,
    }));
  }

  setPan(offsetX: number, offsetY: number): void {
    this._transform.update((t) => ({ ...t, offsetX, offsetY }));
  }

  toggleGrid(): void {
    this._showGrid.update((v) => !v);
  }

  toggleRulers(): void {
    this._showRulers.update((v) => !v);
  }

  /** Convert screen coordinates to buffer coordinates on the canvas */
  screenToPixel(
    screenX: number,
    screenY: number,
    canvasRect: DOMRect,
  ): { x: number; y: number } | null {
    const t = this._transform();
    const localX = screenX - canvasRect.left - t.offsetX;
    const localY = screenY - canvasRect.top - t.offsetY;

    return this.gridService.screenToPixel(
      localX,
      localY,
      t.scale,
      this.bufferWidth(),
      this.bufferHeight(),
      this._gridType(),
      this._canvasWidth(),
      this._triangularA(),
      this._triangularD(),
      this._triangularDNum(),
      this._triangularDDen(),
      this._triangularShift(),
    );
  }
}
