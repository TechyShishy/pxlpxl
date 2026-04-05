import { describe, it, expect } from 'vitest';
import { getDelicaColorPool, getColorPool } from './color-pools';

describe('getDelicaColorPool', () => {
  it('returns 1285 Delica bead colors', () => {
    const pool = getDelicaColorPool();
    expect(pool).toHaveLength(1285);
  });

  it('returns colors with a = 255 (fully opaque)', () => {
    const pool = getDelicaColorPool();
    for (const c of pool) {
      expect(c.a).toBe(255);
    }
  });

  it('returns colors with channel values in 0–255', () => {
    const pool = getDelicaColorPool();
    for (const c of pool) {
      expect(c.r).toBeGreaterThanOrEqual(0);
      expect(c.r).toBeLessThanOrEqual(255);
      expect(c.g).toBeGreaterThanOrEqual(0);
      expect(c.g).toBeLessThanOrEqual(255);
      expect(c.b).toBeGreaterThanOrEqual(0);
      expect(c.b).toBeLessThanOrEqual(255);
    }
  });

  it('returns the same cached array on repeated calls', () => {
    const a = getDelicaColorPool();
    const b = getDelicaColorPool();
    expect(a).toBe(b);
  });
});

describe('getColorPool', () => {
  it('returns undefined for "any"', () => {
    expect(getColorPool('any')).toBeUndefined();
  });

  it('returns the Delica pool for "delica"', () => {
    const pool = getColorPool('delica');
    expect(pool).toBeDefined();
    expect(pool!.length).toBe(1285);
  });
});
