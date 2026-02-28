import { Command, ModifiedPixel, GridType, TriangularParams } from '../models';
import { LayerService } from '../services/layer.service';

/**
 * Abstract base class for pixel-based commands (draw, fill, etc.).
 * Stores modified pixels and replays them via LayerService for undo/redo.
 */
export abstract class PixelCommand implements Command {
  readonly description: string;

  constructor(
    readonly layerService: LayerService,
    readonly layerIdx: number,
    readonly width: number,
    readonly modifiedPixels: ModifiedPixel[],
    description: string,
    readonly gridType?: GridType,
    readonly triangular?: TriangularParams,
  ) {
    this.description = description;
  }

  execute(): void {
    for (const pixel of this.modifiedPixels) {
      this.layerService.setPixel(
        this.layerIdx,
        pixel.coord.x,
        pixel.coord.y,
        this.width,
        pixel.newColor,
        this.gridType,
        this.triangular?.a,
        this.triangular?.d,
        this.triangular?.dNum,
        this.triangular?.dDen,
        this.triangular?.shift,
      );
    }
    this.layerService.notifyLayersChanged();
  }

  undo(): void {
    for (const pixel of this.modifiedPixels) {
      this.layerService.setPixel(
        this.layerIdx,
        pixel.coord.x,
        pixel.coord.y,
        this.width,
        pixel.oldColor,
        this.gridType,
        this.triangular?.a,
        this.triangular?.d,
        this.triangular?.dNum,
        this.triangular?.dDen,
        this.triangular?.shift,
      );
    }
    this.layerService.notifyLayersChanged();
  }
}
