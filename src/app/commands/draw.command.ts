import { Command, Color, PixelCoord, ModifiedPixel } from '../models';
import { LayerService } from '../services/layer.service';

/**
 * Command for pixel drawing operations (pencil, eraser, etc.).
 * Stores the modified pixels for undo/redo.
 */
export class DrawCommand implements Command {
  readonly description: string;

  constructor(
    private readonly layerService: LayerService,
    private readonly layerIndex: number,
    private readonly canvasWidth: number,
    private readonly modifiedPixels: ModifiedPixel[],
    description?: string,
  ) {
    this.description = description ?? `Draw ${modifiedPixels.length} pixel(s)`;
  }

  execute(): void {
    for (const pixel of this.modifiedPixels) {
      this.layerService.setPixel(
        this.layerIndex,
        pixel.coord.x,
        pixel.coord.y,
        this.canvasWidth,
        pixel.newColor,
      );
    }
  }

  undo(): void {
    for (const pixel of this.modifiedPixels) {
      this.layerService.setPixel(
        this.layerIndex,
        pixel.coord.x,
        pixel.coord.y,
        this.canvasWidth,
        pixel.oldColor,
      );
    }
  }
}
