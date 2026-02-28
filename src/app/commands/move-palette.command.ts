import { Command } from '../models';
import { ColorService } from '../services/color.service';

/**
 * Command that moves a palette entry from one index to another.
 * Undoing restores the palette to its original order.
 */
export class MovePaletteCommand implements Command {
  readonly description = 'Move palette entry';

  constructor(
    private readonly colorService: ColorService,
    /** Original index of the palette entry before the move. */
    readonly fromIndex: number,
    /** Destination index of the palette entry after the move. */
    readonly toIndex: number,
  ) {}

  execute(): void {
    this.colorService.movePaletteEntry(this.fromIndex, this.toIndex);
  }

  undo(): void {
    this.colorService.movePaletteEntry(this.toIndex, this.fromIndex);
  }
}
