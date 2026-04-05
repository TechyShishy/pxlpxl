import { z } from 'zod';
import type { Color } from './color.model';
import { colorToHex, hexToColor, TRANSPARENT } from './color.model';
import delicaBeads from '../../assets/data/delica-beads.json';

const DELICA_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(delicaBeads).map(([code, bead]) => [code, bead.hex]),
);

// ── RGP zod schemas ───────────────────────────────────────────────────

export const RgpStepSchema = z.object({
  id: z.number().int(),
  count: z.number().int().positive(),
  description: z.string(),
});

export const RgpRowSchema = z.object({
  id: z.number().int(),
  steps: z.array(RgpStepSchema),
});

export const RgpProjectSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  rows: z.array(RgpRowSchema),
  position: z
    .object({
      row: z.number().int(),
      step: z.number().int(),
    })
    .optional(),
  firstLastAppearanceMap: z
    .record(
      z.string(),
      z.object({
        key: z.string(),
        firstAppearance: z.array(z.number()),
        lastAppearance: z.array(z.number()),
        count: z.number().int(),
        color: z.string().optional(),
        hexColor: z.string().optional(),
      }),
    )
    .optional(),
  colorMapping: z.record(z.string(), z.string()).optional(),
  markedSteps: z.record(z.string(), z.record(z.string(), z.number())).optional(),
  markedRows: z.record(z.string(), z.number()).optional(),
  // image may appear in serialized form as unknown payload — accepted but not typed
  image: z.unknown().optional(),
});

export type RgpStep = z.infer<typeof RgpStepSchema>;
export type RgpRow = z.infer<typeof RgpRowSchema>;
export type RgpProject = z.infer<typeof RgpProjectSchema>;

// ── Palette letter helpers ────────────────────────────────────────────

/**
 * Assign letters A, B, C… (then AA, AB… for > 26 colors) to each palette
 * entry. Returns a Map keyed by 8-digit hex color string.
 */
export function buildPaletteLetterMap(palette: Color[]): Map<string, string> {
  const map = new Map<string, string>();
  palette.forEach((color, index) => {
    map.set(colorToHex(color), indexToLetter(index));
  });
  return map;
}

/**
 * Look up the Color for a step description letter using the project's
 * colorMapping (letter → hex or DB code). Returns TRANSPARENT if not found.
 *
 * Supported colorMapping value formats:
 *   - Hex string starting with `#`  (e.g. `#ff0000ff`) — used directly.
 *   - Delica part number starting with `DB` (e.g. `DB0001`) — resolved via
 *     the bundled Miyuki Delica catalog; returns TRANSPARENT if the code is
 *     not in the catalog.
 */
export function letterToColor(
  letter: string,
  colorMapping: Record<string, string>,
): Color {
  const value = colorMapping[letter];
  if (!value) return { ...TRANSPARENT };

  if (value.startsWith('#')) {
    return hexToColor(value);
  }

  if (value.startsWith('DB')) {
    const catalogHex = DELICA_COLORS[value];
    if (!catalogHex) return { ...TRANSPARENT };
    return hexToColor(catalogHex);
  }

  return { ...TRANSPARENT };
}

/** Convert a 0-based palette index to a label: 0→A, 25→Z, 26→AA, 27→AB… */
function indexToLetter(index: number): string {
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (index < 26) return ALPHA[index];
  const outer = Math.floor(index / 26) - 1;
  const inner = index % 26;
  return ALPHA[outer] + ALPHA[inner];
}
