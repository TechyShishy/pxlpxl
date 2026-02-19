import { describe, it, expect } from 'vitest';
import { BLACK, WHITE, TRANSPARENT } from './color.model';
import type { Color } from './color.model';
import {
  buildPaletteLetterMap,
  letterToColor,
  RgpProjectSchema,
} from './rgp-file.model';

describe('buildPaletteLetterMap', () => {
  it('assigns A to the first palette entry', () => {
    const map = buildPaletteLetterMap([BLACK]);
    expect([...map.values()][0]).toBe('A');
  });

  it('assigns letters A–Z to the first 26 entries in order', () => {
    const palette: Color[] = Array.from({ length: 26 }, (_, i) => ({
      r: i,
      g: 0,
      b: 0,
      a: 255,
    }));
    const map = buildPaletteLetterMap(palette);
    const letters = [...map.values()];
    expect(letters[0]).toBe('A');
    expect(letters[25]).toBe('Z');
  });

  it('assigns AA to index 26', () => {
    const palette: Color[] = Array.from({ length: 27 }, (_, i) => ({
      r: i,
      g: 0,
      b: 0,
      a: 255,
    }));
    const map = buildPaletteLetterMap(palette);
    const letters = [...map.values()];
    expect(letters[26]).toBe('AA');
  });

  it('assigns AB to index 27', () => {
    const palette: Color[] = Array.from({ length: 28 }, (_, i) => ({
      r: i,
      g: 0,
      b: 0,
      a: 255,
    }));
    const map = buildPaletteLetterMap(palette);
    const letters = [...map.values()];
    expect(letters[27]).toBe('AB');
  });

  it('handles TRANSPARENT in the palette', () => {
    const map = buildPaletteLetterMap([TRANSPARENT, WHITE]);
    const letters = [...map.values()];
    expect(letters[0]).toBe('A');
    expect(letters[1]).toBe('B');
  });

  it('returns a map with a key per palette entry', () => {
    const palette = [BLACK, WHITE, TRANSPARENT];
    const map = buildPaletteLetterMap(palette);
    expect(map.size).toBe(3);
  });
});

describe('letterToColor', () => {
  it('returns the Color for a known letter via colorMapping', () => {
    // BLACK = #000000ff
    const map = buildPaletteLetterMap([BLACK]);
    const colorMapping: Record<string, string> = {};
    for (const [hex, letter] of map) {
      colorMapping[letter] = hex;
    }
    const result = letterToColor('A', colorMapping);
    expect(result.r).toBe(0);
    expect(result.g).toBe(0);
    expect(result.b).toBe(0);
    expect(result.a).toBe(255);
  });

  it('returns TRANSPARENT for an unknown letter', () => {
    const result = letterToColor('Z', {});
    expect(result).toEqual(TRANSPARENT);
  });

  it('round-trips BLACK through buildPaletteLetterMap', () => {
    const palette = [BLACK];
    const hexToLetter = buildPaletteLetterMap(palette);
    const colorMapping: Record<string, string> = {};
    for (const [hex, letter] of hexToLetter) {
      colorMapping[letter] = hex;
    }
    const result = letterToColor('A', colorMapping);
    expect(result.r).toBe(BLACK.r);
    expect(result.g).toBe(BLACK.g);
    expect(result.b).toBe(BLACK.b);
    expect(result.a).toBe(BLACK.a);
  });

  it('round-trips WHITE through buildPaletteLetterMap', () => {
    const palette = [BLACK, WHITE];
    const hexToLetter = buildPaletteLetterMap(palette);
    const colorMapping: Record<string, string> = {};
    for (const [hex, letter] of hexToLetter) {
      colorMapping[letter] = hex;
    }
    const result = letterToColor('B', colorMapping);
    expect(result.r).toBe(WHITE.r);
    expect(result.g).toBe(WHITE.g);
    expect(result.b).toBe(WHITE.b);
    expect(result.a).toBe(WHITE.a);
  });
});

describe('RgpProjectSchema', () => {
  it('accepts a minimal valid RGP project', () => {
    const result = RgpProjectSchema.safeParse({
      id: 0,
      name: 'Test',
      rows: [
        {
          id: 1,
          steps: [{ id: 1, count: 3, description: 'A' }],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a project missing the rows field', () => {
    const result = RgpProjectSchema.safeParse({ id: 0, name: 'Test' });
    expect(result.success).toBe(false);
  });

  it('rejects a project missing the id field', () => {
    const result = RgpProjectSchema.safeParse({
      name: 'Test',
      rows: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a project missing the name field', () => {
    const result = RgpProjectSchema.safeParse({ id: 0, rows: [] });
    expect(result.success).toBe(false);
  });

  it('accepts optional colorMapping', () => {
    const result = RgpProjectSchema.safeParse({
      id: 1,
      name: 'With colors',
      rows: [],
      colorMapping: { A: '#ff0000ff', B: '#ffffffff' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a step with count of 0', () => {
    const result = RgpProjectSchema.safeParse({
      id: 0,
      name: 'Bad step',
      rows: [{ id: 1, steps: [{ id: 1, count: 0, description: 'A' }] }],
    });
    expect(result.success).toBe(false);
  });

  it('does not false-positive on a PxlFile-shaped object', () => {
    // PxlFile has version/width/height/layers but no rows
    const pxlLike = {
      version: 1,
      name: 'My Project',
      width: 32,
      height: 32,
      gridType: 'square',
      palette: [],
      layers: [{ id: 'a', name: 'Layer 1', visible: true, opacity: 1, data: '' }],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    const result = RgpProjectSchema.safeParse(pxlLike);
    // pxlLike has no 'rows' so it should fail
    expect(result.success).toBe(false);
  });
});
