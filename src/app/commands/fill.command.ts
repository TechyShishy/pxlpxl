import { Command, ModifiedPixel } from '../models';
import { GridType } from '../models/project.model';
import { LayerService } from '../services/layer.service';

/**
 * Command for flood fill operations.
 * Stores all modified pixels for undo/redo.
 */
export class FillCommand implements Command {
  readonly description: string;

  constructor(
    readonly layerService: LayerService,
    readonly layerIdx: number,
    readonly width: number,
    readonly modifiedPixels: ModifiedPixel[],
    readonly gridType?: GridType,
    readonly triangularA?: number,
    readonly triangularD?: number,
  ) {
    this.description = `Fill ${modifiedPixels.length} pixel(s)`;
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
        this.triangularA,
        this.triangularD,
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
        this.triangularA,
        this.triangularD,
      );
    }
    this.layerService.notifyLayersChanged();
  }
}
