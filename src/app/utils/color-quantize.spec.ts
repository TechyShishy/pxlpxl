import { describe, it, expect } from 'vitest';
import type { Color } from '../models/color.model';
import {
  colorDistance,
  nearestColor,
  nearestUnusedColor,
  colorKey,
  medianCut,
  kMeans,
  quantizeBuffer,
} from './color-quantize';

// ── Helpers ───────────────────────────────────────────────────────────────────

const RED: Color = { r: 255, g: 0, b: 0, a: 255 };
const GREEN: Color = { r: 0, g: 255, b: 0, a: 255 };
const BLUE: Color = { r: 0, g: 0, b: 255, a: 255 };
const WHITE: Color = { r: 255, g: 255, b: 255, a: 255 };
const BLACK: Color = { r: 0, g: 0, b: 0, a: 255 };
const TRANSPARENT: Color = { r: 0, g: 0, b: 0, a: 0 };

function makeBuffer(colors: Color[]): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(colors.length * 4);
  for (let i = 0; i < colors.length; i++) {
    buf[i * 4] = colors[i].r;
    buf[i * 4 + 1] = colors[i].g;
    buf[i * 4 + 2] = colors[i].b;
    buf[i * 4 + 3] = colors[i].a;
  }
  return buf;
}

function readBuffer(buf: Uint8ClampedArray): Color[] {
  const colors: Color[] = [];
  for (let i = 0; i < buf.length; i += 4) {
    colors.push({ r: buf[i], g: buf[i + 1], b: buf[i + 2], a: buf[i + 3] });
  }
  return colors;
}

// ── colorDistance ─────────────────────────────────────────────────────────────

describe('colorDistance', () => {
  it('returns 0 for identical colors', () => {
    expect(colorDistance(RED, RED)).toBe(0);
  });

  it('returns a positive value for different colors', () => {
    expect(colorDistance(RED, BLUE)).toBeGreaterThan(0);
  });

  it('is symmetric', () => {
    expect(colorDistance(RED, GREEN)).toBe(colorDistance(GREEN, RED));
  });

  it('accounts for all four channels', () => {
    const a: Color = { r: 0, g: 0, b: 0, a: 100 };
    const b: Color = { r: 0, g: 0, b: 0, a: 200 };
    expect(colorDistance(a, b)).toBe(10000); // (100)^2
  });
});

// ── nearestColor ──────────────────────────────────────────────────────────────

describe('nearestColor', () => {
  it('returns the only element when palette has one color', () => {
    expect(nearestColor(RED, [BLUE])).toEqual(BLUE);
  });

  it('returns an identical match when present', () => {
    expect(nearestColor(GREEN, [RED, GREEN, BLUE])).toEqual(GREEN);
  });

  it('returns the closest color when no exact match', () => {
    // Dark red is closer to RED than to BLUE
    const darkRed: Color = { r: 200, g: 10, b: 10, a: 255 };
    expect(nearestColor(darkRed, [RED, BLUE])).toEqual(RED);
  });
});

// ── medianCut ─────────────────────────────────────────────────────────────────

