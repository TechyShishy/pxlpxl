import { Command } from '../models';
import { Layer } from '../models';
import { LayerService } from '../services/layer.service';

/**
 * Command that duplicates a layer by inserting a snapshot directly above the source.
 * Undoing removes the inserted layer.
 */
export class DuplicateLayerCommand implements Command {
  readonly description = 'Duplicate layer';

  constructor(
    private readonly layerService: LayerService,
    /** Index at which the duplicated layer will be inserted (source index + 1). */
    readonly insertIndex: number,
    /** A pre-cloned snapshot of the layer to insert. */
    readonly layer: Layer,
  ) {}

  execute(): void {
    this.layerService.insertLayer(this.insertIndex, this.layer);
  }

  undo(): void {
    this.layerService.removeLayer(this.insertIndex);
  }
}
