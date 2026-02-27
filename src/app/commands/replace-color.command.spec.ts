import { TestBed } from '@angular/core/testing';
import { ReplaceColorCommand } from './replace-color.command';
import { LayerService } from '../services/layer.service';
import { ColorService } from '../services/color.service';
import { Color, colorsEqual, DEFAULT_PALETTE } from '../models';

const RED: Color = { r: 255, g: 0, b: 0, a: 255 };
const BLUE: Color = { r: 0, g: 0, b: 255, a: 255 };
const GREEN: Color = { r: 0, g: 255, b: 0, a: 255 };

describe('ReplaceColorCommand', () => {
  let layerService: LayerService;
  let colorService: ColorService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    layerService = TestBed.inject(LayerService);
    colorService = TestBed.inject(ColorService);

    // Single 2×2 layer; pre-fill pixel (0,0) with RED
    layerService.initLayers(2, 2);
    layerService.setPixel(0, 0, 0, 2, RED);
    layerService.setPixel(0, 1, 0, 2, GREEN); // should not be affected

    // Replace the first DEFAULT_PALETTE entry with RED so we have an index to track
    colorService.updatePaletteColor(0, RED);
  });

  function makeCmd(): ReplaceColorCommand {
    return new ReplaceColorCommand(layerService, colorService, 0, RED, BLUE);
  }

  describe('execute', () => {
    it('replaces matching pixels with newColor', () => {
      const cmd = makeCmd();
      cmd.execute();
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 2), BLUE)).toBe(true);
    });

    it('does not touch pixels that are not the old color', () => {
      const cmd = makeCmd();
      cmd.execute();
      expect(colorsEqual(layerService.getPixel(0, 1, 0, 2), GREEN)).toBe(true);
    });

    it('updates the palette entry to newColor', () => {
      const cmd = makeCmd();
      cmd.execute();
      expect(colorsEqual(colorService.palette()[0], BLUE)).toBe(true);
    });
  });

  describe('undo', () => {
    it('restores pixels to oldColor after execute + undo', () => {
      const cmd = makeCmd();
      cmd.execute();
      cmd.undo();
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 2), RED)).toBe(true);
    });

    it('restores palette entry to oldColor after execute + undo', () => {
      const cmd = makeCmd();
      cmd.execute();
      cmd.undo();
      expect(colorsEqual(colorService.palette()[0], RED)).toBe(true);
    });
  });

  describe('redo', () => {
    it('re-applies change after execute → undo → execute', () => {
      const cmd = makeCmd();
      cmd.execute();
      cmd.undo();
      cmd.execute();
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 2), BLUE)).toBe(true);
      expect(colorsEqual(colorService.palette()[0], BLUE)).toBe(true);
    });
  });

  describe('multiple layers', () => {
    it('replaces matching pixels across all layers', () => {
      // Add a second layer with a RED pixel at (1,1)
      layerService.addLayer(2, 2);
      layerService.setPixel(1, 1, 1, 2, RED);

      const cmd = makeCmd();
      cmd.execute();

      expect(colorsEqual(layerService.getPixel(0, 0, 0, 2), BLUE)).toBe(true);
      expect(colorsEqual(layerService.getPixel(1, 1, 1, 2), BLUE)).toBe(true);
    });
  });

  describe('transparent pixels', () => {
    it('does not match fully transparent pixels even if rgb matches', () => {
      const transparentRed: Color = { r: 255, g: 0, b: 0, a: 0 };
      layerService.setPixel(0, 0, 1, 2, transparentRed);

      // Replace RED (a=255) — transparent pixel should NOT be replaced
      const cmd = new ReplaceColorCommand(layerService, colorService, 0, RED, BLUE);
      cmd.execute();

      // Only the opaque RED pixel at (0,0) should be BLUE; transparent stays
      expect(colorsEqual(layerService.getPixel(0, 0, 1, 2), transparentRed)).toBe(true);
    });
  });

  describe('description', () => {
    it('has correct description', () => {
      expect(makeCmd().description).toBe('Replace palette color');
    });
  });
});
