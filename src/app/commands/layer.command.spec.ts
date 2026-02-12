import { TestBed } from '@angular/core/testing';
import { LayerCommand } from './layer.command';
import { LayerService } from '../services/layer.service';
import { BLACK, colorsEqual, TRANSPARENT } from '../models';

describe('LayerCommand', () => {
  let layerService: LayerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    layerService = TestBed.inject(LayerService);
    layerService.initLayers(4, 4);
  });

  describe('execute', () => {
    it('should set layer data to newData', () => {
      const previousData = layerService.getLayerData(0)!;
      const newData = new Uint8ClampedArray(4 * 4 * 4);
      newData[0] = 255;
      newData[3] = 255;

      const cmd = new LayerCommand(layerService, 0, previousData, newData);
      cmd.execute();

      const pixel = layerService.getPixel(0, 0, 0, 4);
      expect(pixel.r).toBe(255);
      expect(pixel.a).toBe(255);
    });
  });

  describe('undo', () => {
    it('should restore layer data to previousData', () => {
      const previousData = layerService.getLayerData(0)!;
      const newData = new Uint8ClampedArray(4 * 4 * 4);
      newData[0] = 255;
      newData[3] = 255;

      const cmd = new LayerCommand(layerService, 0, previousData, newData);
      cmd.execute();
      cmd.undo();

      const pixel = layerService.getPixel(0, 0, 0, 4);
      expect(colorsEqual(pixel, TRANSPARENT)).toBe(true);
    });
  });

  describe('signal reactivity', () => {
    it('should trigger layers signal update on execute', () => {
      const previousData = layerService.getLayerData(0)!;
      const newData = new Uint8ClampedArray(4 * 4 * 4);
      const layersBefore = layerService.layers();

      const cmd = new LayerCommand(layerService, 0, previousData, newData);
      cmd.execute();

      // setLayerData should create a new array reference
      expect(layerService.layers()).not.toBe(layersBefore);
    });

    it('should trigger layers signal update on undo', () => {
      const previousData = layerService.getLayerData(0)!;
      const newData = new Uint8ClampedArray(4 * 4 * 4);

      const cmd = new LayerCommand(layerService, 0, previousData, newData);
      cmd.execute();

      const layersAfterExecute = layerService.layers();
      cmd.undo();

      expect(layerService.layers()).not.toBe(layersAfterExecute);
    });
  });

  describe('description', () => {
    it('should default to "Layer operation"', () => {
      const cmd = new LayerCommand(
        layerService,
        0,
        new Uint8ClampedArray(0),
        new Uint8ClampedArray(0),
      );
      expect(cmd.description).toBe('Layer operation');
    });

    it('should accept custom description', () => {
      const cmd = new LayerCommand(
        layerService,
        0,
        new Uint8ClampedArray(0),
        new Uint8ClampedArray(0),
        'Clear layer',
      );
      expect(cmd.description).toBe('Clear layer');
    });
  });
});