describe('medianCut', () => {
  it('returns empty array for empty input', () => {
    expect(medianCut([], 4)).toHaveLength(0);
  });

  it('returns empty array when n is 0', () => {
    expect(medianCut([RED, GREEN], 0)).toHaveLength(0);
  });

  it('returns all unique colors unchanged when count <= n', () => {
    const result = medianCut([RED, GREEN, BLUE], 8);
    expect(result.length).toBeLessThanOrEqual(3);
    // All input colors should have a representative in result
    for (const input of [RED, GREEN, BLUE]) {
      expect(result.some((c) => c.r === input.r && c.g === input.g && c.b === input.b)).toBe(true);
    }
  });

  it('reduces to exactly n colors when there are more', () => {
    // 10 clearly distinct colors → reduce to 4
    const manyColors: Color[] = [
      { r: 255, g: 0, b: 0, a: 255 },
      { r: 0, g: 255, b: 0, a: 255 },
      { r: 0, g: 0, b: 255, a: 255 },
      { r: 255, g: 255, b: 0, a: 255 },
      { r: 255, g: 0, b: 255, a: 255 },
      { r: 0, g: 255, b: 255, a: 255 },
      { r: 128, g: 0, b: 0, a: 255 },
      { r: 0, g: 128, b: 0, a: 255 },
      { r: 0, g: 0, b: 128, a: 255 },
      { r: 128, g: 128, b: 0, a: 255 },
    ];
    const result = medianCut(manyColors, 4);
    expect(result).toHaveLength(4);
  });

  it('does not produce duplicate representatives', () => {
    const pixels: Color[] = Array.from({ length: 20 }, (_, i) => ({
      r: i * 10, g: 0, b: 0, a: 255,
    }));
    const result = medianCut(pixels, 4);
    const keys = result.map((c) => `${c.r},${c.g},${c.b},${c.a}`);
    expect(new Set(keys).size).toBe(result.length);
  });
});

// ── kMeans ────────────────────────────────────────────────────────────────────

