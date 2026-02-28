import {
  colorToRgba,
  colorToHex,
  hexToColor,
  colorsEqual,
  TRANSPARENT,
  BLACK,
  WHITE,
  DEFAULT_PALETTE,
  Color,
} from './color.model';

describe('Color Model', () => {
  describe('colorToRgba', () => {
    it('should convert BLACK to rgba(0, 0, 0, 1)', () => {
      expect(colorToRgba(BLACK)).toBe('rgba(0, 0, 0, 1)');
    });

    it('should convert WHITE to rgba(255, 255, 255, 1)', () => {
      expect(colorToRgba(WHITE)).toBe('rgba(255, 255, 255, 1)');
    });

    it('should convert TRANSPARENT to rgba(0, 0, 0, 0)', () => {
      expect(colorToRgba(TRANSPARENT)).toBe('rgba(0, 0, 0, 0)');
    });

    it('should handle alpha=128 as approximately 0.502', () => {
      const color: Color = { r: 100, g: 150, b: 200, a: 128 };
      expect(colorToRgba(color)).toBe('rgba(100, 150, 200, 0.5019607843137255)');
    });

    it('should handle alpha=1 as near-zero opacity', () => {
      const color: Color = { r: 255, g: 0, b: 0, a: 1 };
      const result = colorToRgba(color);
      expect(result).toContain('rgba(255, 0, 0,');
    });
  });

  describe('colorToHex', () => {
    it('should convert BLACK to #000000ff', () => {
      expect(colorToHex(BLACK)).toBe('#000000ff');
    });

    it('should convert WHITE to #ffffffff', () => {
      expect(colorToHex(WHITE)).toBe('#ffffffff');
    });

    it('should convert TRANSPARENT to #00000000', () => {
      expect(colorToHex(TRANSPARENT)).toBe('#00000000');
    });

    it('should pad single-digit hex values with leading zero', () => {
      const color: Color = { r: 1, g: 2, b: 3, a: 4 };
      expect(colorToHex(color)).toBe('#01020304');
    });

    it('should handle max values per component', () => {
      const color: Color = { r: 255, g: 128, b: 0, a: 64 };
      expect(colorToHex(color)).toBe('#ff800040');
    });
  });

  describe('hexToColor', () => {
    it('should parse 6-char hex with # prefix, defaulting alpha to 255', () => {
      const color = hexToColor('#ff0000');
      expect(color).toEqual({ r: 255, g: 0, b: 0, a: 255 });
    });

    it('should parse 8-char hex with explicit alpha', () => {
      const color = hexToColor('#ff000080');
      expect(color).toEqual({ r: 255, g: 0, b: 0, a: 128 });
    });

    it('should parse hex without # prefix', () => {
      const color = hexToColor('00ff00');
      expect(color).toEqual({ r: 0, g: 255, b: 0, a: 255 });
    });

    it('should parse uppercase hex', () => {
      const color = hexToColor('#AABBCC');
      expect(color).toEqual({ r: 170, g: 187, b: 204, a: 255 });
    });

    it('should parse mixed-case hex', () => {
      const color = hexToColor('#aAbBcC');
      expect(color).toEqual({ r: 170, g: 187, b: 204, a: 255 });
    });

    it('should handle 8-char hex with full alpha (ff)', () => {
      const color = hexToColor('#000000ff');
      expect(color).toEqual({ r: 0, g: 0, b: 0, a: 255 });
    });

    it('should handle 8-char hex with zero alpha', () => {
      const color = hexToColor('#00000000');
      expect(color).toEqual(TRANSPARENT);
    });

    it('should round-trip with colorToHex', () => {
      const original: Color = { r: 123, g: 45, b: 67, a: 89 };
      const roundTripped = hexToColor(colorToHex(original));
      expect(roundTripped).toEqual(original);
    });

    it('should return NaN components for invalid hex characters', () => {
      const color = hexToColor('#zzzzzz');
      expect(Number.isNaN(color.r)).toBe(true);
      expect(Number.isNaN(color.g)).toBe(true);
      expect(Number.isNaN(color.b)).toBe(true);
    });

    it('should default alpha to 255 for short hex strings (< 8 chars after removing #)', () => {
      const color = hexToColor('#abc');
      // Only first 6 hex chars are parsed, so with 3 chars:
      // r = parseInt('ab', 16) = 171, g = parseInt('c', 16) = 12, b = NaN
      // This tests the actual behavior (not necessarily ideal behavior)
      expect(color.a).toBe(255);
    });
  });

  describe('colorsEqual', () => {
    it('should return true for identical colors', () => {
      expect(colorsEqual(BLACK, { r: 0, g: 0, b: 0, a: 255 })).toBe(true);
    });

    it('should return false when r differs', () => {
      expect(colorsEqual({ r: 1, g: 0, b: 0, a: 255 }, BLACK)).toBe(false);
    });

    it('should return false when g differs', () => {
      expect(colorsEqual({ r: 0, g: 1, b: 0, a: 255 }, BLACK)).toBe(false);
    });

    it('should return false when b differs', () => {
      expect(colorsEqual({ r: 0, g: 0, b: 1, a: 255 }, BLACK)).toBe(false);
    });

    it('should return false when a differs', () => {
      expect(colorsEqual({ r: 0, g: 0, b: 0, a: 0 }, BLACK)).toBe(false);
    });

    it('should return true for TRANSPARENT compared to an equivalent object', () => {
      expect(colorsEqual(TRANSPARENT, { r: 0, g: 0, b: 0, a: 0 })).toBe(true);
    });
  });

  describe('Constants', () => {
    it('TRANSPARENT should be {0,0,0,0}', () => {
      expect(TRANSPARENT).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    });

    it('BLACK should be {0,0,0,255}', () => {
      expect(BLACK).toEqual({ r: 0, g: 0, b: 0, a: 255 });
    });

    it('WHITE should be {255,255,255,255}', () => {
      expect(WHITE).toEqual({ r: 255, g: 255, b: 255, a: 255 });
    });
  });

  describe('DEFAULT_PALETTE', () => {
    it('should have 16 colors', () => {
      expect(DEFAULT_PALETTE.length).toBe(16);
    });

    it('should have alpha=255 for all colors', () => {
      for (const color of DEFAULT_PALETTE) {
        expect(color.a).toBe(255);
      }
    });

    it('should start with black and white', () => {
      expect(DEFAULT_PALETTE[0]).toEqual(BLACK);
      expect(DEFAULT_PALETTE[1]).toEqual(WHITE);
    });

    it('should have no duplicate colors', () => {
      const keys = DEFAULT_PALETTE.map((c) => `${c.r},${c.g},${c.b},${c.a}`);
      const unique = new Set(keys);
      expect(unique.size).toBe(DEFAULT_PALETTE.length);
    });
  });

  describe('immutability', () => {
    it('should throw when mutating BLACK', () => {
      expect(() => { (BLACK as unknown as Record<string, number>)['r'] = 42; }).toThrow();
    });

    it('should throw when mutating WHITE', () => {
      expect(() => { (WHITE as unknown as Record<string, number>)['r'] = 42; }).toThrow();
    });

    it('should throw when mutating TRANSPARENT', () => {
      expect(() => { (TRANSPARENT as unknown as Record<string, number>)['r'] = 42; }).toThrow();
    });

    it('should throw when mutating DEFAULT_PALETTE entries', () => {
      expect(() => { (DEFAULT_PALETTE[0] as unknown as Record<string, number>)['r'] = 42; }).toThrow();
    });

    it('should throw when pushing to DEFAULT_PALETTE', () => {
      expect(() => { (DEFAULT_PALETTE as unknown as Color[]).push({ r: 1, g: 2, b: 3, a: 4 }); }).toThrow();
    });
  });
});
