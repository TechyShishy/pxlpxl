import { Injectable, signal, computed, inject } from '@angular/core';
import { BeadSize, Color, ViewTransform, GridType, computeBufferDimensions, computeBufferPixelCount } from '../models';
import { GridService } from './grid.service';
import { clonePivot } from './clone-geometry';
import { SettingsService } from './settings.service';

/**
 * Represents one pixel that will be reassigned during an absorb operation.
 * Coordinates are in buffer-space (the same space used by pixelOffset/pixelToScreen).
 */
export interface PixelAbsorptionAssignment {
  layerIndex: number;
  byteOffset: number;
  /** Buffer-space x coordinate (used by RenderService preview overlay). */
  bufX: number;
  /** Buffer-space y coordinate. */
  bufY: number;
  /** Index into AbsorptionState.candidates for this pixel's current target. */
  candidateIndex: number;
}

/**
 * Transient state while the user is previewing an absorb operation.
 * Cleared on commit or cancel.
 */
export interface AbsorptionState {
  paletteIndex: number;
  sourceColor: Color;
  /**
   * Non-orphan palette colors sorted by colorDistance from sourceColor ascending.
   * candidates[0] is the Voronoi default for every pixel.
   */
  candidates: Color[];
  assignments: PixelAbsorptionAssignment[];
}

@Injectable({ providedIn: 'root' })
export class CanvasStateService {
  private readonly gridService = inject(GridService);
  private readonly settingsService = inject(SettingsService);

  /** Visual canvas width (number of visual columns). */
  private readonly _canvasWidth = signal<number>(32);
  /** Visual canvas height (for square: rows; for peyote: visible bead rows). */
  private readonly _canvasHeight = signal<number>(32);
  private readonly _showGrid = signal<boolean>(this.settingsService.settings().defaultShowGrid);
  private readonly _showRulers = signal<boolean>(this.settingsService.settings().defaultShowRulers);
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

  /** Buffer width — for peyote: equals canvasWidth (one buffer column per peyote column-pair); for square: same as canvasWidth. */
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

  /**
   * Screen-space bead dimensions at the current zoom level.
   * For triangular grids the width is narrower than the height
   * (baking in the old xScale correction), so wedge beads already
   * have the correct width for radial tiling.
   * For square/peyote grids width === height === zoom scale.
   */
  readonly beadSize = computed<BeadSize>(() => {
    const scale = this._transform().scale;
    const gridType = this._gridType();
    if (gridType !== 'triangular') {
      return { width: scale, height: scale };
    }
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
    const halfWidth = usesPeyote
      ? maxWidth * scale
      : ((maxWidth + 1) / 2) * scale;
    const rowSpacing = usesPeyote ? scale / 2 : scale;
    const dy = (totalRows - 0.5) * rowSpacing;
    const sides = this.sideCount();
    if (sides < 3) {
      return { width: scale, height: scale };
    }
    const targetAngle = Math.PI / sides;
    const xScale = (Math.tan(targetAngle) * dy) / halfWidth;
    return { width: scale * xScale, height: scale };
  });

