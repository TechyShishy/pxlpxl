import { ModifiedPixel, GridType, TriangularParams } from '../models';
import { LayerService } from '../services/layer.service';
import { PixelCommand } from './pixel.command';

/**
 * Command for pixel drawing operations (pencil, eraser, etc.).
 * Stores the modified pixels for undo/redo.
 */
export class DrawCommand extends PixelCommand {
  constructor(
    layerService: LayerService,
    layerIdx: number,
    width: number,
    modifiedPixels: ModifiedPixel[],
    description?: string,
    gridType?: GridType,
    triangular?: TriangularParams,
  ) {
    super(
      layerService,
      layerIdx,
      width,
      modifiedPixels,
      description ?? `Draw ${modifiedPixels.length} pixel(s)`,
      gridType,
      triangular,
    );
  }
}
