import { Command, ModifiedPixel } from '../models';
import { LayerService } from '../services/layer.service';

/**
 * Command for flood fill operations.
 * Stores all modified pixels for undo/redo.
 */
export class FillCommand implements Command {
  readonly description: string;

  constructor(
    private readonly layerService: LayerService,
    private readonly layerIndex: number,
    private readonly canvasWidth: number,
    private readonly modifiedPixels: ModifiedPixel[],
  ) {
    this.description = `Fill ${modifiedPixels.length} pixel(s)`;
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