  private readonly _transform = signal<ViewTransform>({
    scale: 10,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
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
    this._transform.set({ scale: 10, offsetX: 0, offsetY: 0, rotation: 0 });
  }

  rotateCW(): void {
    this._transform.update((t) => ({
      ...t,
      rotation: ((t.rotation + 90) % 360) as 0 | 90 | 180 | 270,
    }));
  }

  rotateCCW(): void {
    this._transform.update((t) => ({
      ...t,
      rotation: ((t.rotation + 270) % 360) as 0 | 90 | 180 | 270,
    }));
  }

  rotate180(): void {
    this._transform.update((t) => ({
      ...t,
      rotation: ((t.rotation + 180) % 360) as 0 | 90 | 180 | 270,
    }));
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
    const bs = this.beadSize();

    const { x: pivotX, y: pivotY } = clonePivot(bs, maxWidth, usesPeyote, a, dNum, dDen);

    const wedgeHeight = usesPeyote
      ? (totalRows - 1) * (bs.height / 2) + bs.height
      : totalRows * bs.height;

    // Centering offset applied during rendering
    const centeringOffsetY = wedgeHeight / 2 - pivotY;

    // Compute the bounding box of the full polygon.
    // Wedge corners are already in correct screen space (no separate xScale).
    const wedgeRawW = usesPeyote
      ? (maxWidth * 2 - 1) * bs.width   // peyote visual width
      : maxWidth * bs.width;

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
        // No xScale correction — beadSize.width already has it baked in
        const sx = c.x;
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

    // Element-local pointer position.
    const elX = screenX - canvasRect.left;
    const elY = screenY - canvasRect.top;

    // Inverse the viewport rotation (drawn around the element center)
    // so subsequent pixel math sees drawing-space coordinates.
    const rotation = t.rotation;
    let preOffsetX: number;
    let preOffsetY: number;
    if (rotation === 0) {
      preOffsetX = elX;
      preOffsetY = elY;
    } else {
      const cx = canvasRect.width / 2;
      const cy = canvasRect.height / 2;
      const angle = -(rotation * Math.PI) / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const dx = elX - cx;
      const dy = elY - cy;
      preOffsetX = cx + dx * cos - dy * sin;
      preOffsetY = cy + dx * sin + dy * cos;
    }

    const localX = preOffsetX - t.offsetX;
    const localY = preOffsetY - t.offsetY;

    const gridType = this._gridType();
    const showClones = this._showClones();
    const sides = this.sideCount();
    const bs = this.beadSize();

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
      // Pivot at the theoretical apex where the wedge converges to zero width.
      const pivot = clonePivot(bs, maxWidth, usesPeyote, a, dNum, dDen);

      // Match the centering offset applied in renderTriangularClones.
      const wedgeHeight = usesPeyote
        ? (totalRows - 1) * (bs.height / 2) + bs.height
        : totalRows * bs.height;
      const centeringOffsetY = wedgeHeight / 2 - pivot.y;

      const angleStep = (2 * Math.PI) / sides;
      // Try wedge 0 (original) first, then clones
      for (let i = 0; i < sides; i++) {
        const angle = -i * angleStep; // inverse rotation
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        // Subtract the centering offset, then inverse rotation
        const dx = localX - pivot.x;
        const dy = localY - centeringOffsetY - pivot.y;
        const rotX = dx * cos - dy * sin;
        const rotY = dx * sin + dy * cos;
        // No xScale to undo — beadSize.width already has correct width
        const hitX = rotX + pivot.x;
        const hitY = rotY + pivot.y;

        const hit = this.gridService.screenToPixel(
          hitX, hitY, bs,
          this.bufferWidth(), this.bufferHeight(),
          gridType,
          a, d, dNum, dDen, shift,
        );
        if (hit) return hit;
      }
      return null;
    }

    return this.gridService.screenToPixel(
      localX,
      localY,
      bs,
      this.bufferWidth(),
      this.bufferHeight(),
      gridType,
      this._triangularA(),
      this._triangularD(),
      this._triangularDNum(),
      this._triangularDDen(),
      this._triangularShift(),
    );
  }

  // ── Absorption mode ────────────────────────────────────────────────

  private readonly _absorptionState = signal<AbsorptionState | null>(null);
  readonly absorptionState = this._absorptionState.asReadonly();

  enterAbsorptionMode(state: AbsorptionState): void {
    this._absorptionState.set(state);
  }

  exitAbsorptionMode(): void {
    this._absorptionState.set(null);
  }

  /**
   * Cycle the target assignment for every pixel with the given byteOffset
   * (all layers at the same logical position) to the next candidate.
   */
  cycleAssignment(byteOffset: number): void {
    this._absorptionState.update((state) => {
      if (!state) return state;
      if (!state.assignments.some((a) => a.byteOffset === byteOffset)) return state;
      const assignments = state.assignments.map((a) =>
        a.byteOffset === byteOffset
          ? { ...a, candidateIndex: (a.candidateIndex + 1) % state.candidates.length }
          : a,
      );
      return { ...state, assignments };
    });
  }
}
