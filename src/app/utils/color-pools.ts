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
