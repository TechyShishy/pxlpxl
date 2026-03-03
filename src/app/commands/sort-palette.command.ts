import { Command } from '../models';
import { Color } from '../models';
import { ColorService } from '../services/color.service';

/**
 * Command that replaces the palette with a sorted copy.
 * Undoing restores the palette to its original order.
 */
export class SortPaletteCommand implements Command {
  constructor(
    private readonly colorService: ColorService,
    readonly beforePalette: readonly Readonly<Color>[],
    readonly afterPalette: readonly Readonly<Color>[],
    readonly description: string,
  ) {}

  execute(): void {
    this.colorService.setPalette(this.afterPalette);
  }

  undo(): void {
    this.colorService.setPalette(this.beforePalette);
  }
}
