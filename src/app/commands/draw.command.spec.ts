import { TestBed } from '@angular/core/testing';
import { DrawCommand } from './draw.command';
import { LayerService } from '../services/layer.service';
import { Color, ModifiedPixel, BLACK, WHITE, TRANSPARENT, colorsEqual } from '../models';

describe('DrawCommand', () => {
  let layerService: LayerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    layerService = TestBed.inject(LayerService);
    layerService.initLayers(4, 4);
  });

  function makePixel(x: number, y: number, oldColor: Color, newColor: Color): ModifiedPixel {
    return { coord: { x, y }, oldColor, newColor };
  }

  describe('execute', () => {
    it('should set modified pixels to newColor', () => {
      const pixels = [makePixel(0, 0, TRANSPARENT, BLACK)];
      const cmd = new DrawCommand(layerService, 0, 4, pixels);
      cmd.execute();
      const color = layerService.getPixel(0, 0, 0, 4);
      expect(colorsEqual(color, BLACK)).toBe(true);
    });

    it('should set multiple pixels', () => {
      const pixels = [
        makePixel(0, 0, TRANSPARENT, BLACK),
        makePixel(1, 0, TRANSPARENT, WHITE),
        makePixel(2, 0, TRANSPARENT, { r: 255, g: 0, b: 0, a: 255 }),
      ];
      const cmd = new DrawCommand(layerService, 0, 4, pixels);
      cmd.execute();
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), BLACK)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 1, 0, 4), WHITE)).toBe(true);
      expect(layerService.getPixel(0, 2, 0, 4).r).toBe(255);
    });

    it('should be no-op with empty modifiedPixels', () => {
      const cmd = new DrawCommand(layerService, 0, 4, []);
      expect(() => cmd.execute()).not.toThrow();
    });
  });

  describe('undo', () => {
    it('should restore pixels to oldColor', () => {
      const pixels = [makePixel(0, 0, TRANSPARENT, BLACK)];
      const cmd = new DrawCommand(layerService, 0, 4, pixels);
      cmd.execute();
      cmd.undo();
      const color = layerService.getPixel(0, 0, 0, 4);
      expect(colorsEqual(color, TRANSPARENT)).toBe(true);
    });

    it('should restore multiple pixels', () => {
      const red: Color = { r: 255, g: 0, b: 0, a: 255 };
      const blue: Color = { r: 0, g: 0, b: 255, a: 255 };
      const pixels = [makePixel(0, 0, red, BLACK), makePixel(1, 1, blue, WHITE)];
      // Pre-set pixels to their "old" colors
      layerService.setPixel(0, 0, 0, 4, red);
      layerService.setPixel(0, 1, 1, 4, blue);

      const cmd = new DrawCommand(layerService, 0, 4, pixels);
      cmd.execute();
      cmd.undo();

      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), red)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 1, 1, 4), blue)).toBe(true);
    });
  });

  describe('round-trip', () => {
    it('execute → undo → execute should produce correct final state', () => {
      const pixels = [makePixel(0, 0, TRANSPARENT, BLACK)];
      const cmd = new DrawCommand(layerService, 0, 4, pixels);
      cmd.execute();
      cmd.undo();
      cmd.execute();
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), BLACK)).toBe(true);
    });
  });

  describe('description', () => {
    it('should have default description with pixel count', () => {
      const pixels = [makePixel(0, 0, TRANSPARENT, BLACK), makePixel(1, 0, TRANSPARENT, BLACK)];
      const cmd = new DrawCommand(layerService, 0, 4, pixels);
      expect(cmd.description).toBe('Draw 2 pixel(s)');
    });

    it('should accept custom description', () => {
      const cmd = new DrawCommand(layerService, 0, 4, [], 'Custom draw');
      expect(cmd.description).toBe('Custom draw');
    });
  });
});