describe('kMeans', () => {
  it('returns empty array for empty input', () => {
    expect(kMeans([], 4)).toHaveLength(0);
  });

  it('returns empty array when n is 0', () => {
    expect(kMeans([RED, GREEN], 0)).toHaveLength(0);
  });

  it('returns all unique colors when count <= n', () => {
    const result = kMeans([RED, GREEN, BLUE], 8);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('reduces to exactly n colors when there are more', () => {
    const manyColors: Color[] = Array.from({ length: 50 }, (_, i) => ({
      r: i * 5,
      g: (50 - i) * 4,
      b: (i % 10) * 20,
      a: 255,
    }));
    const result = kMeans(manyColors, 6);
    expect(result).toHaveLength(6);
  });

  it('returns valid RGBA values (0–255)', () => {
    const pixels: Color[] = Array.from({ length: 30 }, (_, i) => ({
      r: (i * 8) % 256, g: (i * 16) % 256, b: (i * 4) % 256, a: 255,
    }));
    const result = kMeans(pixels, 5);
    for (const c of result) {
      expect(c.r).toBeGreaterThanOrEqual(0); expect(c.r).toBeLessThanOrEqual(255);
      expect(c.g).toBeGreaterThanOrEqual(0); expect(c.g).toBeLessThanOrEqual(255);
      expect(c.b).toBeGreaterThanOrEqual(0); expect(c.b).toBeLessThanOrEqual(255);
      expect(c.a).toBeGreaterThanOrEqual(0); expect(c.a).toBeLessThanOrEqual(255);
    }
  });
});

// ── quantizeBuffer ────────────────────────────────────────────────────────────

describe('quantizeBuffer', () => {
  it('returns a buffer of the same length', () => {
    const buf = makeBuffer([RED, GREEN, BLUE]);
    expect(quantizeBuffer(buf, [RED, GREEN, BLUE])).toHaveLength(buf.length);
  });

  it('only contains colors present in the palette', () => {
    const buf = makeBuffer([
      { r: 200, g: 10, b: 10, a: 255 },   // close to RED
      { r: 10, g: 200, b: 10, a: 255 },   // close to GREEN
      { r: 10, g: 10, b: 200, a: 255 },   // close to BLUE
    ]);
    const out = readBuffer(quantizeBuffer(buf, [RED, GREEN, BLUE]));
    for (const c of out) {
      const isRed = c.r === 255 && c.g === 0 && c.b === 0;
      const isGreen = c.r === 0 && c.g === 255 && c.b === 0;
      const isBlue = c.r === 0 && c.g === 0 && c.b === 255;
      expect(isRed || isGreen || isBlue).toBe(true);
    }
  });

  it('preserves fully transparent pixels as {0, 0, 0, 0}', () => {
    const buf = makeBuffer([TRANSPARENT, RED]);
    const out = readBuffer(quantizeBuffer(buf, [WHITE, BLACK]));
    expect(out[0]).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it('maps non-transparent pixels even when alpha differs from palette', () => {
    const semiRed: Color = { r: 255, g: 0, b: 0, a: 128 };
    const buf = makeBuffer([semiRed]);
    const out = readBuffer(quantizeBuffer(buf, [RED, BLUE])); // RED has a=255, BLUE has a=255
    // semiRed is closest to RED
    expect(out[0]).toEqual(RED);
  });

  it('is a no-op when the buffer only contains palette colors', () => {
    const buf = makeBuffer([RED, GREEN, BLUE, WHITE, BLACK]);
    const out = quantizeBuffer(buf, [RED, GREEN, BLUE, WHITE, BLACK]);
    expect(out).toEqual(buf);
  });
});

// ── nearestUnusedColor ────────────────────────────────────────────────────────

describe('nearestUnusedColor', () => {
  it('returns the closest color when nothing is used', () => {
    const used = new Set<string>();
    const result = nearestUnusedColor(RED, [BLUE, RED, GREEN], used);
    expect(result).toEqual(RED);
  });

  it('skips used colors and returns the next closest', () => {
    const used = new Set<string>([colorKey(RED)]);
    // Dark red is closest to RED, but RED is used → should pick next closest.
    const darkRed: Color = { r: 200, g: 10, b: 10, a: 255 };
    const result = nearestUnusedColor(darkRed, [RED, GREEN, BLUE], used);
    // Should not be RED
    expect(result).not.toEqual(RED);
  });

  it('falls back to nearest when all pool entries are used', () => {
    const pool = [RED, GREEN, BLUE];
    const used = new Set<string>(pool.map(colorKey));
    const result = nearestUnusedColor(RED, pool, used);
    // Falls back to nearestColor — should be RED
    expect(result).toEqual(RED);
  });
});

// ── colorKey ──────────────────────────────────────────────────────────────────

describe('colorKey', () => {
  it('produces distinct keys for different colors', () => {
    expect(colorKey(RED)).not.toBe(colorKey(BLUE));
  });

  it('produces the same key for the same color', () => {
    expect(colorKey(RED)).toBe(colorKey({ r: 255, g: 0, b: 0, a: 255 }));
  });
});

// ── medianCut with colorPool ──────────────────────────────────────────────────

describe('medianCut with colorPool', () => {
  const POOL = [RED, GREEN, BLUE, WHITE, BLACK];

  it('returns only colors from the pool', () => {
    const manyColors: Color[] = Array.from({ length: 20 }, (_, i) => ({
      r: i * 12, g: (20 - i) * 10, b: (i % 5) * 40, a: 255,
    }));
    const result = medianCut(manyColors, 4, POOL);
    for (const c of result) {
      expect(POOL.some((p) => p.r === c.r && p.g === c.g && p.b === c.b && p.a === c.a)).toBe(true);
    }
  });

  it('returns distinct pool colors when buckets would collide', () => {
    // Many shades of red that would all snap to RED without collision handling.
    const reds: Color[] = Array.from({ length: 20 }, (_, i) => ({
      r: 200 + Math.floor(i * 2.5), g: i, b: i, a: 255,
    }));
    const result = medianCut(reds, 3, POOL);
    const keys = result.map(colorKey);
    // All 3 should be distinct pool entries.
    expect(new Set(keys).size).toBe(3);
  });

  it('behaves normally without a pool', () => {
    const manyColors: Color[] = Array.from({ length: 20 }, (_, i) => ({
      r: i * 10, g: 0, b: 0, a: 255,
    }));
    const result = medianCut(manyColors, 4);
    expect(result).toHaveLength(4);
  });

  it('respects the pool size as an upper bound', () => {
    const tinyPool = [RED, BLUE];
    const manyColors: Color[] = Array.from({ length: 30 }, (_, i) => ({
      r: i * 8, g: i * 4, b: i * 2, a: 255,
    }));
    const result = medianCut(manyColors, 5, tinyPool);
    // Can only produce at most 2 distinct pool entries.
    const keys = new Set(result.map(colorKey));
    expect(keys.size).toBeLessThanOrEqual(2);
  });

  it('snaps to pool on pixels.length <= n early return', () => {
    // 3 pixels, n=5 → pixels.length <= n triggers early return.
    const nearlyRed: Color = { r: 254, g: 1, b: 1, a: 255 };
    const nearlyGreen: Color = { r: 1, g: 254, b: 1, a: 255 };
    const result = medianCut([nearlyRed, nearlyGreen, nearlyRed], 5, POOL);
    for (const c of result) {
      expect(POOL.some((p) => p.r === c.r && p.g === c.g && p.b === c.b && p.a === c.a)).toBe(true);
    }
  });

  it('snaps to pool on unique.length <= n early return', () => {
    // 2 unique colors but 10 pixels, n=5 → unique.length <= n triggers early return.
    const nearlyRed: Color = { r: 254, g: 1, b: 1, a: 255 };
    const nearlyBlue: Color = { r: 1, g: 1, b: 254, a: 255 };
    const pixels = Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? nearlyRed : nearlyBlue));
    const result = medianCut(pixels, 5, POOL);
    for (const c of result) {
      expect(POOL.some((p) => p.r === c.r && p.g === c.g && p.b === c.b && p.a === c.a)).toBe(true);
    }
  });
});

// ── kMeans with colorPool ─────────────────────────────────────────────────────

describe('kMeans with colorPool', () => {
  const POOL = [RED, GREEN, BLUE, WHITE, BLACK];

  it('returns only colors from the pool', () => {
    const manyColors: Color[] = Array.from({ length: 50 }, (_, i) => ({
      r: i * 5, g: (50 - i) * 4, b: (i % 10) * 20, a: 255,
    }));
    const result = kMeans(manyColors, 4, 20, POOL);
    for (const c of result) {
      expect(POOL.some((p) => p.r === c.r && p.g === c.g && p.b === c.b && p.a === c.a)).toBe(true);
    }
  });

  it('returns the requested number of entries', () => {
    const manyColors: Color[] = Array.from({ length: 50 }, (_, i) => ({
      r: i * 5, g: (50 - i) * 4, b: (i % 10) * 20, a: 255,
    }));
    const result = kMeans(manyColors, 4, 20, POOL);
    expect(result).toHaveLength(4);
  });

  it('returns distinct pool colors', () => {
    const manyColors: Color[] = Array.from({ length: 50 }, (_, i) => ({
      r: i * 5, g: (50 - i) * 4, b: (i % 10) * 20, a: 255,
    }));
    const result = kMeans(manyColors, 4, 20, POOL);
    const keys = result.map(colorKey);
    expect(new Set(keys).size).toBe(4);
  });

  it('behaves normally without a pool', () => {
    const manyColors: Color[] = Array.from({ length: 50 }, (_, i) => ({
      r: i * 5, g: (50 - i) * 4, b: (i % 10) * 20, a: 255,
    }));
    const result = kMeans(manyColors, 6);
    expect(result).toHaveLength(6);
  });

  it('snaps to pool on unique.length <= n early return', () => {
    // 2 unique colors, n=5 → unique.length <= n triggers early return.
    const nearlyRed: Color = { r: 254, g: 1, b: 1, a: 255 };
    const nearlyBlue: Color = { r: 1, g: 1, b: 254, a: 255 };
    const pixels = Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? nearlyRed : nearlyBlue));
    const result = kMeans(pixels, 5, 20, POOL);
    for (const c of result) {
      expect(POOL.some((p) => p.r === c.r && p.g === c.g && p.b === c.b && p.a === c.a)).toBe(true);
    }
  });
});
