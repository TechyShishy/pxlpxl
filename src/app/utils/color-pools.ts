import type { Color } from '../models/color.model';
import { hexToColor } from '../models/color.model';
import delicaBeads from '../../assets/data/delica-beads.json';

// ── Color pool types ──────────────────────────────────────────────────────────

/** Identifier for a constrained color pool used during quantization. */
export type ColorPoolId = 'any' | 'delica';

// ── Delica pool ───────────────────────────────────────────────────────────────

const DELICA_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(delicaBeads).map(([code, bead]) => [code, bead.hex]),
);

/** Lazily converted + cached Delica Color[]. */
let delicaCache: Color[] | null = null;

/** Lazily built reverse map: 6-char hex (lowercase, no #) → DB code. */
let delicaReverseCache: Map<string, string> | null = null;

/**
 * Return the Miyuki Delica DB code (e.g. `"DB0031"`) that best matches the
 * given color by RGB value, or `null` if no catalog entry matches.
 *
 * Alpha is intentionally ignored because all catalog entries are fully opaque.
 */
export function colorToDbCode(color: Color): string | null {
  if (delicaReverseCache === null) {
    delicaReverseCache = new Map<string, string>();
    for (const [code, hex] of Object.entries(DELICA_MAP)) {
      // Values are 6-char hex strings like "#424145"; normalize to 6 lowercase chars without #.
      const normalized = hex.replace('#', '').toLowerCase().substring(0, 6);
      if (!delicaReverseCache.has(normalized)) {
        delicaReverseCache.set(normalized, code);
      }
    }
  }
  const key =
    color.r.toString(16).padStart(2, '0') +
    color.g.toString(16).padStart(2, '0') +
    color.b.toString(16).padStart(2, '0');
  return delicaReverseCache.get(key) ?? null;
}

/**
 * Return the hex string (e.g. `"#23242d"`) for a Miyuki Delica DB code, or
 * `null` if the code is not in the catalog. The lookup is case-insensitive.
 */
export function dbCodeToHex(code: string): string | null {
  const normalized = code.toUpperCase();
  const hex = DELICA_MAP[normalized];
  return hex ?? null;
}

/**
 * Return all Miyuki Delica bead colors as an RGBA `Color[]` (a = 255).
 *
 * The result is computed once and cached for subsequent calls.
 */
export function getDelicaColorPool(): Color[] {
  if (delicaCache === null) {
    delicaCache = Object.values(DELICA_MAP).map((hex) => hexToColor(hex));
  }
  return delicaCache;
}

// ── Default Delica palette ───────────────────────────────────────────────────

/** Look up a DB code from the catalog and return a frozen Color. Throws at module load if the code is absent. */
function catalogColor(code: string): Readonly<Color> {
  const bead = (delicaBeads as Record<string, { hex: string }>)[code];
  if (!bead) throw new Error(`DEFAULT_DELICA_PALETTE: DB code not found in catalog: ${code}`);
  return Object.freeze(hexToColor(bead.hex));
}

/**
 * A curated 16-color starting palette drawn from the Miyuki Delica catalog.
 * Covers the full hue spectrum (black, grays, white + 12 vivid hues) and is
 * suitable as an initial project palette when working with Delica beads.
 *
 * Hex values are resolved from the catalog at module load — the DB codes are
 * the source of truth, not hardcoded hex constants.
 */
export const DEFAULT_DELICA_PALETTE: readonly Readonly<Color>[] = Object.freeze([
  catalogColor('DB0010'), // Black
  catalogColor('DB1818'), // Dark Gray
  catalogColor('DB0168'), // Gray
  catalogColor('DB2204'), // White
  catalogColor('DB0757'), // Red
  catalogColor('DB0744'), // Orange
  catalogColor('DB1583'), // Yellow
  catalogColor('DB2121'), // Yellow-Green
  catalogColor('DB2126'), // Green
  catalogColor('DB0655'), // Forest Green
  catalogColor('DB2505'), // Teal
  catalogColor('DB1304'), // Cyan
  catalogColor('DB0787'), // Blue
  catalogColor('DB0661'), // Indigo
  catalogColor('DB1315'), // Violet
  catalogColor('DB1310'), // Magenta
]);

// ── Pool dispatcher ───────────────────────────────────────────────────────────

/**
 * Resolve a `ColorPoolId` to the corresponding `Color[]`, or `undefined` when
 * the pool is unconstrained (`'any'`).
 */
export function getColorPool(id: ColorPoolId): Color[] | undefined {
  switch (id) {
    case 'delica':
      return getDelicaColorPool();
    case 'any':
    default:
      return undefined;
  }
}
