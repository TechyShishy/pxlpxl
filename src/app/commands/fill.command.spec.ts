import { TestBed } from '@angular/core/testing';
import { FillCommand } from './fill.command';
import { LayerService } from '../services/layer.service';
import { Color, ModifiedPixel, BLACK, TRANSPARENT, colorsEqual } from '../models';

describe('FillCommand', () => {
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
    it('should set all modified pixels to newColor', () => {
      const pixels = [
        makePixel(0, 0, TRANSPARENT, BLACK),
        makePixel(1, 0, TRANSPARENT, BLACK),
        makePixel(0, 1, TRANSPARENT, BLACK),
      ];
      const cmd = new FillCommand(layerService, 0, 4, pixels);
      cmd.execute();
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), BLACK)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 1, 0, 4), BLACK)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 0, 1, 4), BLACK)).toBe(true);
    });
  });

  describe('undo', () => {
    it('should restore all pixels to oldColor', () => {
      const pixels = [makePixel(0, 0, TRANSPARENT, BLACK), makePixel(1, 0, TRANSPARENT, BLACK)];
      const cmd = new FillCommand(layerService, 0, 4, pixels);
      cmd.execute();
      cmd.undo();
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), TRANSPARENT)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 1, 0, 4), TRANSPARENT)).toBe(true);
    });
  });

  describe('description', () => {
    it('should describe the fill with pixel count', () => {
      const pixels = [makePixel(0, 0, TRANSPARENT, BLACK)];
      const cmd = new FillCommand(layerService, 0, 4, pixels);
      expect(cmd.description).toBe('Fill 1 pixel(s)');
    });
  });
});
