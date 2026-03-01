import type { Color } from '../models/color.model';
import { deduplicateColorList } from '../models/color.model';

// ── Distance ──────────────────────────────────────────────────────────────────

/**
 * Squared Euclidean distance between two RGBA colors.
 * Using squared distance avoids a sqrt and is monotonically equivalent for
 * comparison purposes.
 */
export function colorDistance(a: Color, b: Color): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  const da = a.a - b.a;
  return dr * dr + dg * dg + db * db + da * da;
}

/**
 * Return the element of `palette` closest to `color` by squared Euclidean
 * distance in RGBA space. Assumes `palette` is non-empty.
 */
export function nearestColor(color: Color, palette: Color[]): Color {
  let best = palette[0];
  let bestDist = colorDistance(color, best);
  for (let i = 1; i < palette.length; i++) {
    const d = colorDistance(color, palette[i]);
    if (d < bestDist) {
      bestDist = d;
      best = palette[i];
    }
  }
  return best;
}

/** Produce a string key for deduplication of a Color. */
export function colorKey(c: Color): string {
  return `${c.r},${c.g},${c.b},${c.a}`;
}

/**
 * Return the element of `pool` closest to `color` that has not already been
 * claimed by a previous caller. The `used` set tracks color keys that are
 * already taken.
 *
 * If every pool entry is already used (pool exhausted), falls back to
 * `nearestColor(color, pool)` so the result is always valid.
 */
export function nearestUnusedColor(
  color: Color,
  pool: Color[],
  used: Set<string>,
): Color {
  let best: Color | null = null;
  let bestDist = Infinity;
  for (const candidate of pool) {
    const key = colorKey(candidate);
    if (used.has(key)) continue;
    const d = colorDistance(color, candidate);
    if (d < bestDist) {
      bestDist = d;
      best = candidate;
    }
  }
  // Fallback if the pool is exhausted.
  if (best === null) return nearestColor(color, pool);
  return best;
}

// ── Median cut ────────────────────────────────────────────────────────────────

type Channel = 'r' | 'g' | 'b' | 'a';
const CHANNELS: Channel[] = ['r', 'g', 'b', 'a'];

function bucketRepresentative(bucket: Color[]): Color {
  const n = bucket.length;
  let r = 0, g = 0, b = 0, a = 0;
  for (const c of bucket) {
    r += c.r; g += c.g; b += c.b; a += c.a;
  }
  return {
    r: Math.round(r / n),
    g: Math.round(g / n),
    b: Math.round(b / n),
    a: Math.round(a / n),
  };
}

function channelRange(bucket: Color[], ch: Channel): number {
  let min = 255, max = 0;
  for (const c of bucket) {
    if (c[ch] < min) min = c[ch];
    if (c[ch] > max) max = c[ch];
  }
  return max - min;
}

function widestChannel(bucket: Color[]): Channel {
  let best: Channel = 'r';
  let bestRange = 0;
  for (const ch of CHANNELS) {
    const r = channelRange(bucket, ch);
    if (r > bestRange) { bestRange = r; best = ch; }
  }
  return best;
}

/**
 * Median-cut color quantization.
 *
 * Returns up to `n` representative colors for the given pixel array. If the
 * input already has ≤ n unique colors, those exact colors are returned without
 * modification.
 *
 * When `colorPool` is provided, each bucket representative is snapped to the
 * nearest *unused* pool entry so that the resulting palette only contains
 * colors from the pool. If two buckets would snap to the same pool color, the
 * later bucket picks the next-closest unused entry, preserving the target
 * palette size (up to the pool size).
 *
 * @param pixels    Non-transparent pixels sampled from the image.
 * @param n         Maximum number of palette entries to produce.
 * @param colorPool Optional constrained color pool.
 */
export function medianCut(
  pixels: Color[],
  n: number,
  colorPool?: Color[],
): Color[] {
  if (n <= 0 || pixels.length === 0) return [];
  if (pixels.length <= n) {
    if (colorPool && colorPool.length > 0) {
      const used = new Set<string>();
      return deduplicateColorList(pixels).map((c) => {
        const snapped = nearestUnusedColor(c, colorPool, used);
        used.add(colorKey(snapped));
        return snapped;
      });
    }
    return [...pixels];
  }

  // Work with a deduplicated copy to keep buckets small.
  const unique = deduplicateColorList(pixels);
  if (unique.length <= n) {
    if (colorPool && colorPool.length > 0) {
      const used = new Set<string>();
      return unique.map((c) => {
        const snapped = nearestUnusedColor(c, colorPool, used);
        used.add(colorKey(snapped));
        return snapped;
      });
    }
    return unique;
  }

  let buckets: Color[][] = [unique];

  while (buckets.length < n) {
    // Pick the bucket with the greatest range in its widest channel.
    let splitIdx = 0;
    let splitRange = 0;
    for (let i = 0; i < buckets.length; i++) {
      const ch = widestChannel(buckets[i]);
      const r = channelRange(buckets[i], ch);
      if (r > splitRange) { splitRange = r; splitIdx = i; }
    }

    const bucket = buckets[splitIdx];
    if (bucket.length <= 1 || splitRange === 0) break; // can't split further

    const ch = widestChannel(bucket);
    const sorted = [...bucket].sort((a, b) => a[ch] - b[ch]);
    const mid = Math.floor(sorted.length / 2);

    buckets.splice(splitIdx, 1, sorted.slice(0, mid), sorted.slice(mid));
  }

  const representatives = buckets.map(bucketRepresentative);

  if (colorPool && colorPool.length > 0) {
    // Snap each representative to the nearest unused pool color.
    const used = new Set<string>();
    return representatives.map((rep) => {
      const snapped = nearestUnusedColor(rep, colorPool, used);
      used.add(colorKey(snapped));
      return snapped;
    });
  }

  return representatives;
}

