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
