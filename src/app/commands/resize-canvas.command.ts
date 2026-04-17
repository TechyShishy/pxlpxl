import { Command, GridType, TriangularParams, computeBufferPixelCount } from '../models';
import { triangularRowWidth, triangularCumPixels, resolveTriangularD } from '../models';
import { CanvasStateService } from '../services/canvas-state.service';
import { LayerService } from '../services/layer.service';
import type { Layer } from '../models';

/**
 * Anchor position for mapping old content into a resized canvas.
 * Values 0, 1, 2 correspond to left/top, center, right/bottom respectively.
 */
export interface ResizeAnchor {
  /** Horizontal anchor: 0 = left, 1 = center, 2 = right */
  h: 0 | 1 | 2;
  /** Vertical anchor: 0 = top, 1 = center, 2 = bottom */
  v: 0 | 1 | 2;
}

export interface ResizeDimensions {
  width: number;
  height: number;
  gridType: GridType;
  triangularA?: number;
  triangularD?: number;
  triangularDNum?: number;
  triangularDDen?: number;
  triangularShift?: number;
}

/**
 * Compute the pixel offset into a (new) buffer for square/peyote grids.
 * Both grid types use simple row-major layout.
 */
function squareOffset(x: number, y: number, bufWidth: number): number {
  return (y * bufWidth + x) * 4;
}

/**
 * Compute the pixel offset into a triangular buffer using cumulative pixel count.
 */
function triangularOffset(
  x: number,
  y: number,
  a: number,
  dNum: number,
  dDen: number,
  shift: number,
): number {
  return (triangularCumPixels(y, a, dNum, dDen, shift) + x) * 4;
}

/**
 * Compute the horizontal offset of old content origin in the new row,
 * given old and new row widths and a horizontal anchor value.
 */
function hOffset(oldW: number, newW: number, anchor: number): number {
  switch (anchor) {
    case 0: return 0;
    case 2: return newW - oldW;
    default: return Math.floor((newW - oldW) / 2);
  }
}

/**
 * Compute the vertical offset of the first old row in the new canvas,
 * given old and new heights and a vertical anchor value.
 */
function vOffset(oldH: number, newH: number, anchor: number): number {
  switch (anchor) {
    case 0: return 0;
    case 2: return newH - oldH;
    default: return Math.floor((newH - oldH) / 2);
  }
}

/**
 * Resize a single layer's pixel buffer from `oldDim` to `newDim` using the
 * given anchor. Pixels outside the old bounds are transparent (RGBA 0,0,0,0).
 * Works for square, peyote, and triangular grid types.
 *
 * Triangular per-row H-anchor: each row's content is placed according to the
 * same horizontal anchor applied to that row's individual width change.
 */
export function computeResizedBuffer(
  oldBuffer: Uint8ClampedArray,
  oldDim: ResizeDimensions,
  newDim: ResizeDimensions,
  anchor: ResizeAnchor,
): Uint8ClampedArray {
  const newPixelCount = computeBufferPixelCount(
    newDim.width,
    newDim.height,
    newDim.gridType,
    newDim.triangularA,
    undefined,
    newDim.triangularDNum,
    newDim.triangularDDen,
    newDim.triangularShift,
  );
  const newBuffer = new Uint8ClampedArray(newPixelCount * 4);

  if (newDim.gridType === 'triangular') {
    const { dNum: newDNum, dDen: newDDen } = resolveTriangularD(
      undefined, newDim.triangularDNum, newDim.triangularDDen,
    );
    const { dNum: oldDNum, dDen: oldDDen } = resolveTriangularD(
      undefined, oldDim.triangularDNum, oldDim.triangularDDen,
    );
    const newA = newDim.triangularA ?? 1;
    const oldA = oldDim.triangularA ?? 1;
    const newShift = newDim.triangularShift ?? 0;
    const oldShift = oldDim.triangularShift ?? 0;

    const newRows = newDim.height;
    const oldRows = oldDim.height;
    const dy = vOffset(oldRows, newRows, anchor.v);

    for (let newRow = 0; newRow < newRows; newRow++) {
      const oldRow = newRow - dy;
      const newRowW = triangularRowWidth(newRow, newA, newDNum, newDDen, newShift);

      if (oldRow < 0 || oldRow >= oldRows) {
        // Entirely new row — already zeroed; skip.
        continue;
      }

      const oldRowW = triangularRowWidth(oldRow, oldA, oldDNum, oldDDen, oldShift);
      const dx = hOffset(oldRowW, newRowW, anchor.h);

      for (let newX = 0; newX < newRowW; newX++) {
        const oldX = newX - dx;
        if (oldX < 0 || oldX >= oldRowW) continue;

        const src = triangularOffset(oldX, oldRow, oldA, oldDNum, oldDDen, oldShift);
        const dst = triangularOffset(newX, newRow, newA, newDNum, newDDen, newShift);
        newBuffer[dst] = oldBuffer[src];
        newBuffer[dst + 1] = oldBuffer[src + 1];
        newBuffer[dst + 2] = oldBuffer[src + 2];
        newBuffer[dst + 3] = oldBuffer[src + 3];
      }
    }
  } else {
    // Square and peyote: both use flat row-major layout with bufferWidth columns.
    const newBufW = newDim.width; // for both square and peyote, bufferWidth === canvasWidth
    const newBufH = newDim.height;
    const oldBufW = oldDim.width;
    const oldBufH = oldDim.height;

    const dy = vOffset(oldBufH, newBufH, anchor.v);
    const dx = hOffset(oldBufW, newBufW, anchor.h);

    for (let newY = 0; newY < newBufH; newY++) {
      const oldY = newY - dy;
      if (oldY < 0 || oldY >= oldBufH) continue;

      for (let newX = 0; newX < newBufW; newX++) {
        const oldX = newX - dx;
        if (oldX < 0 || oldX >= oldBufW) continue;

        const src = squareOffset(oldX, oldY, oldBufW);
        const dst = squareOffset(newX, newY, newBufW);
        newBuffer[dst] = oldBuffer[src];
        newBuffer[dst + 1] = oldBuffer[src + 1];
        newBuffer[dst + 2] = oldBuffer[src + 2];
        newBuffer[dst + 3] = oldBuffer[src + 3];
      }
    }
  }

  return newBuffer;
}

