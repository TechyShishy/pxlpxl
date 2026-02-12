import { TestBed } from '@angular/core/testing';
import { HistoryService } from './history.service';
import { LayerService } from './layer.service';
import { DrawCommand } from '../commands/draw.command';
import { FillCommand } from '../commands/fill.command';
import { LayerCommand } from '../commands/layer.command';
import { BLACK, WHITE, TRANSPARENT, Color, ModifiedPixel, colorsEqual } from '../models';

describe('History + Commands Integration', () => {
  let historyService: HistoryService;
  let layerService: LayerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    historyService = TestBed.inject(HistoryService);
    layerService = TestBed.inject(LayerService);
    layerService.initLayers(4, 4);
  });

  function makePixel(x: number, y: number, oldColor: Color, newColor: Color): ModifiedPixel {
    return { coord: { x, y }, oldColor, newColor };
  }

  describe('DrawCommand with HistoryService', () => {
    it('should draw and undo correctly via getPixel', () => {
      const pixels = [makePixel(0, 0, TRANSPARENT, BLACK)];
      const cmd = new DrawCommand(layerService, 0, 4, pixels);
      historyService.execute(cmd);

      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), BLACK)).toBe(true);

      historyService.undo();
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), TRANSPARENT)).toBe(true);
    });

    it('should redo correctly via getPixel', () => {
      const pixels = [makePixel(0, 0, TRANSPARENT, BLACK)];
      const cmd = new DrawCommand(layerService, 0, 4, pixels);
      historyService.execute(cmd);
      historyService.undo();
      historyService.redo();

      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), BLACK)).toBe(true);
    });

    it('should restore canvas to original after undoing all draws', () => {
      const red: Color = { r: 255, g: 0, b: 0, a: 255 };
      const green: Color = { r: 0, g: 255, b: 0, a: 255 };
      const blue: Color = { r: 0, g: 0, b: 255, a: 255 };

      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(0, 0, TRANSPARENT, red)]),
      );
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(1, 0, TRANSPARENT, green)]),
      );
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(2, 0, TRANSPARENT, blue)]),
      );

      // Undo all 3
      historyService.undo();
      historyService.undo();
      historyService.undo();

      // All should be transparent
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), TRANSPARENT)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 1, 0, 4), TRANSPARENT)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 2, 0, 4), TRANSPARENT)).toBe(true);
    });

    it('new command after undo should clear redo stack', () => {
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(0, 0, TRANSPARENT, BLACK)]),
      );
      historyService.undo();

      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(1, 0, TRANSPARENT, WHITE)]),
      );

      expect(historyService.canRedo()).toBe(false);
    });
  });

  describe('FillCommand with HistoryService', () => {
    it('should fill and undo correctly', () => {
      const pixels = [
        makePixel(0, 0, TRANSPARENT, BLACK),
        makePixel(1, 0, TRANSPARENT, BLACK),
        makePixel(0, 1, TRANSPARENT, BLACK),
        makePixel(1, 1, TRANSPARENT, BLACK),
      ];
      const cmd = new FillCommand(layerService, 0, 4, pixels);
      historyService.execute(cmd);

      for (const p of pixels) {
        expect(colorsEqual(layerService.getPixel(0, p.coord.x, p.coord.y, 4), BLACK)).toBe(true);
      }

      historyService.undo();

      for (const p of pixels) {
        expect(colorsEqual(layerService.getPixel(0, p.coord.x, p.coord.y, 4), TRANSPARENT)).toBe(
          true,
        );
      }
    });
  });

  describe('LayerCommand with HistoryService', () => {
    it('should set and undo layer data correctly', () => {
      const previousData = layerService.getLayerData(0)!;
      const newData = new Uint8ClampedArray(4 * 4 * 4);
      // Fill newData with red
      for (let i = 0; i < newData.length; i += 4) {
        newData[i] = 255;
        newData[i + 3] = 255;
      }

      const cmd = new LayerCommand(layerService, 0, previousData, newData);
      historyService.execute(cmd);

      const pixel = layerService.getPixel(0, 0, 0, 4);
      expect(pixel.r).toBe(255);
      expect(pixel.a).toBe(255);

      historyService.undo();

      const restored = layerService.getPixel(0, 0, 0, 4);
      expect(colorsEqual(restored, TRANSPARENT)).toBe(true);
    });
  });

  describe('Signal reactivity after undo/redo', () => {
    it('DrawCommand undo should NOT change layers() signal identity (setPixel mutates in-place)', () => {
      // This documents the known behavior: setPixel mutates the buffer
      // directly without calling layers.update(), so the signal reference
      // stays the same.
      const pixels = [makePixel(0, 0, TRANSPARENT, BLACK)];
      const cmd = new DrawCommand(layerService, 0, 4, pixels);
      historyService.execute(cmd);

      const layersRef = layerService.layers();
      historyService.undo();

      // Signal identity unchanged because setPixel doesn't trigger update
      expect(layerService.layers()).toBe(layersRef);
    });

    it('LayerCommand undo SHOULD change layers() signal identity', () => {
      const previousData = layerService.getLayerData(0)!;
      const newData = new Uint8ClampedArray(4 * 4 * 4);
      const cmd = new LayerCommand(layerService, 0, previousData, newData);
      historyService.execute(cmd);

      const layersRef = layerService.layers();
      historyService.undo();

      // setLayerData properly calls layers.update()
      expect(layerService.layers()).not.toBe(layersRef);
    });

    it('DrawCommand undo pixel values should still be correct even though signal does not change', () => {
      // Even though the signal reference doesn't change, the underlying
      // buffer IS correctly modified. Reading getPixel should work fine.
      const red: Color = { r: 255, g: 0, b: 0, a: 255 };
      const pixels = [makePixel(1, 1, TRANSPARENT, red)];
      const cmd = new DrawCommand(layerService, 0, 4, pixels);
      historyService.execute(cmd);

      expect(colorsEqual(layerService.getPixel(0, 1, 1, 4), red)).toBe(true);

      historyService.undo();

      // Pixel value IS restored (buffer mutated correctly)
      expect(colorsEqual(layerService.getPixel(0, 1, 1, 4), TRANSPARENT)).toBe(true);
    });
  });
});
