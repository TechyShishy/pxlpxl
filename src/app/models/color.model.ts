export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function colorToRgba(color: Color): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`;
}

export function colorToHex(color: Color): string {
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}${hex(color.a)}`;
}

export function hexToColor(hex: string): Color {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
    a: h.length >= 8 ? parseInt(h.substring(6, 8), 16) : 255,
  };
}

export function colorsEqual(a: Color, b: Color): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}

/**
 * Extract all unique non-transparent colors from a flat RGBA Uint8ClampedArray buffer.
 * Fully transparent pixels (a === 0) are skipped.
 */
export function extractUniqueColors(data: Uint8ClampedArray): Color[] {
  const seen = new Set<string>();
  const result: Color[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 0) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = `${r},${g},${b},${a}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ r, g, b, a });
    }
  }
  return result;
}

/** Returns true if the given color already exists in the palette. */
export function colorInPalette(color: Color, palette: Color[]): boolean {
  return palette.some((p) => colorsEqual(p, color));
}

/**
 * Deduplicate a `Color[]` array, preserving insertion order.
 * Unlike `extractUniqueColors`, this accepts an already-decoded `Color[]`
 * and does not skip transparent entries.
 */
export function deduplicateColorList(colors: Color[]): Color[] {
  const seen = new Set<string>();
  const result: Color[] = [];
  for (const c of colors) {
    const key = `${c.r},${c.g},${c.b},${c.a}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(c);
    }
  }
  return result;
}

export const TRANSPARENT: Color = { r: 0, g: 0, b: 0, a: 0 };
export const BLACK: Color = { r: 0, g: 0, b: 0, a: 255 };
export const WHITE: Color = { r: 255, g: 255, b: 255, a: 255 };

/** A default 16-color palette suitable for pixel art */
export const DEFAULT_PALETTE: Color[] = [
  { r: 0, g: 0, b: 0, a: 255 }, // Black
  { r: 255, g: 255, b: 255, a: 255 }, // White
  { r: 128, g: 128, b: 128, a: 255 }, // Gray
  { r: 192, g: 192, b: 192, a: 255 }, // Silver
  { r: 255, g: 0, b: 0, a: 255 }, // Red
  { r: 0, g: 255, b: 0, a: 255 }, // Green
  { r: 0, g: 0, b: 255, a: 255 }, // Blue
  { r: 255, g: 255, b: 0, a: 255 }, // Yellow
  { r: 255, g: 0, b: 255, a: 255 }, // Magenta
  { r: 0, g: 255, b: 255, a: 255 }, // Cyan
  { r: 128, g: 0, b: 0, a: 255 }, // Maroon
  { r: 0, g: 128, b: 0, a: 255 }, // Dark Green
  { r: 0, g: 0, b: 128, a: 255 }, // Navy
  { r: 128, g: 128, b: 0, a: 255 }, // Olive
  { r: 128, g: 0, b: 128, a: 255 }, // Purple
  { r: 0, g: 128, b: 128, a: 255 }, // Teal
];
