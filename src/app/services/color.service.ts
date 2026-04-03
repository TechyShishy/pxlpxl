import { Injectable, signal, computed, inject } from '@angular/core';
import { Color, BLACK, WHITE, DEFAULT_PALETTE, colorsEqual, deduplicateColorList } from '../models';
import { colorToDbCode } from '../utils/color-pools';
import { LayerService } from './layer.service';
import { HistoryService } from './history.service';
import { SortPaletteCommand } from '../commands/sort-palette.command';

@Injectable({ providedIn: 'root' })
export class ColorService {
  private readonly layerService = inject(LayerService);
  private readonly historyService = inject(HistoryService);

  private readonly _primaryColor = signal<Color>({ ...BLACK });
  private readonly _secondaryColor = signal<Color>({ ...WHITE });
  private readonly _palette = signal<Color[]>([...DEFAULT_PALETTE]);

  readonly primaryColor = this._primaryColor.asReadonly();
  readonly secondaryColor = this._secondaryColor.asReadonly();
  readonly palette = this._palette.asReadonly();

  /**
   * Pixel count per palette index across all layers.
   * Recomputes lazily when the palette or any layer changes.
   * Used by orphan-mode to flag low-usage palette entries.
   */
  readonly palettePixelCounts = computed<Map<number, number>>(() => {
    const palette = this._palette();
    const counts = new Map<number, number>();
    for (let i = 0; i < palette.length; i++) counts.set(i, 0);
    for (const layer of this.layerService.layers()) {
      const data = layer.data;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) continue;
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        for (let pi = 0; pi < palette.length; pi++) {
          const c = palette[pi];
          if (c.r === r && c.g === g && c.b === b && c.a === a) {
            counts.set(pi, (counts.get(pi) ?? 0) + 1);
            break;
          }
        }
      }
    }
    return counts;
  });

  readonly primaryColorHex = computed(() => {
    const c = this._primaryColor();
    return this.toHex(c);
  });

  readonly secondaryColorHex = computed(() => {
    const c = this._secondaryColor();
    return this.toHex(c);
  });

  /** 6-char `#rrggbb` hex of the primary color (no alpha). */
  readonly primaryColorHexShort = this.primaryColorHex;

  /** Miyuki Delica DB code for the primary color, or `null` if not in catalog. */
  readonly primaryColorDbCode = computed(() => colorToDbCode(this._primaryColor()));

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

  /** Re-insert `color` at `index`, shifting later entries right. Used by undo of AbsorbColorCommand. */
  insertPaletteColorAt(index: number, color: Color): void {
    this._palette.update((p) => {
      const next = [...p];
      next.splice(index, 0, { ...color });
      return next;
    });
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

  /**
   * Sort the palette by pixel count descending (colors appearing most across all layers first).
   * Colors with equal counts retain their relative order. Executes as an undoable command.
   */
  sortPaletteByPixelCount(): void {
    const before = this._palette();
    if (before.length <= 1) return;

    const pixelCountMap = this.palettePixelCounts();
    const counts = new Map<number, number>();
    for (let i = 0; i < before.length; i++) counts.set(i, pixelCountMap.get(i) ?? 0);

    const indices = Array.from({ length: before.length }, (_, i) => i);
    indices.sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));

    const sorted = indices.map((i) => before[i]);
    const alreadySorted = sorted.every((c, i) => colorsEqual(c, before[i]));
    const after = alreadySorted ? [...before].reverse() : sorted;
    if (after.every((c, i) => colorsEqual(c, before[i]))) return;

    this.historyService.execute(
      new SortPaletteCommand(this, before, after,
        alreadySorted ? 'Sort palette by pixel count (reversed)' : 'Sort palette by pixel count'),
    );
  }

  /**
   * Sort the palette by Miyuki Delica DB code ascending; colors with no code sort to the end.
   * Executes as an undoable command.
   */
  sortPaletteByDbCode(): void {
    const before = this._palette();
    if (before.length <= 1) return;

    const codes = before.map((c) => colorToDbCode(c));
    const indices = Array.from({ length: before.length }, (_, i) => i);
    indices.sort((a, b) => {
      const ca = codes[a], cb = codes[b];
      if (ca === null && cb === null) return 0;
      if (ca === null) return 1;
      if (cb === null) return -1;
      return ca.localeCompare(cb, undefined, { numeric: true, sensitivity: 'base' });
    });

    const sorted = indices.map((i) => before[i]);
    const alreadySorted = sorted.every((c, i) => colorsEqual(c, before[i]));
    const after = alreadySorted ? [...before].reverse() : sorted;
    if (after.every((c, i) => colorsEqual(c, before[i]))) return;

    this.historyService.execute(
      new SortPaletteCommand(this, before, after,
        alreadySorted ? 'Sort palette by DB code (reversed)' : 'Sort palette by DB code'),
    );
  }

  /**
   * Sort the palette by hue (HSL) ascending.
   * Achromatic colors (saturation < 5 %) sort after chromatic ones, ordered light → dark.
   * Fully transparent colors sort last.
   * Executes as an undoable command.
   */
  sortPaletteByColor(): void {
    const before = this._palette();
    if (before.length <= 1) return;

    const toHsl = (c: Color): { h: number; s: number; l: number } => {
      const r = c.r / 255, g = c.g / 255, b = c.b / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const l = (max + min) / 2;
      if (max === min) return { h: 0, s: 0, l };
      const d = max - min;
      const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      let h: number;
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
      return { h, s, l };
    };

    const keys = before.map((c, i) => ({ i, ...toHsl(c), a: c.a }));
    keys.sort((x, y) => {
      if (x.a === 0 && y.a !== 0) return 1;
      if (y.a === 0 && x.a !== 0) return -1;
      const xGray = x.s < 0.05, yGray = y.s < 0.05;
      if (xGray && !yGray) return 1;
      if (!xGray && yGray) return -1;
      if (xGray && yGray) return x.l - y.l;
      if (Math.abs(x.h - y.h) > 1e-9) return x.h - y.h;
      if (Math.abs(x.s - y.s) > 1e-9) return y.s - x.s;
      return x.l - y.l;
    });

    const sorted = keys.map(({ i }) => before[i]);
    const alreadySorted = sorted.every((c, i) => colorsEqual(c, before[i]));
    const after = alreadySorted ? [...before].reverse() : sorted;
    if (after.every((c, i) => colorsEqual(c, before[i]))) return;

    this.historyService.execute(
      new SortPaletteCommand(this, before, after,
        alreadySorted ? 'Sort palette by color (reversed)' : 'Sort palette by color'),
    );
  }

  /**
   * Remove palette entries that are not referenced by any pixel across all layers.
   * Executes as an undoable command. No-ops when every palette color is in use.
   * Always retains at least one palette entry.
   */
  cleanUnusedColors(): void {
    const before = this._palette();
    if (before.length <= 1) return;

    const usedKeys = new Set<number>();
    for (const layer of this.layerService.layers()) {
      const data = layer.data;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) continue;
        usedKeys.add((data[i] | (data[i + 1] << 8) | (data[i + 2] << 16) | (data[i + 3] << 24)) >>> 0);
      }
    }

    const filtered = before.filter(
      (c) => usedKeys.has(((c.r | (c.g << 8) | (c.b << 16) | (c.a << 24)) >>> 0)),
    );

    // Always keep at least one entry
    const after = filtered.length > 0 ? filtered : [before[0]];

    if (after.length === before.length && after.every((c, i) => colorsEqual(c, before[i]))) return;

    this.historyService.execute(
      new SortPaletteCommand(this, before, after, 'Clean unused colors'),
    );
  }

  private toHex(c: Color): string {
    const hex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`;
  }
}
