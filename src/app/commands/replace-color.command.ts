import type { Command, Color } from '../models';
import { ColorService } from '../services/color.service';
import { LayerService } from '../services/layer.service';

export interface AffectedPixel {
  layerIndex: number;
  byteOffset: number;
}

/**
 * Replaces every pixel in every layer that matches `oldColor` with `newColor`,
 * and simultaneously updates the corresponding palette entry.
 * Fully supports undo/redo.
 */
export class ReplaceColorCommand implements Command {
  readonly description = 'Replace palette color';

  /** Lazily populated on first execute(). Exposed for serialization. */
  affected: AffectedPixel[] | null = null;

  constructor(
    private readonly layerService: LayerService,
    private readonly colorService: ColorService,
    readonly paletteIndex: number,
    readonly oldColor: Color,
    readonly newColor: Color,
  ) {}

  execute(): void {
    if (this.affected === null) {
      this.affected = this.scanAffected();
    }
    this.applyColor(this.newColor);
    this.colorService.updatePaletteColor(this.paletteIndex, this.newColor);
    this.layerService.notifyLayersChanged();
  }

  undo(): void {
    this.applyColor(this.oldColor);
    this.colorService.updatePaletteColor(this.paletteIndex, this.oldColor);
    this.layerService.notifyLayersChanged();
  }

  private scanAffected(): AffectedPixel[] {
    const result: AffectedPixel[] = [];
    const layers = this.layerService.layers();
    for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
      const data = layers[layerIndex].data;
      for (let i = 0; i < data.length; i += 4) {
        if (
          data[i] === this.oldColor.r &&
          data[i + 1] === this.oldColor.g &&
          data[i + 2] === this.oldColor.b &&
          data[i + 3] === this.oldColor.a
        ) {
          result.push({ layerIndex, byteOffset: i });
        }
      }
    }
    return result;
  }

  private applyColor(color: Color): void {
    if (!this.affected) return;
    const layers = this.layerService.layers();
    for (const { layerIndex, byteOffset } of this.affected) {
      const data = layers[layerIndex]?.data;
      if (!data) continue;
      data[byteOffset] = color.r;
      data[byteOffset + 1] = color.g;
      data[byteOffset + 2] = color.b;
      data[byteOffset + 3] = color.a;
    }
  }
}
