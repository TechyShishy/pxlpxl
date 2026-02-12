import { Injectable, signal, computed } from '@angular/core';
import { Color, BLACK, WHITE, DEFAULT_PALETTE } from '../models';

@Injectable({ providedIn: 'root' })
export class ColorService {
  readonly primaryColor = signal<Color>({ ...BLACK });
  readonly secondaryColor = signal<Color>({ ...WHITE });
  readonly palette = signal<Color[]>([...DEFAULT_PALETTE]);

  readonly primaryColorHex = computed(() => {
    const c = this.primaryColor();
    return this.toHex(c);
  });

  readonly secondaryColorHex = computed(() => {
    const c = this.secondaryColor();
    return this.toHex(c);
  });

  setPrimaryColor(color: Color): void {
    this.primaryColor.set({ ...color });
  }

  setSecondaryColor(color: Color): void {
    this.secondaryColor.set({ ...color });
  }

  swapColors(): void {
    const primary = this.primaryColor();
    const secondary = this.secondaryColor();
    this.primaryColor.set(secondary);
    this.secondaryColor.set(primary);
  }

  addToPalette(color: Color): void {
    this.palette.update((p) => [...p, { ...color }]);
  }

  removeFromPalette(index: number): void {
    this.palette.update((p) => p.filter((_, i) => i !== index));
  }

  updatePaletteColor(index: number, color: Color): void {
    this.palette.update((p) => p.map((c, i) => (i === index ? { ...color } : c)));
  }

  setPalette(colors: Color[]): void {
    this.palette.set(colors.map((c) => ({ ...c })));
  }

  private toHex(c: Color): string {
    const hex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`;
  }
}
