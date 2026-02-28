import { TestBed } from '@angular/core/testing';
import { MovePaletteCommand } from './move-palette.command';
import { ColorService } from '../services/color.service';
import { Color } from '../models';

describe('MovePaletteCommand', () => {
  let colorService: ColorService;

  const RED: Color = { r: 255, g: 0, b: 0, a: 255 };
  const GREEN: Color = { r: 0, g: 255, b: 0, a: 255 };
  const BLUE: Color = { r: 0, g: 0, b: 255, a: 255 };
  const YELLOW: Color = { r: 255, g: 255, b: 0, a: 255 };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    colorService = TestBed.inject(ColorService);
    // Replace the default palette with a known 4-color palette for predictable testing
    colorService.setPalette([RED, GREEN, BLUE, YELLOW]);
  });

  it('should have description "Move palette entry"', () => {
    const cmd = new MovePaletteCommand(colorService, 0, 2);
    expect(cmd.description).toBe('Move palette entry');
  });

  describe('execute', () => {
    it('should move entry from lower to higher index', () => {
      const cmd = new MovePaletteCommand(colorService, 0, 2);
      cmd.execute();
      // RED was at 0; after move: [GREEN, BLUE, RED, YELLOW]
      const palette = colorService.palette();
      expect(palette[0]).toEqual(GREEN);
      expect(palette[1]).toEqual(BLUE);
      expect(palette[2]).toEqual(RED);
      expect(palette[3]).toEqual(YELLOW);
    });

    it('should move entry from higher to lower index', () => {
      const cmd = new MovePaletteCommand(colorService, 3, 1);
      cmd.execute();
      // YELLOW was at 3; after move: [RED, YELLOW, GREEN, BLUE]
      const palette = colorService.palette();
      expect(palette[0]).toEqual(RED);
      expect(palette[1]).toEqual(YELLOW);
      expect(palette[2]).toEqual(GREEN);
      expect(palette[3]).toEqual(BLUE);
    });

    it('should keep the palette length unchanged after the move', () => {
      const countBefore = colorService.palette().length;
      const cmd = new MovePaletteCommand(colorService, 0, 2);
      cmd.execute();
      expect(colorService.palette().length).toBe(countBefore);
    });
  });

  describe('undo', () => {
    it('should restore the original order after a forward move', () => {
      const originalPalette = colorService.palette().map((c) => ({ ...c }));
      const cmd = new MovePaletteCommand(colorService, 0, 2);
      cmd.execute();
      cmd.undo();
      expect(colorService.palette()).toEqual(originalPalette);
    });

    it('should restore the original order after a backward move', () => {
      const originalPalette = colorService.palette().map((c) => ({ ...c }));
      const cmd = new MovePaletteCommand(colorService, 3, 0);
      cmd.execute();
      cmd.undo();
      expect(colorService.palette()).toEqual(originalPalette);
    });

    it('should support execute → undo → execute cycle', () => {
      const originalPalette = colorService.palette().map((c) => ({ ...c }));
      const cmd = new MovePaletteCommand(colorService, 1, 3);
      cmd.execute();
      cmd.undo();
      cmd.execute();
      cmd.undo();
      expect(colorService.palette()).toEqual(originalPalette);
    });
  });
});
