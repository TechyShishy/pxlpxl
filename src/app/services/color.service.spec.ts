import { TestBed } from '@angular/core/testing';
import { ColorService } from './color.service';
import { LayerService } from './layer.service';
import { HistoryService } from './history.service';
import { BLACK, WHITE, DEFAULT_PALETTE, Color, colorsEqual, colorToHex } from '../models';

describe('ColorService', () => {
  let service: ColorService;
  let layerService: LayerService;
  let historyService: HistoryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ColorService);
    layerService = TestBed.inject(LayerService);
    historyService = TestBed.inject(HistoryService);
  });

  describe('initial state', () => {
    it('should have primary color as BLACK', () => {
      expect(colorsEqual(service.primaryColor(), BLACK)).toBe(true);
    });

    it('should have secondary color as WHITE', () => {
      expect(colorsEqual(service.secondaryColor(), WHITE)).toBe(true);
    });

    it('should have DEFAULT_PALETTE with 16 colors', () => {
      expect(service.palette().length).toBe(DEFAULT_PALETTE.length);
    });
  });

  describe('setPrimaryColor', () => {
    it('should update the primary color signal', () => {
      const red: Color = { r: 255, g: 0, b: 0, a: 255 };
      service.setPrimaryColor(red);
      expect(colorsEqual(service.primaryColor(), red)).toBe(true);
    });

    it('should defensively copy the input', () => {
      const color: Color = { r: 100, g: 100, b: 100, a: 255 };
      service.setPrimaryColor(color);
      color.r = 200; // mutate the original
      expect(service.primaryColor().r).toBe(100);
    });
  });

  describe('setSecondaryColor', () => {
    it('should update the secondary color signal', () => {
      const blue: Color = { r: 0, g: 0, b: 255, a: 255 };
      service.setSecondaryColor(blue);
      expect(colorsEqual(service.secondaryColor(), blue)).toBe(true);
    });

    it('should defensively copy the input', () => {
      const color: Color = { r: 50, g: 50, b: 50, a: 255 };
      service.setSecondaryColor(color);
      color.g = 200;
      expect(service.secondaryColor().g).toBe(50);
    });
  });

  describe('swapColors', () => {
    it('should swap primary and secondary colors', () => {
      const red: Color = { r: 255, g: 0, b: 0, a: 255 };
      const blue: Color = { r: 0, g: 0, b: 255, a: 255 };
      service.setPrimaryColor(red);
      service.setSecondaryColor(blue);

      service.swapColors();

      expect(colorsEqual(service.primaryColor(), blue)).toBe(true);
      expect(colorsEqual(service.secondaryColor(), red)).toBe(true);
    });

    it('should return to original state after swapping twice', () => {
      const originalPrimary = { ...service.primaryColor() };
      const originalSecondary = { ...service.secondaryColor() };

      service.swapColors();
      service.swapColors();

      expect(colorsEqual(service.primaryColor(), originalPrimary)).toBe(true);
      expect(colorsEqual(service.secondaryColor(), originalSecondary)).toBe(true);
    });
  });

  describe('primaryColorHex / secondaryColorHex', () => {
    it('should return 6-char hex for primary color (no alpha)', () => {
      const hex = service.primaryColorHex();
      expect(hex).toBe('#000000');
      expect(hex.length).toBe(7); // # + 6 hex chars
    });

    it('should return 6-char hex for secondary color (no alpha)', () => {
      expect(service.secondaryColorHex()).toBe('#ffffff');
    });

    it('should update when primary color changes', () => {
      service.setPrimaryColor({ r: 255, g: 0, b: 0, a: 255 });
      expect(service.primaryColorHex()).toBe('#ff0000');
    });

    it('should differ from colorToHex which includes alpha', () => {
      // ColorService.toHex produces 6-char, colorToHex produces 8-char
      service.setPrimaryColor({ r: 255, g: 0, b: 0, a: 128 });
      const serviceHex = service.primaryColorHex();
      const modelHex = colorToHex(service.primaryColor());
      expect(serviceHex).toBe('#ff0000'); // no alpha
      expect(modelHex).toBe('#ff000080'); // with alpha
    });
  });

  describe('palette management', () => {
    it('addToPalette should append a color', () => {
      const initialLength = service.palette().length;
      const newColor: Color = { r: 1, g: 2, b: 3, a: 255 };
      service.addToPalette(newColor);
      expect(service.palette().length).toBe(initialLength + 1);
      expect(colorsEqual(service.palette()[initialLength], newColor)).toBe(true);
    });

    it('addToPalette should defensively copy the color', () => {
      const color: Color = { r: 10, g: 20, b: 30, a: 255 };
      service.addToPalette(color);
      color.r = 99;
      const lastColor = service.palette()[service.palette().length - 1];
      expect(lastColor.r).toBe(10);
    });

    it('removeFromPalette should remove color at given index', () => {
      const initialLength = service.palette().length;
      const removedColor = { ...service.palette()[2] };
      service.removeFromPalette(2);
      expect(service.palette().length).toBe(initialLength - 1);
      // The color at index 2 should now be the former index 3
      expect(colorsEqual(service.palette()[2], removedColor)).toBe(false);
    });

    it('removeFromPalette should handle removing last element', () => {
      const initialLength = service.palette().length;
      service.removeFromPalette(initialLength - 1);
      expect(service.palette().length).toBe(initialLength - 1);
    });

    it('updatePaletteColor should change only the target index', () => {
      const newColor: Color = { r: 99, g: 99, b: 99, a: 255 };
      const oldColor1 = { ...service.palette()[1] };
      service.updatePaletteColor(0, newColor);
      expect(colorsEqual(service.palette()[0], newColor)).toBe(true);
      expect(colorsEqual(service.palette()[1], oldColor1)).toBe(true);
    });

    it('setPalette should replace the entire palette', () => {
      const newPalette: Color[] = [
        { r: 1, g: 1, b: 1, a: 255 },
        { r: 2, g: 2, b: 2, a: 255 },
      ];
      service.setPalette(newPalette);
      expect(service.palette().length).toBe(2);
      expect(colorsEqual(service.palette()[0], newPalette[0])).toBe(true);
    });

    it('setPalette should defensively copy each color', () => {
      const colors: Color[] = [{ r: 10, g: 20, b: 30, a: 255 }];
      service.setPalette(colors);
      colors[0].r = 99;
      expect(service.palette()[0].r).toBe(10);
    });
  });

  describe('mergePalette', () => {
    const RED: Color = { r: 255, g: 0, b: 0, a: 255 };
    const GREEN: Color = { r: 0, g: 255, b: 0, a: 255 };

    // Start each test with a known, controlled palette
    beforeEach(() => {
      service.setPalette([RED]);
    });

    it('should append colors not already in the palette', () => {
      expect(service.palette().length).toBe(1);
      service.mergePalette([GREEN]);
      expect(service.palette().length).toBe(2);
      expect(colorsEqual(service.palette()[1], GREEN)).toBe(true);
    });

    it('should not append colors that already exist in the palette', () => {
      service.mergePalette([RED]);
      expect(service.palette().length).toBe(1);
    });

    it('should deduplicate its own input — duplicate entries appended only once', () => {
      service.mergePalette([GREEN, GREEN, GREEN]);
      expect(service.palette().length).toBe(2);
    });

    it('should add multiple distinct new colors', () => {
      const BLUE: Color = { r: 0, g: 0, b: 255, a: 255 };
      service.mergePalette([GREEN, BLUE]);
      expect(service.palette().length).toBe(3);
    });

    it('should be a no-op for an empty array', () => {
      service.mergePalette([]);
      expect(service.palette().length).toBe(1);
    });

    it('should defensively copy added colors', () => {
      const color: Color = { r: 77, g: 88, b: 99, a: 255 };
      service.mergePalette([color]);
      color.r = 1;
      const last = service.palette()[service.palette().length - 1];
      expect(last.r).toBe(77);
    });
  });

  describe('cleanUnusedColors', () => {
    const RED: Color = { r: 255, g: 0, b: 0, a: 255 };
    const GREEN: Color = { r: 0, g: 255, b: 0, a: 255 };
    const BLUE: Color = { r: 0, g: 0, b: 255, a: 255 };

    beforeEach(() => {
      // 2×2 empty canvas, all pixels transparent by default
      layerService.initLayers(2, 2);
    });

    it('removes colors not used by any pixel', () => {
      service.setPalette([RED, GREEN, BLUE]);
      // Paint only RED at (0,0)
      layerService.setPixel(0, 0, 0, 2, RED);

      service.cleanUnusedColors();

      expect(service.palette().length).toBe(1);
      expect(colorsEqual(service.palette()[0], RED)).toBe(true);
    });

    it('retains colors that appear in at least one pixel', () => {
      service.setPalette([RED, GREEN, BLUE]);
      layerService.setPixel(0, 0, 0, 2, RED);
      layerService.setPixel(0, 1, 0, 2, GREEN);

      service.cleanUnusedColors();

      const result = service.palette();
      expect(result.length).toBe(2);
      expect(result.some((c) => colorsEqual(c, RED))).toBe(true);
      expect(result.some((c) => colorsEqual(c, GREEN))).toBe(true);
      expect(result.some((c) => colorsEqual(c, BLUE))).toBe(false);
    });

    it('is a no-op when all palette colors are used', () => {
      service.setPalette([RED, GREEN]);
      layerService.setPixel(0, 0, 0, 2, RED);
      layerService.setPixel(0, 1, 0, 2, GREEN);
      const before = service.palette().slice();

      service.cleanUnusedColors();

      expect(service.palette().length).toBe(before.length);
      expect(before.every((c, i) => colorsEqual(c, service.palette()[i]))).toBe(true);
    });

    it('keeps at least one entry when no palette colors are used', () => {
      service.setPalette([RED, GREEN, BLUE]);
      // Leave all pixels transparent (already the default)

      service.cleanUnusedColors();

      expect(service.palette().length).toBe(1);
      expect(colorsEqual(service.palette()[0], RED)).toBe(true);
    });

    it('is a no-op when the palette has only one entry', () => {
      service.setPalette([RED]);
      // Nothing should happen regardless of pixel state

      service.cleanUnusedColors();

      expect(service.palette().length).toBe(1);
      expect(colorsEqual(service.palette()[0], RED)).toBe(true);
    });

    it('is undoable via HistoryService', () => {
      service.setPalette([RED, GREEN, BLUE]);
      layerService.setPixel(0, 0, 0, 2, RED);

      service.cleanUnusedColors();
      expect(service.palette().length).toBe(1);

      historyService.undo();
      expect(service.palette().length).toBe(3);
      expect(colorsEqual(service.palette()[0], RED)).toBe(true);
      expect(colorsEqual(service.palette()[1], GREEN)).toBe(true);
      expect(colorsEqual(service.palette()[2], BLUE)).toBe(true);
    });

    it('ignores fully-transparent pixels when determining used colors', () => {
      service.setPalette([RED, GREEN]);
      // Paint a transparent RED pixel — should not count as "in use"
      layerService.setPixel(0, 0, 0, 2, { r: 255, g: 0, b: 0, a: 0 });
      layerService.setPixel(0, 1, 0, 2, GREEN);

      service.cleanUnusedColors();

      expect(service.palette().length).toBe(1);
      expect(colorsEqual(service.palette()[0], GREEN)).toBe(true);
    });
  });
});
