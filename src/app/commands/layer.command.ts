import { Command } from '../models';
import { LayerService } from '../services/layer.service';

/**
 * Command for full-layer operations (restore entire layer data).
 * Used for operations that modify many pixels at once.
 */
export class LayerCommand implements Command {
  readonly description: string;

  constructor(
    private readonly layerService: LayerService,
    private readonly layerIndex: number,
    private readonly previousData: Uint8ClampedArray,
    private readonly newData: Uint8ClampedArray,
    description?: string,
  ) {
    this.description = description ?? 'Layer operation';
  }

  execute(): void {
    this.layerService.setLayerData(this.layerIndex, this.newData);
  }

  undo(): void {
    this.layerService.setLayerData(this.layerIndex, this.previousData);
  }
}
