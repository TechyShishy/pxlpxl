import { Injectable, inject } from '@angular/core';
import { LayerService } from './layer.service';
import { CanvasStateService } from './canvas-state.service';
import { GridService } from './grid.service';
import { Color, GridType, PixelCoord, pixelOffset, triangularRowWidth } from '../models';

@Injectable({ providedIn: 'root' })
export class RenderService {
  private readonly layerService = inject(LayerService);
  private readonly canvasState = inject(CanvasStateService);
  private readonly gridService = inject(GridService);

  /**
   * Composites all visible layers onto a destination canvas context.
   * Applies zoom/pan transform and optionally draws the pixel grid.
   *
   * @param previewPixels Optional pixels to render as a preview overlay (e.g. line/rect preview).
   * @param previewColor  Color to use for the preview pixels.
   */
  render(
    ctx: CanvasRenderingContext2D,
    viewportWidth: number,
    viewportHeight: number,
    previewPixels?: PixelCoord[],
    previewColor?: Color,
  ): void {
    const visualWidth = this.canvasState.canvasWidth();
    const visualHeight = this.canvasState.canvasHeight();
    const bufWidth = this.canvasState.bufferWidth();
    const bufHeight = this.canvasState.bufferHeight();
    const transform = this.canvasState.transform();
    const layers = this.layerService.layers();
    const gridType = this.canvasState.gridType();

    // Clear the viewport
    ctx.clearRect(0, 0, viewportWidth, viewportHeight);

    // Composite visible layers
    const showClones = this.canvasState.showClones();
    const sideCount = this.canvasState.sideCount();

    // Draw checkerboard background (transparency indicator).
    // Skip standalone checkerboard when clone mode is active — it will be
    // rendered per-wedge inside renderTriangularClones instead.
    const clonesActive = this.gridService.isAnyTriangular(gridType) && showClones && sideCount >= 3;
    if (!clonesActive) {
      this.drawCheckerboard(ctx, visualWidth, visualHeight, bufWidth, bufHeight, transform, gridType);
    }
    if (this.gridService.isPeyote(gridType)) {
      this.renderPeyoteLayers(ctx, visualWidth, bufWidth, bufHeight, transform, gridType, layers);
    } else if (this.gridService.isAnyTriangular(gridType) && showClones && sideCount >= 3) {
      this.renderTriangularClones(ctx, bufHeight, transform, gridType, layers, sideCount);
    } else if (this.gridService.isAnyTriangular(gridType)) {
      this.renderTriangularLayers(ctx, bufHeight, transform, gridType, layers);
    } else {
      for (const layer of layers) {
        if (!layer.visible || layer.opacity === 0) continue;

        const imageData = new ImageData(new Uint8ClampedArray(layer.data), bufWidth, bufHeight);

        // Create a temporary canvas for the layer
        const tempCanvas = new OffscreenCanvas(bufWidth, bufHeight);
        const tempCtx = tempCanvas.getContext('2d')!;
        tempCtx.putImageData(imageData, 0, 0);

        // Draw with opacity and transform
        ctx.save();
        ctx.translate(transform.offsetX, transform.offsetY);
        ctx.scale(transform.scale, transform.scale);
        ctx.imageSmoothingEnabled = false;
        ctx.globalAlpha = layer.opacity;
        ctx.drawImage(tempCanvas, 0, 0);
        ctx.restore();
      }
    }

    // Draw preview overlay (e.g. line/rect preview while dragging)
    if (previewPixels && previewPixels.length > 0 && previewColor) {
      this.drawPreview(ctx, previewPixels, previewColor, transform, gridType, bufHeight);
    }

    // Draw pixel grid.
    // Skip standalone grid when clone mode is active — rendered per-wedge instead.
    if (this.canvasState.showGrid() && !clonesActive) {
      this.drawGrid(ctx, visualWidth, visualHeight, bufWidth, bufHeight, transform, gridType);
    }
  }

