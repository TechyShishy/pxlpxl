import type { Command, Color } from '../models';
import { ColorService } from '../services/color.service';
import { LayerService } from '../services/layer.service';

export interface PixelAbsorption {
  layerIndex: number;
  byteOffset: number;
  targetColor: Color;
}

/**
 * Absorbs an orphan palette color into one or more replacement colors.
 *
 * Each pixel formerly painted with `sourceColor` is remapped to its own
 * `targetColor` (which may differ per pixel — Voronoi nearest-neighbor
 * assignment, overrideable by the user in the preview step).
 *
 * On execute: pixels are rewritten and the palette entry is removed.
 * On undo: pixels are restored and the palette entry is re-inserted at
 * `paletteIndex` so the palette index of every other entry is preserved.
 */
export class AbsorbColorCommand implements Command {
  readonly description = 'Absorb orphan color';

  constructor(
    private readonly layerService: LayerService,
    private readonly colorService: ColorService,
    readonly paletteIndex: number,
    readonly sourceColor: Color,
    readonly pixelAbsorptions: ReadonlyArray<PixelAbsorption>,
  ) {}

  execute(): void {
    const layers = this.layerService.layers();
    for (const { layerIndex, byteOffset, targetColor } of this.pixelAbsorptions) {
      const data = layers[layerIndex]?.data;
      if (!data) continue;
      data[byteOffset]     = targetColor.r;
      data[byteOffset + 1] = targetColor.g;
      data[byteOffset + 2] = targetColor.b;
      data[byteOffset + 3] = targetColor.a;
    }
    this.colorService.removeFromPalette(this.paletteIndex);
    this.layerService.notifyLayersChanged();
  }

  undo(): void {
    this.colorService.insertPaletteColorAt(this.paletteIndex, this.sourceColor);
    const layers = this.layerService.layers();
    for (const { layerIndex, byteOffset } of this.pixelAbsorptions) {
      const data = layers[layerIndex]?.data;
      if (!data) continue;
      data[byteOffset]     = this.sourceColor.r;
      data[byteOffset + 1] = this.sourceColor.g;
      data[byteOffset + 2] = this.sourceColor.b;
      data[byteOffset + 3] = this.sourceColor.a;
    }
    this.layerService.notifyLayersChanged();
  }
}
