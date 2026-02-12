import { Injectable, inject } from '@angular/core';
import { LayerService } from './layer.service';
import { CanvasStateService } from './canvas-state.service';

@Injectable({ providedIn: 'root' })
export class RenderService {
  private readonly layerService = inject(LayerService);
  private readonly canvasState = inject(CanvasStateService);

  /**
   * Composites all visible layers onto a destination canvas context.
   * Applies zoom/pan transform and optionally draws the pixel grid.
   */
  render(ctx: CanvasRenderingContext2D, viewportWidth: number, viewportHeight: number): void {
    const width = this.canvasState.canvasWidth();
    const height = this.canvasState.canvasHeight();
    const transform = this.canvasState.transform();
    const layers = this.layerService.layers();

    // Clear the viewport
    ctx.clearRect(0, 0, viewportWidth, viewportHeight);

    // Draw checkerboard background (transparency indicator)
    this.drawCheckerboard(ctx, width, height, transform);

    // Composite visible layers
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

    // Draw pixel grid
    if (this.canvasState.showGrid() && transform.scale >= 4) {
      this.drawGrid(ctx, width, height, transform);
    }
  }

  /**
   * Render all visible layers to a flat ImageData (for export).
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

  private drawCheckerboard(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    transform: { scale: number; offsetX: number; offsetY: number },
  ): void {
    const checkSize = Math.max(1, Math.floor(transform.scale / 2));
    ctx.save();
    ctx.translate(transform.offsetX, transform.offsetY);

    for (let y = 0; y < height * transform.scale; y += checkSize) {
      for (let x = 0; x < width * transform.scale; x += checkSize) {
        const isLight = (Math.floor(x / checkSize) + Math.floor(y / checkSize)) % 2 === 0;
        ctx.fillStyle = isLight ? '#3a3a3a' : '#2a2a2a';
        ctx.fillRect(x, y, checkSize, checkSize);
      }
    }

    ctx.restore();
  }

  private drawGrid(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    transform: { scale: number; offsetX: number; offsetY: number },
  ): void {
    ctx.save();
    ctx.translate(transform.offsetX, transform.offsetY);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 0.5;

    // Vertical lines
    for (let x = 0; x <= width; x++) {
      ctx.beginPath();
      ctx.moveTo(x * transform.scale, 0);
      ctx.lineTo(x * transform.scale, height * transform.scale);
      ctx.stroke();
    }

    // Horizontal lines
    for (let y = 0; y <= height; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * transform.scale);
      ctx.lineTo(width * transform.scale, y * transform.scale);
      ctx.stroke();
    }

    ctx.restore();
  }
}
