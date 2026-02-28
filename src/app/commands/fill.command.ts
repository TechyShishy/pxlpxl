import { ModifiedPixel, GridType, TriangularParams } from '../models';
import { LayerService } from '../services/layer.service';
import { PixelCommand } from './pixel.command';

/**
 * Command for flood fill operations.
 * Stores all modified pixels for undo/redo.
 */
export class FillCommand extends PixelCommand {
  constructor(
    layerService: LayerService,
    layerIdx: number,
    width: number,
    modifiedPixels: ModifiedPixel[],
    gridType?: GridType,
    triangular?: TriangularParams,
  ) {
    super(
      layerService,
      layerIdx,
      width,
      modifiedPixels,
      `Fill ${modifiedPixels.length} pixel(s)`,
      gridType,
      triangular,
    );
  }
}
