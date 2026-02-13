import { Command } from '../models';
import { LayerService } from '../services/layer.service';

/**
 * Command for full-layer operations (restore entire layer data).
 * Used for operations that modify many pixels at once.
 */
export class LayerCommand implements Command {
  readonly description: string;

  constructor(
    readonly layerService: LayerService,
    readonly layerIdx: number,
    readonly previousData: Uint8ClampedArray,
    readonly newData: Uint8ClampedArray,
    description?: string,
  ) {
    this.description = description ?? 'Layer operation';
  }

  execute(): void {
    this.layerService.setLayerData(this.layerIdx, this.newData);
  }

  undo(): void {
    this.layerService.setLayerData(this.layerIdx, this.previousData);
  }
}
