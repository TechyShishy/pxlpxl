import { TestBed } from '@angular/core/testing';
import { serializeCommand, deserializeCommand } from './command-serialization';
import { DrawCommand } from './draw.command';
import { FillCommand } from './fill.command';
import { LayerCommand } from './layer.command';
import { DuplicateLayerCommand } from './duplicate-layer.command';
import { MoveLayerCommand } from './move-layer.command';
import { MovePaletteCommand } from './move-palette.command';
import { ReplaceColorCommand } from './replace-color.command';
import { LayerService } from '../services/layer.service';
import { ColorService } from '../services/color.service';
import {
  ModifiedPixel,
  Color,
  TRANSPARENT,
  BLACK,
  WHITE,
  colorsEqual,
} from '../models';
import { Layer } from '../models';

function makePixel(x: number, y: number, oldColor: Color, newColor: Color): ModifiedPixel {
  return { coord: { x, y }, oldColor, newColor };
}

describe('Command Serialization', () => {
  let layerService: LayerService;
  let colorService: ColorService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    layerService = TestBed.inject(LayerService);
    colorService = TestBed.inject(ColorService);
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

      const restored = deserializeCommand(serialized, layerService, colorService) as DrawCommand;
      expect(restored.description).toBe('Test draw');
      expect(restored.modifiedPixels.length).toBe(1);
      expect(restored.modifiedPixels[0].coord.x).toBe(1);
      expect(restored.modifiedPixels[0].coord.y).toBe(2);
    });

    it('should produce a working command after deserialization', () => {
      const pixels = [makePixel(0, 0, TRANSPARENT, BLACK)];
      const cmd = new DrawCommand(layerService, 0, 4, pixels);
      const serialized = serializeCommand(cmd)!;
      const restored = deserializeCommand(serialized, layerService, colorService);

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

      const restored = deserializeCommand(serialized, layerService, colorService) as FillCommand;
      expect(restored.description).toContain('Fill');
      expect(restored.modifiedPixels.length).toBe(2);
    });

    it('should produce a working command after deserialization', () => {
      const pixels = [makePixel(0, 0, TRANSPARENT, WHITE)];
      const cmd = new FillCommand(layerService, 0, 4, pixels);
      const serialized = serializeCommand(cmd)!;
      const restored = deserializeCommand(serialized, layerService, colorService);

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

      const restored = deserializeCommand(serialized, layerService, colorService) as LayerCommand;
      expect(restored.description).toBe('Layer op');
    });

    it('should produce a working command after deserialization', () => {
      const prev = layerService.getLayerData(0)!;
      const next = new Uint8ClampedArray(prev.length);
      next[0] = 255;
      next[3] = 255;
      const cmd = new LayerCommand(layerService, 0, prev, next, 'Swap');

      const serialized = serializeCommand(cmd)!;
      const restored = deserializeCommand(serialized, layerService, colorService);

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
      expect(() => deserializeCommand(badEntry, layerService, colorService)).toThrow('Unknown history entry type');
    });
  });

  describe('DuplicateLayerCommand round-trip', () => {
    it('should serialize and deserialize a duplicate-layer command', () => {
      const layer: Layer = {
        id: 'test-id',
        name: 'Copy of Layer 1',
        visible: true,
        opacity: 0.75,
        data: new Uint8ClampedArray(4 * 4 * 4),
      };
      layer.data[0] = 123;

      const cmd = new DuplicateLayerCommand(layerService, 1, layer);
      const serialized = serializeCommand(cmd)!;

      expect(serialized.type).toBe('duplicate-layer');
      expect(serialized.description).toBe('Duplicate layer');
      expect(serialized.insertIndex).toBe(1);
      expect(serialized.duplicatedLayer).toBeDefined();
      expect(serialized.duplicatedLayer?.id).toBe('test-id');
      expect(serialized.duplicatedLayer?.name).toBe('Copy of Layer 1');
      expect(serialized.duplicatedLayer?.opacity).toBe(0.75);

      const restored = deserializeCommand(serialized, layerService, colorService) as DuplicateLayerCommand;
      expect(restored.description).toBe('Duplicate layer');
      expect(restored.insertIndex).toBe(1);
      expect(restored.layer.id).toBe('test-id');
      expect(restored.layer.name).toBe('Copy of Layer 1');
      expect(restored.layer.data[0]).toBe(123);
    });

    it('should produce a working command after deserialization', () => {
      const layer: Layer = {
        id: crypto.randomUUID(),
        name: 'Copy of Layer 1',
        visible: true,
        opacity: 1,
        data: new Uint8ClampedArray(4 * 4 * 4),
      };
      const cmd = new DuplicateLayerCommand(layerService, 1, layer);
      const serialized = serializeCommand(cmd)!;
      const restored = deserializeCommand(serialized, layerService, colorService);

      restored.execute();
      expect(layerService.layerCount()).toBe(2);
      expect(layerService.layers()[1].name).toBe('Copy of Layer 1');

      restored.undo();
      expect(layerService.layerCount()).toBe(1);
    });
  });

  describe('MoveLayerCommand round-trip', () => {
    beforeEach(() => {
      // Start with two layers so a move is meaningful
      layerService.addLayer(4, 4);
    });

    it('should serialize and deserialize a move-layer command', () => {
      const cmd = new MoveLayerCommand(layerService, 0, 1);
      const serialized = serializeCommand(cmd)!;

      expect(serialized.type).toBe('move-layer');
      expect(serialized.description).toBe('Move layer');
      expect(serialized.fromIndex).toBe(0);
      expect(serialized.toIndex).toBe(1);

      const restored = deserializeCommand(serialized, layerService, colorService) as MoveLayerCommand;
      expect(restored.description).toBe('Move layer');
      expect(restored.fromIndex).toBe(0);
      expect(restored.toIndex).toBe(1);
    });

    it('should produce a working command after deserialization', () => {
      const nameAtZero = layerService.layers()[0].name;
      const nameAtOne = layerService.layers()[1].name;

      const cmd = new MoveLayerCommand(layerService, 0, 1);
      const serialized = serializeCommand(cmd)!;
      const restored = deserializeCommand(serialized, layerService, colorService);

      restored.execute();
      expect(layerService.layers()[1].name).toBe(nameAtZero);
      expect(layerService.layers()[0].name).toBe(nameAtOne);

      restored.undo();
      expect(layerService.layers()[0].name).toBe(nameAtZero);
      expect(layerService.layers()[1].name).toBe(nameAtOne);
    });
  });

  describe('ReplaceColorCommand round-trip', () => {
    const OLD_COLOR: Color = { r: 255, g: 0, b: 0, a: 255 };
    const NEW_COLOR: Color = { r: 0, g: 0, b: 255, a: 255 };

    it('should serialize and deserialize a replace-color command', () => {
      colorService.updatePaletteColor(0, OLD_COLOR);
      const cmd = new ReplaceColorCommand(layerService, colorService, 0, OLD_COLOR, NEW_COLOR);

      const serialized = serializeCommand(cmd)!;
      expect(serialized.type).toBe('replace-color');
      expect(serialized.description).toBe('Replace palette color');
      expect(serialized.paletteIndex).toBe(0);
      expect(serialized.oldColor).toEqual(OLD_COLOR);
      expect(serialized.newColor).toEqual(NEW_COLOR);
    });

    it('should produce a working command after deserialization', () => {
      colorService.updatePaletteColor(0, OLD_COLOR);
      layerService.setPixel(0, 0, 0, 4, OLD_COLOR);

      // Serialize BEFORE executing so the deserialized command can run freely
      const cmd = new ReplaceColorCommand(layerService, colorService, 0, OLD_COLOR, NEW_COLOR);
      const serialized = serializeCommand(cmd)!;
      const restored = deserializeCommand(serialized, layerService, colorService);

      // execute on the restored command: pixels and palette switch to NEW_COLOR
      restored.execute();
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), NEW_COLOR)).toBe(true);
      expect(colorsEqual(colorService.palette()[0], NEW_COLOR)).toBe(true);

      // undo reverts to OLD_COLOR
      restored.undo();
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), OLD_COLOR)).toBe(true);
      expect(colorsEqual(colorService.palette()[0], OLD_COLOR)).toBe(true);
    });

    it('should throw on deserialization if fields are missing', () => {
      const bad = { type: 'replace-color' as const, description: 'x', layerIndex: 0, canvasWidth: 0 };
      expect(() => deserializeCommand(bad, layerService, colorService)).toThrow(
        'replace-color entry is missing paletteIndex, oldColor, or newColor',
      );
    });
  });

  describe('MovePaletteCommand round-trip', () => {
    const RED: Color = { r: 255, g: 0, b: 0, a: 255 };
    const GREEN: Color = { r: 0, g: 255, b: 0, a: 255 };
    const BLUE: Color = { r: 0, g: 0, b: 255, a: 255 };
    const YELLOW: Color = { r: 255, g: 255, b: 0, a: 255 };

    beforeEach(() => {
      colorService.setPalette([RED, GREEN, BLUE, YELLOW]);
    });

    it('should serialize and deserialize a move-palette command', () => {
      const cmd = new MovePaletteCommand(colorService, 0, 2);
      const serialized = serializeCommand(cmd)!;

      expect(serialized.type).toBe('move-palette');
      expect(serialized.description).toBe('Move palette entry');
      expect(serialized.fromIndex).toBe(0);
      expect(serialized.toIndex).toBe(2);

      const restored = deserializeCommand(serialized, layerService, colorService) as MovePaletteCommand;
      expect(restored.description).toBe('Move palette entry');
      expect(restored.fromIndex).toBe(0);
      expect(restored.toIndex).toBe(2);
    });

    it('should produce a working command after deserialization', () => {
      const cmd = new MovePaletteCommand(colorService, 0, 2);
      const serialized = serializeCommand(cmd)!;
      const restored = deserializeCommand(serialized, layerService, colorService);

      restored.execute();
      // RED moved from 0 to 2: [GREEN, BLUE, RED, YELLOW]
      expect(colorService.palette()[0]).toEqual(GREEN);
      expect(colorService.palette()[2]).toEqual(RED);

      restored.undo();
      // back to [RED, GREEN, BLUE, YELLOW]
      expect(colorService.palette()[0]).toEqual(RED);
      expect(colorService.palette()[2]).toEqual(BLUE);
    });

    it('should throw on deserialization if fields are missing', () => {
      const bad = { type: 'move-palette' as const, description: 'x', layerIndex: 0, canvasWidth: 0 };
      expect(() => deserializeCommand(bad, layerService, colorService)).toThrow(
        'move-palette entry is missing fromIndex or toIndex',
      );
    });
  });
});