// ── K-means ───────────────────────────────────────────────────────────────────

/**
 * K-means++ color quantization.
 *
 * Returns exactly `n` (or fewer if there are fewer unique input colors)
 * representative colors. Runs until convergence or `maxIter` iterations.
 *
 * When `colorPool` is provided the algorithm is pool-constrained:
 * - Initialisation picks starting centroids from `colorPool` via k-means++
 *   distance weighting.
 * - Each M-step snaps the raw mean centroid to the nearest *unused* pool
 *   entry, preventing centroid collapse onto a single pool color.
 *
 * @param pixels    Non-transparent pixels sampled from the image.
 * @param n         Number of palette entries.
 * @param maxIter   Maximum iterations (default 20).
 * @param colorPool Optional constrained color pool.
 */
export function kMeans(
  pixels: Color[],
  n: number,
  maxIter = 20,
  colorPool?: Color[],
): Color[] {
  if (n <= 0 || pixels.length === 0) return [];

  const unique = deduplicateColorList(pixels);
  if (unique.length <= n) {
    if (colorPool && colorPool.length > 0) {
      const used = new Set<string>();
      return unique.map((c) => {
        const snapped = nearestUnusedColor(c, colorPool, used);
        used.add(colorKey(snapped));
        return snapped;
      });
    }
    return unique;
  }

  const pool = colorPool && colorPool.length > 0 ? colorPool : undefined;

  // Source for initial centroid selection: pool (if constrained) or unique.
  const initSource = pool ?? unique;

  // k-means++ initialisation.
  const centroids: Color[] = [
    initSource[Math.floor(Math.random() * initSource.length)],
  ];
  while (centroids.length < n) {
    // Weight each candidate by its squared distance to the nearest centroid.
    const weights = initSource.map((c) => {
      let minDist = Infinity;
      for (const centroid of centroids) {
        const d = colorDistance(c, centroid);
        if (d < minDist) minDist = d;
      }
      return minDist;
    });
    const total = weights.reduce((s, w) => s + w, 0);
    if (total === 0) break;

    let rand = Math.random() * total;
    let chosen = initSource[initSource.length - 1];
    for (let i = 0; i < initSource.length; i++) {
      rand -= weights[i];
      if (rand <= 0) { chosen = initSource[i]; break; }
    }
    centroids.push(chosen);
  }

  // Iterative refinement.
  const assignments = new Int32Array(unique.length).fill(-1);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;

    // E-step: assign each unique color to nearest centroid.
    for (let i = 0; i < unique.length; i++) {
      let best = 0;
      let bestDist = colorDistance(unique[i], centroids[0]);
      for (let j = 1; j < centroids.length; j++) {
        const d = colorDistance(unique[i], centroids[j]);
        if (d < bestDist) { bestDist = d; best = j; }
      }
      if (assignments[i] !== best) { assignments[i] = best; changed = true; }
    }
    if (!changed) break;

    // M-step: recompute centroids as mean of assigned colors.
    const sums = Array.from({ length: centroids.length }, () => ({ r: 0, g: 0, b: 0, a: 0, count: 0 }));
    for (let i = 0; i < unique.length; i++) {
      const s = sums[assignments[i]];
      s.r += unique[i].r; s.g += unique[i].g;
      s.b += unique[i].b; s.a += unique[i].a;
      s.count++;
    }

    if (pool) {
      // Pool-constrained: snap each raw mean to the nearest unused pool color.
      const used = new Set<string>();
      for (let j = 0; j < centroids.length; j++) {
        const s = sums[j];
        const rawMean: Color = s.count > 0
          ? {
              r: Math.round(s.r / s.count),
              g: Math.round(s.g / s.count),
              b: Math.round(s.b / s.count),
              a: Math.round(s.a / s.count),
            }
          : centroids[j];
        const snapped = nearestUnusedColor(rawMean, pool, used);
        used.add(colorKey(snapped));
        centroids[j] = snapped;
      }
    } else {
      for (let j = 0; j < centroids.length; j++) {
        const s = sums[j];
        if (s.count > 0) {
          centroids[j] = {
            r: Math.round(s.r / s.count),
            g: Math.round(s.g / s.count),
            b: Math.round(s.b / s.count),
            a: Math.round(s.a / s.count),
          };
        }
      }
    }
  }

  return centroids;
}

// ── Buffer remapping ──────────────────────────────────────────────────────────

/**
 * Return a copy of `buffer` with every non-transparent pixel remapped to the
 * closest entry in `palette`.
 *
 * Fully transparent pixels (a === 0) are written as `{0, 0, 0, 0}`.
 */
export function quantizeBuffer(buffer: Uint8ClampedArray, palette: Color[]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(buffer.length);
  for (let i = 0; i < buffer.length; i += 4) {
    const a = buffer[i + 3];
    if (a === 0) {
      // Preserve fully transparent pixels as zero.
      out[i] = 0; out[i + 1] = 0; out[i + 2] = 0; out[i + 3] = 0;
      continue;
    }
    const pixel: Color = { r: buffer[i], g: buffer[i + 1], b: buffer[i + 2], a };
    const mapped = nearestColor(pixel, palette);
    out[i] = mapped.r; out[i + 1] = mapped.g; out[i + 2] = mapped.b; out[i + 3] = mapped.a;
  }
  return out;
}



