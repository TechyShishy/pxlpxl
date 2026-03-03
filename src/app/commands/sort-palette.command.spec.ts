import { TestBed } from '@angular/core/testing';
import { SortPaletteCommand } from './sort-palette.command';
import { ColorService } from '../services/color.service';
import { Color } from '../models';

describe('SortPaletteCommand', () => {
  let colorService: ColorService;

  const RED: Color = { r: 255, g: 0, b: 0, a: 255 };
  const GREEN: Color = { r: 0, g: 255, b: 0, a: 255 };
  const BLUE: Color = { r: 0, g: 0, b: 255, a: 255 };
  const YELLOW: Color = { r: 255, g: 255, b: 0, a: 255 };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    colorService = TestBed.inject(ColorService);
    colorService.setPalette([RED, GREEN, BLUE, YELLOW]);
  });

  it('should store the provided description', () => {
    const cmd = new SortPaletteCommand(colorService, [RED, GREEN], [GREEN, RED], 'Sort palette by pixel count');
    expect(cmd.description).toBe('Sort palette by pixel count');
  });

  describe('execute', () => {
    it('should apply the afterPalette', () => {
      const before = [RED, GREEN, BLUE, YELLOW];
      const after = [YELLOW, BLUE, GREEN, RED];
      const cmd = new SortPaletteCommand(colorService, before, after, 'Sort palette by pixel count');

      cmd.execute();

      const palette = colorService.palette();
      expect(palette).toHaveLength(4);
      expect(palette[0]).toEqual(YELLOW);
      expect(palette[1]).toEqual(BLUE);
      expect(palette[2]).toEqual(GREEN);
      expect(palette[3]).toEqual(RED);
    });
  });

  describe('undo', () => {
    it('should restore the beforePalette', () => {
      const before = [RED, GREEN, BLUE, YELLOW];
      const after = [YELLOW, BLUE, GREEN, RED];
      const cmd = new SortPaletteCommand(colorService, before, after, 'Sort palette by pixel count');

      cmd.execute();
      cmd.undo();

      const palette = colorService.palette();
      expect(palette).toHaveLength(4);
      expect(palette[0]).toEqual(RED);
      expect(palette[1]).toEqual(GREEN);
      expect(palette[2]).toEqual(BLUE);
      expect(palette[3]).toEqual(YELLOW);
    });

    it('should allow re-execute after undo', () => {
      const before = [RED, GREEN, BLUE, YELLOW];
      const after = [YELLOW, BLUE, GREEN, RED];
      const cmd = new SortPaletteCommand(colorService, before, after, 'Sort palette by DB code');

      cmd.execute();
      cmd.undo();
      cmd.execute();

      const palette = colorService.palette();
      expect(palette[0]).toEqual(YELLOW);
    });
  });

  describe('execute/undo with DB-code description', () => {
    it('should handle DB code sort description', () => {
      const before = [RED, GREEN];
      const after = [GREEN, RED];
      const cmd = new SortPaletteCommand(colorService, before, after, 'Sort palette by DB code');
      expect(cmd.description).toBe('Sort palette by DB code');
    });
  });
});
