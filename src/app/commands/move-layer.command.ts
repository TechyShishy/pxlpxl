import { Command } from '../models';
import { LayerService } from '../services/layer.service';

/**
 * Command that moves a layer from one index to another.
 * Undoing restores both layers to their original positions.
 */
export class MoveLayerCommand implements Command {
  readonly description = 'Move layer';

  constructor(
    private readonly layerService: LayerService,
    /** Original index of the layer before the move. */
    readonly fromIndex: number,
    /** Destination index of the layer after the move. */
    readonly toIndex: number,
  ) {}

  execute(): void {
    this.layerService.moveLayer(this.fromIndex, this.toIndex);
  }

  undo(): void {
    this.layerService.moveLayer(this.toIndex, this.fromIndex);
  }
}