  /**
   * Render all visible layers to a flat ImageData (for export — square grids only).
   */
  compositeToImageData(): ImageData {
    const width = this.canvasState.bufferWidth();
    const height = this.canvasState.bufferHeight();
    const result = new ImageData(width, height);
    const layers = this.layerService.layers();

    for (const layer of layers) {
      if (!layer.visible || layer.opacity === 0) continue;

      for (let i = 0; i < layer.data.length; i += 4) {
        const srcA = (layer.data[i + 3] / 255) * layer.opacity;
        const dstA = result.data[i + 3] / 255;
        const outA = srcA + dstA * (1 - srcA);

        if (outA > 0) {
          result.data[i] = (layer.data[i] * srcA + result.data[i] * dstA * (1 - srcA)) / outA;
          result.data[i + 1] =
            (layer.data[i + 1] * srcA + result.data[i + 1] * dstA * (1 - srcA)) / outA;
          result.data[i + 2] =
            (layer.data[i + 2] * srcA + result.data[i + 2] * dstA * (1 - srcA)) / outA;
          result.data[i + 3] = outA * 255;
        }
      }
    }

    return result;
  }

  /**
   * Render all visible layers to an OffscreenCanvas at the given scale,
   * drawing beads in peyote/triangular layout. Used for non-square export.
   */
  compositeToCanvas(scale: number): OffscreenCanvas {
    const visualWidth = this.canvasState.canvasWidth();
    const visualHeight = this.canvasState.canvasHeight();
    const bufWidth = this.canvasState.bufferWidth();
    const bufHeight = this.canvasState.bufferHeight();
    const gridType = this.canvasState.gridType();
    const triA = this.canvasState.triangularA();
    const triD = this.canvasState.triangularD();
    const triDNum = this.canvasState.triangularDNum();
    const triDDen = this.canvasState.triangularDDen();
    const triShift = this.canvasState.triangularShift();

    let canvasW: number;
    let canvasH: number;

    if (gridType === 'triangular') {
      const maxRowWidth = this.gridService.getAnyTriangularMaxWidth(bufHeight, gridType, triA, triD, triDNum, triDDen, triShift);
      const usesPeyote = this.gridService.usesPeyoteStagger(gridType, triD, triDNum, triDDen);
      if (usesPeyote) {
        // Peyote-style: 2-stride spacing + half-row interleaving
        canvasW = ((maxRowWidth - 1) * 2 + 1) * scale;
        canvasH = (bufHeight - 1) * Math.ceil(scale / 2) + scale;
      } else {
        canvasW = maxRowWidth * scale;
        canvasH = bufHeight * scale;
      }
    } else {
      // Canvas needs extra half-bead height for odd-column offset in peyote
      const beadsPerCol = gridType === 'peyote' ? Math.ceil(bufHeight / 2) : bufHeight;
      const extraY = gridType === 'peyote' ? Math.ceil(scale / 2) : 0;
      canvasW = visualWidth * scale;
      canvasH = beadsPerCol * scale + extraY;
    }

    const canvas = new OffscreenCanvas(canvasW, canvasH);
    const ctx = canvas.getContext('2d')!;

    const layers = this.layerService.layers();

    if (gridType === 'triangular') {
      for (const layer of layers) {
        if (!layer.visible || layer.opacity === 0) continue;
        ctx.globalAlpha = layer.opacity;

        for (let row = 0; row < bufHeight; row++) {
          const rowWidth = this.gridService.getAnyTriangularRowWidth(row, gridType, triA, triD, triDNum, triDDen, triShift);
          for (let col = 0; col < rowWidth; col++) {
            const offset = pixelOffset(col, row, bufWidth, gridType, triA, triD, triDNum, triDDen, triShift);
            const a = layer.data[offset + 3];
            if (a === 0) continue;

            const { sx, sy } = this.gridService.pixelToScreen(
              col, row, scale, gridType, triA, triD, bufHeight, triDNum, triDDen, triShift,
            );
            ctx.fillStyle = `rgba(${layer.data[offset]},${layer.data[offset + 1]},${layer.data[offset + 2]},${a / 255})`;
            ctx.fillRect(sx, sy, scale + 0.5, scale + 0.5);
          }
        }
      }
    } else {
      for (const layer of layers) {
        if (!layer.visible || layer.opacity === 0) continue;
        ctx.globalAlpha = layer.opacity;

        for (let by = 0; by < bufHeight; by++) {
          for (let bx = 0; bx < bufWidth; bx++) {
            if (!this.gridService.isValidPixel(bx, by, bufWidth, bufHeight, gridType, visualWidth)) continue;
            const offset = (by * bufWidth + bx) * 4;
            const a = layer.data[offset + 3];
            if (a === 0) continue;

            const { sx, sy } = this.gridService.pixelToScreen(bx, by, scale, gridType);
            ctx.fillStyle = `rgba(${layer.data[offset]},${layer.data[offset + 1]},${layer.data[offset + 2]},${a / 255})`;
            ctx.fillRect(sx, sy, scale, scale);
          }
        }
      }
    }

    ctx.globalAlpha = 1;
    return canvas;
  }

