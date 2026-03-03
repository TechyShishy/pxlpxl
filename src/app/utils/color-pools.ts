import type { Color } from '../models/color.model';
import { hexToColor } from '../models/color.model';
import delicaColors from '../../assets/data/delica-colors.json';

// ── Color pool types ──────────────────────────────────────────────────────────

/** Identifier for a constrained color pool used during quantization. */
export type ColorPoolId = 'any' | 'delica';

// ── Delica pool ───────────────────────────────────────────────────────────────

const DELICA_MAP: Record<string, string> = delicaColors as Record<string, string>;

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

/**
 * A curated 16-color starting palette drawn from the Miyuki Delica catalog.
 * Covers the full hue spectrum (black, grays, white + 12 vivid hues) and is
 * suitable as an initial project palette when working with Delica beads.
 *
 * Sources (DB code → hex):
 *   DB0010 #211d1e  DB1818 #424040  DB0168 #81807c  DB2204 #ffffff
 *   DB0757 #e41321  DB0744 #fa6a02  DB1583 #fc9902  DB2121 #6fbf0b
 *   DB2126 #328a31  DB0655 #1b7f36  DB2505 #0f8162  DB1304 #0bb6ab
 *   DB0787 #036dd0  DB0661 #5453c1  DB1315 #451576  DB1310 #d90988
 */
export const DEFAULT_DELICA_PALETTE: readonly Readonly<Color>[] = Object.freeze([
  Object.freeze(hexToColor('#211d1e')), // DB0010 — Black
  Object.freeze(hexToColor('#424040')), // DB1818 — Dark Gray
  Object.freeze(hexToColor('#81807c')), // DB0168 — Gray
  Object.freeze(hexToColor('#ffffff')), // DB2204 — White
  Object.freeze(hexToColor('#e41321')), // DB0757 — Red
  Object.freeze(hexToColor('#fa6a02')), // DB0744 — Orange
  Object.freeze(hexToColor('#fc9902')), // DB1583 — Yellow
  Object.freeze(hexToColor('#6fbf0b')), // DB2121 — Yellow-Green
  Object.freeze(hexToColor('#328a31')), // DB2126 — Green
  Object.freeze(hexToColor('#1b7f36')), // DB0655 — Forest Green
  Object.freeze(hexToColor('#0f8162')), // DB2505 — Teal
  Object.freeze(hexToColor('#0bb6ab')), // DB1304 — Cyan
  Object.freeze(hexToColor('#036dd0')), // DB0787 — Blue
  Object.freeze(hexToColor('#5453c1')), // DB0661 — Indigo
  Object.freeze(hexToColor('#451576')), // DB1315 — Violet
  Object.freeze(hexToColor('#d90988')), // DB1310 — Magenta
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
