import { Command, Color, PixelCoord, ModifiedPixel } from '../models';
import { GridType } from '../models/project.model';
import { LayerService } from '../services/layer.service';

/**
 * Command for pixel drawing operations (pencil, eraser, etc.).
 * Stores the modified pixels for undo/redo.
 */
export class DrawCommand implements Command {
  readonly description: string;

  constructor(
    readonly layerService: LayerService,
    readonly layerIdx: number,
    readonly width: number,
    readonly modifiedPixels: ModifiedPixel[],
    description?: string,
    readonly gridType?: GridType,
    readonly triangularA?: number,
    readonly triangularD?: number,
  ) {
    this.description = description ?? `Draw ${modifiedPixels.length} pixel(s)`;
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
