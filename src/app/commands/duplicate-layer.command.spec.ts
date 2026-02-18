import { TestBed } from '@angular/core/testing';
import { DuplicateLayerCommand } from './duplicate-layer.command';
import { LayerService } from '../services/layer.service';
import { Layer } from '../models';

function makeSnapshot(id: string, name: string, width = 4, height = 4): Layer {
  return {
    id,
    name,
    visible: true,
    opacity: 1,
    data: new Uint8ClampedArray(width * height * 4),
  };
}

describe('DuplicateLayerCommand', () => {
  let layerService: LayerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    layerService = TestBed.inject(LayerService);
    layerService.initLayers(4, 4);
  });

  it('should have description "Duplicate layer"', () => {
    const snapshot = makeSnapshot('abc', 'Copy of Layer 1');
    const cmd = new DuplicateLayerCommand(layerService, 1, snapshot);
    expect(cmd.description).toBe('Duplicate layer');
  });

  describe('execute', () => {
    it('should insert the layer at the given index', () => {
      expect(layerService.layerCount()).toBe(1);
      const snapshot = makeSnapshot('new-id', 'Copy of Layer 1');
      const cmd = new DuplicateLayerCommand(layerService, 1, snapshot);
      cmd.execute();

      expect(layerService.layerCount()).toBe(2);
      expect(layerService.layers()[1].id).toBe('new-id');
      expect(layerService.layers()[1].name).toBe('Copy of Layer 1');
    });

    it('should set the active layer to the inserted index', () => {
      const snapshot = makeSnapshot('new-id', 'Copy of Layer 1');
      const cmd = new DuplicateLayerCommand(layerService, 1, snapshot);
      cmd.execute();

      expect(layerService.activeLayerIndex()).toBe(1);
    });

    it('should insert above the source when used with index + 1', () => {
      layerService.addLayer(4, 4);
      // layers: [0: Layer 1, 1: Layer 2]
      const snapshot = makeSnapshot('dup', 'Copy of Layer 1');
      const cmd = new DuplicateLayerCommand(layerService, 1, snapshot);
      cmd.execute();

      // layers: [0: Layer 1, 1: Copy of Layer 1, 2: Layer 2]
      expect(layerService.layers()[0].name).toBe('Layer 1');
      expect(layerService.layers()[1].name).toBe('Copy of Layer 1');
      expect(layerService.layers()[2].name).toBe('Layer 2');
    });

    it('should store a separate data reference (not share the buffer)', () => {
      const sourceData = new Uint8ClampedArray(4 * 4 * 4);
      sourceData[0] = 42;
      const snapshot: Layer = {
        id: 'dup',
        name: 'Copy',
        visible: true,
        opacity: 1,
        data: new Uint8ClampedArray(sourceData),
      };
      const cmd = new DuplicateLayerCommand(layerService, 1, snapshot);
      cmd.execute();

      // Mutating the original source data should not affect the inserted layer
      sourceData[0] = 99;
      expect(layerService.layers()[1].data[0]).toBe(42);
    });
  });

  describe('undo', () => {
    it('should remove the inserted layer', () => {
      const snapshot = makeSnapshot('new-id', 'Copy of Layer 1');
      const cmd = new DuplicateLayerCommand(layerService, 1, snapshot);
      cmd.execute();
      expect(layerService.layerCount()).toBe(2);

      cmd.undo();
      expect(layerService.layerCount()).toBe(1);
      expect(layerService.layers()[0].name).toBe('Layer 1');
    });

    it('should restore layer count after undo', () => {
      layerService.addLayer(4, 4);
      const snapshot = makeSnapshot('dup', 'Copy of Layer 1');
      const cmd = new DuplicateLayerCommand(layerService, 1, snapshot);
      cmd.execute();
      expect(layerService.layerCount()).toBe(3);

      cmd.undo();
      expect(layerService.layerCount()).toBe(2);
    });
  });

  describe('execute after undo (redo)', () => {
    it('should re-insert the layer on redo', () => {
      const snapshot = makeSnapshot('new-id', 'Copy of Layer 1');
      const cmd = new DuplicateLayerCommand(layerService, 1, snapshot);
      cmd.execute();
      cmd.undo();
      cmd.execute();

      expect(layerService.layerCount()).toBe(2);
      expect(layerService.layers()[1].name).toBe('Copy of Layer 1');
    });
  });
});