  /** Render preview pixels on top of all layers using the active preview color. */
  private drawPreview(
    ctx: CanvasRenderingContext2D,
    pixels: PixelCoord[],
    color: Color,
    transform: { scale: number; offsetX: number; offsetY: number },
    gridType: GridType,
    totalRows?: number,
  ): void {
    const a = this.canvasState.triangularA();
    const d = this.canvasState.triangularD();
    const dNum = this.canvasState.triangularDNum();
    const dDen = this.canvasState.triangularDDen();
    const shift = this.canvasState.triangularShift();
    ctx.save();
    ctx.translate(transform.offsetX, transform.offsetY);
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = `rgb(${color.r},${color.g},${color.b})`;

    for (const { x, y } of pixels) {
      const { sx, sy } = this.gridService.pixelToScreen(
        x, y, transform.scale, gridType, a, d, totalRows, dNum, dDen, shift,
      );
      ctx.fillRect(sx, sy, transform.scale, transform.scale);
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /** Render triangular layers bead-by-bead onto the viewport canvas. */
  private renderTriangularLayers(
    ctx: CanvasRenderingContext2D,
    totalRows: number,
    transform: { scale: number; offsetX: number; offsetY: number },
    gridType: GridType,
    layers: readonly { visible: boolean; opacity: number; data: Uint8ClampedArray }[],
  ): void {
    ctx.save();
    ctx.translate(transform.offsetX, transform.offsetY);
    this.renderTriangularBeads(ctx, totalRows, transform.scale, gridType, layers);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /**
   * Render triangular layers with radial shadow clones.
   * All n wedges share the same buffer, rotated around the apex pivot.
   */
  private renderTriangularClones(
    ctx: CanvasRenderingContext2D,
    totalRows: number,
    transform: { scale: number; offsetX: number; offsetY: number },
    gridType: GridType,
    layers: readonly { visible: boolean; opacity: number; data: Uint8ClampedArray }[],
    sideCount: number,
  ): void {
    const a = this.canvasState.triangularA();
    const d = this.canvasState.triangularD();
    const dNum = this.canvasState.triangularDNum();
    const dDen = this.canvasState.triangularDDen();
    const shift = this.canvasState.triangularShift();
    const maxWidth = this.gridService.getAnyTriangularMaxWidth(
      totalRows, gridType, a, d, dNum, dDen, shift,
    );
    const usesPeyote = this.gridService.usesPeyoteStagger(gridType, d, dNum, dDen);
    const pivot = this.getClonePivot(transform.scale, maxWidth, usesPeyote, a, dNum, dDen);

    ctx.save();
    ctx.translate(transform.offsetX, transform.offsetY);

    const angleStep = (2 * Math.PI) / sideCount;
    const wedgeHeight = usesPeyote
      ? (totalRows - 1) * (transform.scale / 2) + transform.scale
      : totalRows * transform.scale;

    // Compute x-scale correction so the wedge opening angle matches
    // exactly 2π/sideCount.  The vertical reference (dy) is measured from
    // y=0 to the center of the last bead — (R-0.5) × rowSpacing — rather
    // than from pivot to bead bottom.  This gives the correct angular
    // extent without any empirical fudge factor.
    const halfWidth = usesPeyote
      ? maxWidth * transform.scale
      : ((maxWidth + 1) / 2) * transform.scale;
    const rowSpacing = usesPeyote ? transform.scale / 2 : transform.scale;
    const dy = (totalRows - 0.5) * rowSpacing;
    const targetAngle = Math.PI / sideCount;
    const xScale = (Math.tan(targetAngle) * dy) / halfWidth;

    // Shift the polygon group down so the pivot (polygon center) aligns with
    // the vertical center of the original single-wedge extent.
    const centeringOffsetY = wedgeHeight / 2 - pivot.y;
    ctx.translate(0, centeringOffsetY);

    const showGrid = this.canvasState.showGrid();
    // Render each wedge: checkerboard + beads + optional grid,
    // with x-scale correction applied around the pivot.
    for (let i = 0; i < sideCount; i++) {
      ctx.save();
      if (i > 0) {
        ctx.translate(pivot.x, pivot.y);
        ctx.rotate(i * angleStep);
        ctx.translate(-pivot.x, -pivot.y);
      }
      // Apply x-scale correction around pivot.x
      ctx.translate(pivot.x, 0);
      ctx.scale(xScale, 1);
      ctx.translate(-pivot.x, 0);

      this.renderTriangularCheckerboard(ctx, totalRows, transform.scale, gridType);
      this.renderTriangularBeads(ctx, totalRows, transform.scale, gridType, layers);
      if (showGrid) {
        this.renderTriangularGrid(ctx, totalRows, transform.scale, gridType);
      }
      ctx.restore();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /**
   * Render triangular beads without ctx save/translate wrapper.
   * Caller is responsible for setting up canvas transforms.
   */
  private renderTriangularBeads(
    ctx: CanvasRenderingContext2D,
    totalRows: number,
    scale: number,
    gridType: GridType,
    layers: readonly { visible: boolean; opacity: number; data: Uint8ClampedArray }[],
  ): void {
    const a = this.canvasState.triangularA();
    const d = this.canvasState.triangularD();
    const dNum = this.canvasState.triangularDNum();
    const dDen = this.canvasState.triangularDDen();
    const shift = this.canvasState.triangularShift();
    const bufWidth = this.canvasState.bufferWidth();

    for (const layer of layers) {
      if (!layer.visible || layer.opacity === 0) continue;
      ctx.globalAlpha = layer.opacity;

      for (let row = 0; row < totalRows; row++) {
        const rowWidth = this.gridService.getAnyTriangularRowWidth(row, gridType, a, d, dNum, dDen, shift);
        for (let col = 0; col < rowWidth; col++) {
          const offset = pixelOffset(col, row, bufWidth, gridType, a, d, dNum, dDen, shift);
          const alpha = layer.data[offset + 3];
          if (alpha === 0) continue;

          const { sx, sy } = this.gridService.pixelToScreen(
            col, row, scale, gridType, a, d, totalRows, dNum, dDen, shift,
          );
          ctx.fillStyle = `rgba(${layer.data[offset]},${layer.data[offset + 1]},${layer.data[offset + 2]},${alpha / 255})`;
          ctx.fillRect(sx, sy, scale + 0.5, scale + 0.5);
        }
      }
    }
  }

  /**
   * Render the triangular checkerboard (transparency indicator) for a single wedge.
   * No ctx save/restore — caller handles transforms.
   */
  private renderTriangularCheckerboard(
    ctx: CanvasRenderingContext2D,
    totalRows: number,
    scale: number,
    gridType: GridType,
  ): void {
    const a = this.canvasState.triangularA();
    const d = this.canvasState.triangularD();
    const dNum = this.canvasState.triangularDNum();
    const dDen = this.canvasState.triangularDDen();
    const shift = this.canvasState.triangularShift();

    ctx.globalAlpha = 1;
    for (let row = 0; row < totalRows; row++) {
      const rowWidth = this.gridService.getAnyTriangularRowWidth(row, gridType, a, d, dNum, dDen, shift);
      for (let col = 0; col < rowWidth; col++) {
        const isLight = (col + row) % 2 === 0;
        ctx.fillStyle = isLight ? '#3a3a3a' : '#2a2a2a';
        const { sx, sy } = this.gridService.pixelToScreen(
          col, row, scale, gridType, a, d, totalRows, dNum, dDen, shift,
        );
        ctx.fillRect(sx, sy, scale + 0.5, scale + 0.5);
      }
    }
  }

  /**
   * Render the triangular pixel grid for a single wedge.
   * No ctx save/restore — caller handles transforms.
   */
  private renderTriangularGrid(
    ctx: CanvasRenderingContext2D,
    totalRows: number,
    scale: number,
    gridType: GridType,
  ): void {
    const a = this.canvasState.triangularA();
    const d = this.canvasState.triangularD();
    const dNum = this.canvasState.triangularDNum();
    const dDen = this.canvasState.triangularDDen();
    const shift = this.canvasState.triangularShift();
    const maxWidth = this.gridService.getAnyTriangularMaxWidth(
      totalRows, gridType, a, d, dNum, dDen, shift,
    );
    const usesPeyote = this.gridService.usesPeyoteStagger(gridType, d, dNum, dDen);
    const rowSpacing = usesPeyote ? scale / 2 : scale;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 1;

    if (usesPeyote) {
      for (let row = 0; row < totalRows; row++) {
        const rowWidth = this.gridService.getAnyTriangularRowWidth(row, gridType, a, d, dNum, dDen, shift);
        const centerOffset = maxWidth - rowWidth;
        const y = row * rowSpacing;
        for (let col = 0; col < rowWidth; col++) {
          const x = (centerOffset + col * 2) * scale;
          ctx.strokeRect(x, y, scale, scale);
        }
      }
    } else {
      for (let row = 0; row < totalRows; row++) {
        const rowWidth = this.gridService.getAnyTriangularRowWidth(row, gridType, a, d, dNum, dDen, shift);
        const centerOffset = (maxWidth - rowWidth) / 2;
        const y = row * rowSpacing;
        const startX = centerOffset * scale;
        const endX = (centerOffset + rowWidth) * scale;
        ctx.beginPath();
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
        ctx.stroke();
        for (let col = 0; col <= rowWidth; col++) {
          const x = (centerOffset + col) * scale;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + scale);
          ctx.stroke();
        }
      }
      // Bottom border of last row
      const lastRow = totalRows - 1;
      const lastRowWidth = this.gridService.getAnyTriangularRowWidth(lastRow, gridType, a, d, dNum, dDen, shift);
      const lastCenterOffset = (maxWidth - lastRowWidth) / 2;
      const bottomY = lastRow * rowSpacing + scale;
      ctx.beginPath();
      ctx.moveTo(lastCenterOffset * scale, bottomY);
      ctx.lineTo((lastCenterOffset + lastRowWidth) * scale, bottomY);
      ctx.stroke();
    }
  }

  /**
   * Compute the pivot point for radial clone rotation.
   * The pivot is the center of the first-row pixel(s) — the apex of the wedge.
   */
  private getClonePivot(
    scale: number,
    maxWidth: number,
    usesPeyote: boolean,
    a: number,
    dNum: number,
    dDen: number,
  ): { x: number; y: number } {
    // The pivot is the theoretical apex where the wedge converges to
    // zero width.  Row r has width ≈ a + r·dNum/dDen, so extrapolating
    // back to width 0 gives r_apex = -(a·dDen/dNum).  In screen space
    // that's r_apex × rowSpacing above the first row.
    const rowSpacing = usesPeyote ? scale / 2 : scale;
    const pivotY = -(a * dDen / dNum) * rowSpacing;
    if (usesPeyote) {
      return { x: (maxWidth - 0.5) * scale, y: pivotY };
    }
    return { x: (maxWidth / 2) * scale, y: pivotY };
  }

  /** Render peyote layers bead-by-bead onto the viewport canvas. */
  private renderPeyoteLayers(
    ctx: CanvasRenderingContext2D,
    visualWidth: number,
    bufWidth: number,
    bufHeight: number,
    transform: { scale: number; offsetX: number; offsetY: number },
    gridType: GridType,
    layers: readonly { visible: boolean; opacity: number; data: Uint8ClampedArray }[],
  ): void {
    ctx.save();
    ctx.translate(transform.offsetX, transform.offsetY);

    for (const layer of layers) {
      if (!layer.visible || layer.opacity === 0) continue;
      ctx.globalAlpha = layer.opacity;

      for (let by = 0; by < bufHeight; by++) {
        for (let bx = 0; bx < bufWidth; bx++) {
          if (!this.gridService.isValidPixel(bx, by, bufWidth, bufHeight, gridType, visualWidth)) continue;
          const offset = (by * bufWidth + bx) * 4;
          const a = layer.data[offset + 3];
          if (a === 0) continue;

          const { sx, sy } = this.gridService.pixelToScreen(bx, by, transform.scale, gridType);
          ctx.fillStyle = `rgba(${layer.data[offset]},${layer.data[offset + 1]},${layer.data[offset + 2]},${a / 255})`;
          ctx.fillRect(sx, sy, transform.scale, transform.scale);
        }
      }
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private drawCheckerboard(
    ctx: CanvasRenderingContext2D,
    visualWidth: number,
    visualHeight: number,
    bufWidth: number,
    bufHeight: number,
    transform: { scale: number; offsetX: number; offsetY: number },
    gridType: GridType,
  ): void {
    ctx.save();
    ctx.translate(transform.offsetX, transform.offsetY);

    if (this.gridService.isPeyote(gridType)) {
      // Draw checkerboard bead-by-bead for peyote
      for (let by = 0; by < bufHeight; by++) {
        for (let bx = 0; bx < bufWidth; bx++) {
          if (!this.gridService.isValidPixel(bx, by, bufWidth, bufHeight, gridType, visualWidth)) continue;
          const { col } = this.gridService.bufferToVisual(bx, by);
          const isLight = col % 2 === 0;
          ctx.fillStyle = isLight ? '#3a3a3a' : '#2a2a2a';
          const { sx, sy } = this.gridService.pixelToScreen(bx, by, transform.scale, gridType);
          ctx.fillRect(sx, sy, transform.scale, transform.scale);
        }
      }
    } else if (this.gridService.isAnyTriangular(gridType)) {
      // Draw checkerboard bead-by-bead for triangular
      const a = this.canvasState.triangularA();
      const d = this.canvasState.triangularD();
      const dNum = this.canvasState.triangularDNum();
      const dDen = this.canvasState.triangularDDen();
      const shift = this.canvasState.triangularShift();
      for (let row = 0; row < bufHeight; row++) {
        const rowWidth = this.gridService.getAnyTriangularRowWidth(row, gridType, a, d, dNum, dDen, shift);
        for (let col = 0; col < rowWidth; col++) {
          const isLight = (col + row) % 2 === 0;
          ctx.fillStyle = isLight ? '#3a3a3a' : '#2a2a2a';
          const { sx, sy } = this.gridService.pixelToScreen(
            col, row, transform.scale, gridType, a, d, bufHeight, dNum, dDen, shift,
          );
          ctx.fillRect(sx, sy, transform.scale + 0.5, transform.scale + 0.5);
        }
      }
    } else {
      for (let y = 0; y < bufHeight; y++) {
        for (let x = 0; x < bufWidth; x++) {
          const isLight = (x + y) % 2 === 0;
          ctx.fillStyle = isLight ? '#3a3a3a' : '#2a2a2a';
          ctx.fillRect(x * transform.scale, y * transform.scale, transform.scale, transform.scale);
        }
      }
    }

    ctx.restore();
  }

  private drawGrid(
    ctx: CanvasRenderingContext2D,
    visualWidth: number,
    visualHeight: number,
    bufWidth: number,
    bufHeight: number,
    transform: { scale: number; offsetX: number; offsetY: number },
    gridType: GridType,
  ): void {
    ctx.save();
    ctx.translate(transform.offsetX, transform.offsetY);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;

    if (this.gridService.isPeyote(gridType)) {
      // beadsPerColumn for even/odd visual columns
      const beadsEven = Math.ceil(bufHeight / 2);
      const beadsOdd = Math.floor(bufHeight / 2);
      const maxBeads = beadsEven; // height of tallest column

      // Draw per-column grid for peyote using visual columns
      for (let col = 0; col <= visualWidth; col++) {
        ctx.beginPath();
        ctx.moveTo(col * transform.scale, 0);
        ctx.lineTo(
          col * transform.scale,
          maxBeads * transform.scale + transform.scale / 2,
        );
        ctx.stroke();
      }

      // Horizontal lines per visual column
      for (let col = 0; col < visualWidth; col++) {
        const isOddCol = col % 2 === 1;
        const offsetY = isOddCol ? transform.scale / 2 : 0;
        const colBeads = isOddCol ? beadsOdd : beadsEven;

        for (let beadRow = 0; beadRow <= colBeads; beadRow++) {
          const sy = beadRow * transform.scale + offsetY;
          ctx.beginPath();
          ctx.moveTo(col * transform.scale, sy);
          ctx.lineTo((col + 1) * transform.scale, sy);
          ctx.stroke();
        }
      }
    } else if (this.gridService.isAnyTriangular(gridType)) {
      // Triangular grid: draw cell outlines per row
      const a = this.canvasState.triangularA();
      const d = this.canvasState.triangularD();
      const dNum = this.canvasState.triangularDNum();
      const dDen = this.canvasState.triangularDDen();
      const shift = this.canvasState.triangularShift();
      const totalRows = bufHeight;
      const maxWidth = this.gridService.getAnyTriangularMaxWidth(totalRows, gridType, a, d, dNum, dDen, shift);
      const usesPeyote = this.gridService.usesPeyoteStagger(gridType, d, dNum, dDen);
      const rowSpacing = usesPeyote ? transform.scale / 2 : transform.scale;

      if (usesPeyote) {
        // Peyote-stagger: draw individual cell outlines
        for (let row = 0; row < totalRows; row++) {
          const rowWidth = this.gridService.getAnyTriangularRowWidth(row, gridType, a, d, dNum, dDen, shift);
          const centerOffset = maxWidth - rowWidth;
          const y = row * rowSpacing;
          for (let col = 0; col < rowWidth; col++) {
            const x = (centerOffset + col * 2) * transform.scale;
            ctx.strokeRect(x, y, transform.scale, transform.scale);
          }
        }
      } else {
        // Full-height centered: continuous rows
        for (let row = 0; row < totalRows; row++) {
          const rowWidth = this.gridService.getAnyTriangularRowWidth(row, gridType, a, d, dNum, dDen, shift);
          const centerOffset = (maxWidth - rowWidth) / 2;
          const y = row * rowSpacing;

          const startX = centerOffset * transform.scale;
          const endX = (centerOffset + rowWidth) * transform.scale;
          ctx.beginPath();
          ctx.moveTo(startX, y);
          ctx.lineTo(endX, y);
          ctx.stroke();

          for (let col = 0; col <= rowWidth; col++) {
            const x = (centerOffset + col) * transform.scale;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + transform.scale);
            ctx.stroke();
          }
        }

        // Bottom border of last row
        {
          const lastRow = totalRows - 1;
          const lastRowWidth = this.gridService.getAnyTriangularRowWidth(lastRow, gridType, a, d, dNum, dDen, shift);
          const lastCenterOffset = (maxWidth - lastRowWidth) / 2;
          const bottomY = lastRow * rowSpacing + transform.scale;
          const startX = lastCenterOffset * transform.scale;
          const endX = (lastCenterOffset + lastRowWidth) * transform.scale;
          ctx.beginPath();
          ctx.moveTo(startX, bottomY);
          ctx.lineTo(endX, bottomY);
          ctx.stroke();
        }
      }
    } else {
      // Square grid: uniform vertical and horizontal lines
      for (let x = 0; x <= bufWidth; x++) {
        ctx.beginPath();
        ctx.moveTo(x * transform.scale, 0);
        ctx.lineTo(x * transform.scale, bufHeight * transform.scale);
        ctx.stroke();
      }

      for (let y = 0; y <= bufHeight; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * transform.scale);
        ctx.lineTo(bufWidth * transform.scale, y * transform.scale);
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}
