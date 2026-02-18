import { Injectable, inject } from '@angular/core';
import { LayerService } from './layer.service';
import { CanvasStateService } from './canvas-state.service';
import { GridService } from './grid.service';
import { Color, GridType, PixelCoord } from '../models';

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
    const width = this.canvasState.canvasWidth();
    const height = this.canvasState.canvasHeight();
    const transform = this.canvasState.transform();
    const layers = this.layerService.layers();
    const gridType = this.canvasState.gridType();

    // Clear the viewport
    ctx.clearRect(0, 0, viewportWidth, viewportHeight);

    // Draw checkerboard background (transparency indicator)
    this.drawCheckerboard(ctx, width, height, transform, gridType);

    // Composite visible layers
    if (this.gridService.isPeyote(gridType)) {
      this.renderPeyoteLayers(ctx, width, height, transform, gridType, layers);
    } else {
      for (const layer of layers) {
        if (!layer.visible || layer.opacity === 0) continue;

        const imageData = new ImageData(new Uint8ClampedArray(layer.data), width, height);

        // Create a temporary canvas for the layer
        const tempCanvas = new OffscreenCanvas(width, height);
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
      this.drawPreview(ctx, previewPixels, previewColor, transform, gridType);
    }

    // Draw pixel grid
    if (this.canvasState.showGrid() && transform.scale >= 4) {
      this.drawGrid(ctx, width, height, transform, gridType);
    }
  }

  /**
   * Render all visible layers to a flat ImageData (for export — square grids only).
   */
  compositeToImageData(): ImageData {
    const width = this.canvasState.canvasWidth();
    const height = this.canvasState.canvasHeight();
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
   * drawing beads in peyote layout. Used for peyote export.
   */
  compositeToCanvas(scale: number): OffscreenCanvas {
    const width = this.canvasState.canvasWidth();
    const height = this.canvasState.canvasHeight();
    const gridType = this.canvasState.gridType();

    // Canvas needs extra half-bead width for odd-row offset in peyote-even
    const extraX = gridType === 'peyote-even' ? Math.ceil(scale / 2) : 0;
    const canvasW = width * scale + extraX;
    const canvasH = height * scale;
    const canvas = new OffscreenCanvas(canvasW, canvasH);
    const ctx = canvas.getContext('2d')!;

    const layers = this.layerService.layers();
    for (const layer of layers) {
      if (!layer.visible || layer.opacity === 0) continue;
      ctx.globalAlpha = layer.opacity;

      for (let y = 0; y < height; y++) {
        const rw = this.gridService.rowWidth(y, width, gridType);
        for (let x = 0; x < rw; x++) {
          const offset = (y * width + x) * 4;
          const a = layer.data[offset + 3];
          if (a === 0) continue;

          const { sx, sy } = this.gridService.pixelToScreen(x, y, scale, gridType);
          ctx.fillStyle = `rgba(${layer.data[offset]},${layer.data[offset + 1]},${layer.data[offset + 2]},${a / 255})`;
          ctx.fillRect(sx, sy, scale, scale);
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
  ): void {
    ctx.save();
    ctx.translate(transform.offsetX, transform.offsetY);
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = `rgb(${color.r},${color.g},${color.b})`;

    for (const { x, y } of pixels) {
      const { sx, sy } = this.gridService.pixelToScreen(x, y, transform.scale, gridType);
      ctx.fillRect(sx, sy, transform.scale, transform.scale);
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /** Render peyote layers bead-by-bead onto the viewport canvas. */
  private renderPeyoteLayers(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    transform: { scale: number; offsetX: number; offsetY: number },
    gridType: GridType,
    layers: readonly { visible: boolean; opacity: number; data: Uint8ClampedArray }[],
  ): void {
    ctx.save();
    ctx.translate(transform.offsetX, transform.offsetY);

    for (const layer of layers) {
      if (!layer.visible || layer.opacity === 0) continue;
      ctx.globalAlpha = layer.opacity;

      for (let y = 0; y < height; y++) {
        const rw = this.gridService.rowWidth(y, width, gridType);
        for (let x = 0; x < rw; x++) {
          const offset = (y * width + x) * 4;
          const a = layer.data[offset + 3];
          if (a === 0) continue;

          const { sx, sy } = this.gridService.pixelToScreen(x, y, transform.scale, gridType);
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
    width: number,
    height: number,
    transform: { scale: number; offsetX: number; offsetY: number },
    gridType: GridType,
  ): void {
    ctx.save();
    ctx.translate(transform.offsetX, transform.offsetY);

    if (this.gridService.isPeyote(gridType)) {
      // Draw checkerboard bead-by-bead for peyote
      for (let y = 0; y < height; y++) {
        const rw = this.gridService.rowWidth(y, width, gridType);
        for (let x = 0; x < rw; x++) {
          const isLight = (x + y) % 2 === 0;
          ctx.fillStyle = isLight ? '#3a3a3a' : '#2a2a2a';
          const { sx, sy } = this.gridService.pixelToScreen(x, y, transform.scale, gridType);
          ctx.fillRect(sx, sy, transform.scale, transform.scale);
        }
      }
    } else {
      const checkSize = Math.max(1, Math.floor(transform.scale / 2));
      for (let y = 0; y < height * transform.scale; y += checkSize) {
        for (let x = 0; x < width * transform.scale; x += checkSize) {
          const isLight = (Math.floor(x / checkSize) + Math.floor(y / checkSize)) % 2 === 0;
          ctx.fillStyle = isLight ? '#3a3a3a' : '#2a2a2a';
          ctx.fillRect(x, y, checkSize, checkSize);
        }
      }
    }

    ctx.restore();
  }

  private drawGrid(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    transform: { scale: number; offsetX: number; offsetY: number },
    gridType: GridType,
  ): void {
    ctx.save();
    ctx.translate(transform.offsetX, transform.offsetY);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 0.5;

    if (this.gridService.isPeyote(gridType)) {
      // Draw per-row grid for peyote
      for (let y = 0; y <= height; y++) {
        // Horizontal line spanning full width including offset
        const maxRw = y < height ? this.gridService.rowWidth(y, width, gridType) : width;
        const offsetX = y < height && this.gridService.isOddRow(y) ? transform.scale / 2 : 0;
        const lineEndX = offsetX + maxRw * transform.scale;

        ctx.beginPath();
        ctx.moveTo(0, y * transform.scale);
        ctx.lineTo(
          Math.max(lineEndX, width * transform.scale + transform.scale / 2),
          y * transform.scale,
        );
        ctx.stroke();
      }

      // Vertical lines per row
      for (let y = 0; y < height; y++) {
        const rw = this.gridService.rowWidth(y, width, gridType);
        const offsetX = this.gridService.isOddRow(y) ? transform.scale / 2 : 0;

        for (let x = 0; x <= rw; x++) {
          const sx = x * transform.scale + offsetX;
          ctx.beginPath();
          ctx.moveTo(sx, y * transform.scale);
          ctx.lineTo(sx, (y + 1) * transform.scale);
          ctx.stroke();
        }
      }
    } else {
      // Square grid: uniform vertical and horizontal lines
      for (let x = 0; x <= width; x++) {
        ctx.beginPath();
        ctx.moveTo(x * transform.scale, 0);
        ctx.lineTo(x * transform.scale, height * transform.scale);
        ctx.stroke();
      }

      for (let y = 0; y <= height; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * transform.scale);
        ctx.lineTo(width * transform.scale, y * transform.scale);
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}