/**
 * Undoable command that resizes all layers and updates canvas dimensions simultaneously.
 *
 * Snapshots (before and after) for all layers are computed eagerly at construction
 * time. execute() updates CanvasStateService then replaces every layer buffer.
 * undo() restores both canvas dimensions and all layer buffers.
 */
export class ResizeCanvasCommand implements Command {
  readonly description: string;

  private readonly oldLayerSnapshots: Uint8ClampedArray[];
  private readonly newLayerSnapshots: Uint8ClampedArray[];

  constructor(
    private readonly canvasState: CanvasStateService,
    private readonly layerService: LayerService,
    readonly oldDim: ResizeDimensions,
    readonly newDim: ResizeDimensions,
    anchorOrSnapshots:
      | ResizeAnchor
      | { preComputedOld: Uint8ClampedArray[]; preComputedNew: Uint8ClampedArray[]; description: string },
  ) {
    if ('h' in anchorOrSnapshots) {
      const anchor = anchorOrSnapshots;
      this.description = `Resize canvas to ${newDim.width}\u00d7${newDim.height}`;
      const layers: readonly Layer[] = this.layerService.layers();
      this.oldLayerSnapshots = layers.map((l) => new Uint8ClampedArray(l.data));
      this.newLayerSnapshots = layers.map((l) =>
        computeResizedBuffer(l.data, oldDim, newDim, anchor),
      );
    } else {
      this.description = anchorOrSnapshots.description;
      this.oldLayerSnapshots = anchorOrSnapshots.preComputedOld;
      this.newLayerSnapshots = anchorOrSnapshots.preComputedNew;
    }
  }

  execute(): void {
    this._applyDimensions(this.newDim);
    this._applySnapshots(this.newLayerSnapshots);
  }

  undo(): void {
    this._applyDimensions(this.oldDim);
    this._applySnapshots(this.oldLayerSnapshots);
  }

  private _applyDimensions(dim: ResizeDimensions): void {
    this.canvasState.setGridType(dim.gridType);
    this.canvasState.setCanvasSize(dim.width, dim.height);
    if (dim.gridType === 'triangular') {
      this.canvasState.setTriangularParams(
        dim.triangularA ?? 1,
        dim.triangularD ?? 1,
        dim.triangularDNum,
        dim.triangularDDen,
        dim.triangularShift,
      );
    }
  }

  private _applySnapshots(snapshots: Uint8ClampedArray[]): void {
    for (let i = 0; i < snapshots.length; i++) {
      this.layerService.setLayerData(i, snapshots[i]);
    }
  }

  // ── Serialization accessors ──────────────────────────────────────────

  /** Pre-resize layer snapshots (for serialization). */
  getOldLayerSnapshots(): readonly Uint8ClampedArray[] {
    return this.oldLayerSnapshots;
  }

  /** Post-resize layer snapshots (for serialization). */
  getNewLayerSnapshots(): readonly Uint8ClampedArray[] {
    return this.newLayerSnapshots;
  }

  /**
   * Reconstruct a ResizeCanvasCommand from serialized snapshot arrays.
   * The command is in "already executed" (post-resize) state; the caller
   * must NOT call execute() again after deserialization.
   */
  static fromSerialized(
    canvasState: CanvasStateService,
    layerService: LayerService,
    oldDim: ResizeDimensions,
    newDim: ResizeDimensions,
    oldLayerSnapshots: Uint8ClampedArray[],
    newLayerSnapshots: Uint8ClampedArray[],
    description: string,
  ): ResizeCanvasCommand {
    return new ResizeCanvasCommand(canvasState, layerService, oldDim, newDim, {
      preComputedOld: oldLayerSnapshots,
      preComputedNew: newLayerSnapshots,
      description,
    });
  }
}
