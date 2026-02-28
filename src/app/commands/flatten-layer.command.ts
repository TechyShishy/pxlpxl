import { Command, Layer } from '../models';
import { LayerService } from '../services/layer.service';

/**
 * Flattens the selected layer (at `layerIndex`) into the layer immediately above it
 * in the layers panel (at `layerIndex - 1`, which is visually below on the canvas).
 *
 * The layers panel displays index 0 at the top of the list, so "above in the panel"
 * corresponds to the lower canvas index. The selected layer (visually on top, higher
 * canvas index) composites over the panel-above layer via Porter-Duff "over". The
 * merged result is stored in the panel-above layer at opacity 1.0, and the selected
 * layer is removed.
 *
 * Undo re-inserts the selected layer and restores the panel-above layer's original
 * data and opacity.
 */
export class FlattenLayerCommand implements Command {
  readonly description = 'Flatten layer to above';

  readonly sourceLayerSnapshot: Layer;
  readonly previousAboveData: Uint8ClampedArray;
  readonly previousAboveOpacity: number;
  readonly mergedData: Uint8ClampedArray;
  /** Index of the surviving panel-above layer (layerIndex - 1). */
  readonly aboveIndex: number;

  constructor(
    private readonly layerService: LayerService,
    /**
     * Index of the selected layer to flatten. Must be > 0 (there must be a layer
     * above it in the panel, i.e. at index layerIndex - 1).
     */
    readonly layerIndex: number,
    canvasWidth: number,
    canvasHeight: number,
  ) {
    // The panel-above layer is at a lower array index (higher in the panel list).
    this.aboveIndex = layerIndex - 1;

    const layers = layerService.layers();
    // The selected layer sits visually on top (higher canvas index).
    const selectedLayer = layers[layerIndex];
    // The panel-above layer sits visually below (lower canvas index).
    const panelAboveLayer = layers[this.aboveIndex];

    // Snapshot the selected layer so it can be restored on undo.
    this.sourceLayerSnapshot = {
      id: selectedLayer.id,
      name: selectedLayer.name,
      visible: selectedLayer.visible,
      opacity: selectedLayer.opacity,
      data: new Uint8ClampedArray(selectedLayer.data),
    };

    // Snapshot the panel-above layer's data and opacity for undo.
    this.previousAboveData = new Uint8ClampedArray(panelAboveLayer.data);
    this.previousAboveOpacity = panelAboveLayer.opacity;

    // Pre-compute merged data: selected (visually on top) over panelAbove (visually below).
    this.mergedData = FlattenLayerCommand.composite(
      panelAboveLayer,
      selectedLayer,
      canvasWidth,
      canvasHeight,
    );
  }

  execute(): void {
    // Write the merged pixels into the panel-above layer and bake its opacity to 1.
    this.layerService.setLayerData(this.aboveIndex, this.mergedData);
    this.layerService.setOpacity(this.aboveIndex, 1);
    // Remove the selected layer. Since layerIndex > aboveIndex, removing it does
    // not shift aboveIndex.
    this.layerService.removeLayer(this.layerIndex);
  }

  undo(): void {
    // Re-insert the selected layer at its original index. Since layerIndex > aboveIndex,
    // this does not shift aboveIndex.
    this.layerService.insertLayer(this.layerIndex, this.sourceLayerSnapshot);
    // Restore the panel-above layer's original data and opacity.
    this.layerService.setLayerData(this.aboveIndex, this.previousAboveData);
    this.layerService.setOpacity(this.aboveIndex, this.previousAboveOpacity);
  }

  /**
   * Reconstruct a FlattenLayerCommand from serialized data without recomputing
   * the composite. Used during deserialization.
   */
  static fromSerialized(
    layerService: LayerService,
    layerIndex: number,
    sourceLayerSnapshot: Layer,
    previousAboveData: Uint8ClampedArray,
    previousAboveOpacity: number,
    mergedData: Uint8ClampedArray,
  ): FlattenLayerCommand {
    const cmd = Object.create(FlattenLayerCommand.prototype) as FlattenLayerCommand;
    Object.assign(cmd, {
      layerService,
      layerIndex,
      description: 'Flatten layer to above',
      aboveIndex: layerIndex - 1,
      sourceLayerSnapshot,
      previousAboveData,
      previousAboveOpacity,
      mergedData,
    });
    return cmd;
  }

  /**
   * Porter-Duff "over" composite: places `above` on top of `lower`.
   * Both layers' `opacity` values are factored in. The result has alpha baked in (opacity = 1).
   */
  private static composite(
    lower: Layer,
    above: Layer,
    width: number,
    height: number,
  ): Uint8ClampedArray {
    // Use actual buffer length rather than width * height to support triangular grids
    // where the pixel count is less than width * height.
    const pixelCount = lower.data.length / 4;
    const out = new Uint8ClampedArray(pixelCount * 4);

    for (let p = 0; p < pixelCount; p++) {
      const i = p * 4;

      // Effective alpha for each layer (per-pixel alpha × layer opacity).
      const srcA = (above.data[i + 3] / 255) * above.opacity;
      const dstA = (lower.data[i + 3] / 255) * lower.opacity;

      const outA = srcA + dstA * (1 - srcA);
      out[i + 3] = Math.round(outA * 255);

      if (outA === 0) {
        out[i] = 0;
        out[i + 1] = 0;
        out[i + 2] = 0;
      } else {
        for (let c = 0; c < 3; c++) {
          out[i + c] = Math.round(
            (above.data[i + c] * srcA + lower.data[i + c] * dstA * (1 - srcA)) / outA,
          );
        }
      }
    }

    return out;
  }
}
