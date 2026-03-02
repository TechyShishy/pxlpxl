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
  /** Whether to show radial shadow clones for triangular grids. */
  private readonly _showClones = signal<boolean>(false);

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
  readonly showClones = this._showClones.asReadonly();

  /**
   * Auto-detect the number of polygon sides from the triangular growth rate.
   * Formula: round(3 * dDen / dNum). Only meaningful when gridType is 'triangular'.
   */
  readonly sideCount = computed(() => {
    if (this._gridType() !== 'triangular') return 0;
    const dNum = this._triangularDNum();
    const dDen = this._triangularDDen();
    if (dNum === 0) return 0;
    return Math.round(3 * dDen / dNum);
  });

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

  toggleClones(): void {
    this._showClones.update((v) => !v);
  }

  /**
   * Pan the viewport so the full shadow-clone polygon is centered,
   * keeping the current zoom level unchanged.
   */
  centerOnClones(viewportWidth: number, viewportHeight: number): void {
    const gridType = this._gridType();
    if (gridType !== 'triangular') return;
    const sides = this.sideCount();
    if (sides < 3) return;

    const t = this._transform();
    const scale = t.scale;
    const a = this._triangularA();
    const d = this._triangularD();
    const dNum = this._triangularDNum();
    const dDen = this._triangularDDen();
    const shift = this._triangularShift();
    const totalRows = this.bufferHeight();
    const maxWidth = this.gridService.getAnyTriangularMaxWidth(
      totalRows, gridType, a, d, dNum, dDen, shift,
    );
    const usesPeyote = this.gridService.usesPeyoteStagger(gridType, d, dNum, dDen);

    // Pivot — must match renderTriangularClones / getClonePivot
    const rowSpacing = usesPeyote ? scale / 2 : scale;
    const pivotY = -(a * dDen / dNum) * rowSpacing;
    const pivotX = usesPeyote
      ? (maxWidth - 0.5) * scale
      : (maxWidth / 2) * scale;

    const wedgeHeight = usesPeyote
      ? (totalRows - 1) * (scale / 2) + scale
      : totalRows * scale;

    // x-scale correction — must match renderTriangularClones
    const halfWidth = usesPeyote
      ? maxWidth * scale
      : ((maxWidth + 1) / 2) * scale;
    const dy = (totalRows - 0.5) * rowSpacing;
    const targetAngle = Math.PI / sides;
    const xScale = (Math.tan(targetAngle) * dy) / halfWidth;

    // Centering offset applied during rendering
    const centeringOffsetY = wedgeHeight / 2 - pivotY;

    // Compute the bounding box of the full polygon.
    // Each wedge corner (before x-scale) is at
    //   top-left  (0, 0)
    //   top-right  (wedgeRawW, 0)
    //   bot-left  (0, wedgeHeight)
    //   bot-right (wedgeRawW, wedgeHeight)
    // After x-scale around pivotX and rotation around pivot,
    // we track every corner through these transforms.
    const wedgeRawW = usesPeyote
      ? (maxWidth * 2 - 1) * scale   // peyote visual width
      : maxWidth * scale;

    const corners = [
      { x: 0, y: 0 },
      { x: wedgeRawW, y: 0 },
      { x: 0, y: wedgeHeight },
      { x: wedgeRawW, y: wedgeHeight },
    ];

    const angleStep = (2 * Math.PI) / sides;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < sides; i++) {
      const angle = i * angleStep;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      for (const c of corners) {
        // Apply x-scale correction around pivotX
        const sx = pivotX + (c.x - pivotX) * xScale;
        const sy = c.y;
        // Apply centering offset
        const cy = sy + centeringOffsetY;
        // Rotate around pivot
        const dx = sx - pivotX;
        const ddy = cy - pivotY;
        const rx = pivotX + dx * cos - ddy * sin;
        const ry = pivotY + dx * sin + ddy * cos;
        minX = Math.min(minX, rx);
        maxX = Math.max(maxX, rx);
        minY = Math.min(minY, ry);
        maxY = Math.max(maxY, ry);
      }
    }

    const polyWidth = maxX - minX;
    const polyHeight = maxY - minY;
    const polyCenterX = minX + polyWidth / 2;
    const polyCenterY = minY + polyHeight / 2;

    // Set offsets so the polygon center lands at the viewport center
    this.setPan(
      viewportWidth / 2 - polyCenterX,
      viewportHeight / 2 - polyCenterY,
    );
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

    const gridType = this._gridType();
    const showClones = this._showClones();
    const sides = this.sideCount();

    // When clones are active for triangular grids, try inverse rotation
    // for each wedge to find which one the user clicked on.
    if (gridType === 'triangular' && showClones && sides >= 3) {
      const a = this._triangularA();
      const d = this._triangularD();
      const dNum = this._triangularDNum();
      const dDen = this._triangularDDen();
      const shift = this._triangularShift();
      const totalRows = this.bufferHeight();
      const maxWidth = this.gridService.getAnyTriangularMaxWidth(
        totalRows, gridType, a, d, dNum, dDen, shift,
      );
      const usesPeyote = this.gridService.usesPeyoteStagger(gridType, d, dNum, dDen);
      // Pivot at the theoretical apex where the wedge converges to zero
      // width: r_apex = -(a·dDen/dNum), in screen space × rowSpacing.
      const rowSpacing = usesPeyote ? t.scale / 2 : t.scale;
      const pivotY = -(a * dDen / dNum) * rowSpacing;
      const pivot = usesPeyote
        ? { x: (maxWidth - 0.5) * t.scale, y: pivotY }
        : { x: (maxWidth / 2) * t.scale, y: pivotY };

      // Match the centering offset applied in renderTriangularClones.
      const wedgeHeight = usesPeyote
        ? (totalRows - 1) * (t.scale / 2) + t.scale
        : totalRows * t.scale;
      const centeringOffsetY = wedgeHeight / 2 - pivot.y;

      // x-scale correction factor (must match renderTriangularClones)
      // dy = (R-0.5) × rowSpacing = center of last bead from y=0.
      const halfWidth = usesPeyote
        ? maxWidth * t.scale
        : ((maxWidth + 1) / 2) * t.scale;
      const dy = (totalRows - 0.5) * rowSpacing;
      const targetAngle = Math.PI / sides;
      const xScale = (Math.tan(targetAngle) * dy) / halfWidth;

      const angleStep = (2 * Math.PI) / sides;
      // Try wedge 0 (original) first, then clones
      for (let i = 0; i < sides; i++) {
        const angle = -i * angleStep; // inverse rotation
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        // Subtract the centering offset, then undo x-scale, then inverse rotation
        const dx = localX - pivot.x;
        const dy = localY - centeringOffsetY - pivot.y;
        const rotX = dx * cos - dy * sin;
        const rotY = dx * sin + dy * cos;
        // Undo x-scale correction to get original bead coordinates
        const unscaledX = rotX / xScale + pivot.x;
        const unscaledY = rotY + pivot.y;

        const hit = this.gridService.screenToPixel(
          unscaledX, unscaledY, t.scale,
          this.bufferWidth(), this.bufferHeight(),
          gridType, this._canvasWidth(),
          a, d, dNum, dDen, shift,
        );
        if (hit) return hit;
      }
      return null;
    }

    return this.gridService.screenToPixel(
      localX,
      localY,
      t.scale,
      this.bufferWidth(),
      this.bufferHeight(),
      gridType,
      this._canvasWidth(),
      this._triangularA(),
      this._triangularD(),
      this._triangularDNum(),
      this._triangularDDen(),
      this._triangularShift(),
    );
  }
}
