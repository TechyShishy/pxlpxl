import { Injectable, signal, computed } from '@angular/core';
import { Color, BLACK, WHITE, DEFAULT_PALETTE, colorsEqual, deduplicateColorList } from '../models';

@Injectable({ providedIn: 'root' })
export class ColorService {
  private readonly _primaryColor = signal<Color>({ ...BLACK });
  private readonly _secondaryColor = signal<Color>({ ...WHITE });
  private readonly _palette = signal<Color[]>([...DEFAULT_PALETTE]);

  readonly primaryColor = this._primaryColor.asReadonly();
  readonly secondaryColor = this._secondaryColor.asReadonly();
  readonly palette = this._palette.asReadonly();

  readonly primaryColorHex = computed(() => {
    const c = this._primaryColor();
    return this.toHex(c);
  });

  readonly secondaryColorHex = computed(() => {
    const c = this._secondaryColor();
    return this.toHex(c);
  });

  setPrimaryColor(color: Color): void {
    this._primaryColor.set({ ...color });
  }

  setSecondaryColor(color: Color): void {
    this._secondaryColor.set({ ...color });
  }

  swapColors(): void {
    const primary = { ...this._primaryColor() };
    const secondary = { ...this._secondaryColor() };
    this._primaryColor.set(secondary);
    this._secondaryColor.set(primary);
  }

  addToPalette(color: Color): void {
    this._palette.update((p) => [...p, { ...color }]);
  }

  removeFromPalette(index: number): void {
    this._palette.update((p) => p.filter((_, i) => i !== index));
  }

  updatePaletteColor(index: number, color: Color): void {
    this._palette.update((p) => p.map((c, i) => (i === index ? { ...color } : c)));
  }

  setPalette(colors: readonly Readonly<Color>[]): void {
    this._palette.set(colors.map((c) => ({ ...c })));
  }

  movePaletteEntry(from: number, to: number): void {
    this._palette.update((p) => {
      if (from < 0 || from >= p.length || to < 0 || to >= p.length) {
        return p;
      }
      const updated = [...p];
      const [item] = updated.splice(from, 1);
      updated.splice(to, 0, item);
      return updated;
    });
  }

  /**
   * Add each color in `colors` to the palette if it is not already present.
   * Existing palette entries are preserved.
   */
  mergePalette(colors: Color[]): void {
    if (colors.length === 0) return;
    const current = this._palette();
    const toAdd = deduplicateColorList(colors).filter(
      (c) => !current.some((p) => colorsEqual(p, c)),
    );
    if (toAdd.length > 0) {
      this._palette.update((p) => [...p, ...toAdd.map((c) => ({ ...c }))]);
    }
  }

  private toHex(c: Color): string {
    const hex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`;
  }
}
