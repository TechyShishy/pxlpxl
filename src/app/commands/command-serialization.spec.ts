import { TestBed } from '@angular/core/testing';
import { serializeCommand, deserializeCommand } from './command-serialization';
import { DrawCommand } from './draw.command';
import { FillCommand } from './fill.command';
import { LayerCommand } from './layer.command';
import { LayerService } from '../services/layer.service';
import {
  ModifiedPixel,
  Color,
  TRANSPARENT,
  BLACK,
  WHITE,
  colorsEqual,
} from '../models';

function makePixel(x: number, y: number, oldColor: Color, newColor: Color): ModifiedPixel {
  return { coord: { x, y }, oldColor, newColor };
}

describe('Command Serialization', () => {
  let layerService: LayerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    layerService = TestBed.inject(LayerService);
    layerService.initLayers(4, 4);
  });

  describe('DrawCommand round-trip', () => {
    it('should serialize and deserialize a draw command', () => {
      const pixels = [makePixel(1, 2, TRANSPARENT, BLACK)];
      const cmd = new DrawCommand(layerService, 0, 4, pixels, 'Test draw');

      const serialized = serializeCommand(cmd)!;
      expect(serialized.type).toBe('draw');
      expect(serialized.description).toBe('Test draw');
      expect(serialized.layerIndex).toBe(0);
      expect(serialized.canvasWidth).toBe(4);
      expect(serialized.modifiedPixels?.length).toBe(1);

      const restored = deserializeCommand(serialized, layerService) as DrawCommand;
      expect(restored.description).toBe('Test draw');
      expect(restored.modifiedPixels.length).toBe(1);
      expect(restored.modifiedPixels[0].coord.x).toBe(1);
      expect(restored.modifiedPixels[0].coord.y).toBe(2);
    });

    it('should produce a working command after deserialization', () => {
      const pixels = [makePixel(0, 0, TRANSPARENT, BLACK)];
      const cmd = new DrawCommand(layerService, 0, 4, pixels);
      const serialized = serializeCommand(cmd)!;
      const restored = deserializeCommand(serialized, layerService);

      restored.execute();
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), BLACK)).toBe(true);

      restored.undo();
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), TRANSPARENT)).toBe(true);
    });
  });

  describe('FillCommand round-trip', () => {
    it('should serialize and deserialize a fill command', () => {
      const pixels = [
        makePixel(0, 0, TRANSPARENT, WHITE),
        makePixel(1, 0, TRANSPARENT, WHITE),
      ];
      const cmd = new FillCommand(layerService, 0, 4, pixels);

      const serialized = serializeCommand(cmd)!;
      expect(serialized.type).toBe('fill');
      expect(serialized.modifiedPixels?.length).toBe(2);

      const restored = deserializeCommand(serialized, layerService) as FillCommand;
      expect(restored.description).toContain('Fill');
      expect(restored.modifiedPixels.length).toBe(2);
    });

    it('should produce a working command after deserialization', () => {
      const pixels = [makePixel(0, 0, TRANSPARENT, WHITE)];
      const cmd = new FillCommand(layerService, 0, 4, pixels);
      const serialized = serializeCommand(cmd)!;
      const restored = deserializeCommand(serialized, layerService);

      restored.execute();
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), WHITE)).toBe(true);

      restored.undo();
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), TRANSPARENT)).toBe(true);
    });
  });

  describe('LayerCommand round-trip', () => {
    it('should serialize and deserialize a layer command', () => {
      const prev = new Uint8ClampedArray(4 * 4 * 4);
      const next = new Uint8ClampedArray(4 * 4 * 4);
      next[0] = 255; // set first pixel red channel
      const cmd = new LayerCommand(layerService, 0, prev, next, 'Layer op');

      const serialized = serializeCommand(cmd)!;
      expect(serialized.type).toBe('layer');
      expect(serialized.description).toBe('Layer op');
      expect(serialized.previousData).toBeDefined();
      expect(serialized.newData).toBeDefined();

      const restored = deserializeCommand(serialized, layerService) as LayerCommand;
      expect(restored.description).toBe('Layer op');
    });

    it('should produce a working command after deserialization', () => {
      const prev = layerService.getLayerData(0)!;
      const next = new Uint8ClampedArray(prev.length);
      next[0] = 255;
      next[3] = 255;
      const cmd = new LayerCommand(layerService, 0, prev, next, 'Swap');

      const serialized = serializeCommand(cmd)!;
      const restored = deserializeCommand(serialized, layerService);

      restored.execute();
      const pixel = layerService.getPixel(0, 0, 0, 4);
      expect(pixel.r).toBe(255);

      restored.undo();
      const reverted = layerService.getPixel(0, 0, 0, 4);
      expect(reverted.r).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should return null for unknown command type on serialize', () => {
      const unknownCmd = {
        description: 'mystery',
        execute: () => {},
        undo: () => {},
      };
      expect(serializeCommand(unknownCmd)).toBeNull();
    });

    it('should throw for unknown entry type on deserialize', () => {
      const badEntry = {
        type: 'unknown' as 'draw',
        description: 'bad',
        layerIndex: 0,
        canvasWidth: 4,
      };
      expect(() => deserializeCommand(badEntry, layerService)).toThrow('Unknown history entry type');
    });
  });
});
