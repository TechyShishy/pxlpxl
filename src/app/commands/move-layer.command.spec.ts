import { TestBed } from '@angular/core/testing';
import { MoveLayerCommand } from './move-layer.command';
import { LayerService } from '../services/layer.service';

describe('MoveLayerCommand', () => {
  let layerService: LayerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    layerService = TestBed.inject(LayerService);
    layerService.initLayers(4, 4);
    // Add two more layers so we have three total: [Layer 1, Layer 2, Layer 3]
    layerService.addLayer(4, 4);
    layerService.addLayer(4, 4);
  });

  it('should have description "Move layer"', () => {
    const cmd = new MoveLayerCommand(layerService, 0, 2);
    expect(cmd.description).toBe('Move layer');
  });

  describe('execute', () => {
    it('should move a layer from the given fromIndex to toIndex', () => {
      const nameAtZero = layerService.layers()[0].name;
      const cmd = new MoveLayerCommand(layerService, 0, 2);
      cmd.execute();

      expect(layerService.layers()[2].name).toBe(nameAtZero);
    });

    it('should move a layer upward (higher index to lower index)', () => {
      const nameAtTwo = layerService.layers()[2].name;
      const cmd = new MoveLayerCommand(layerService, 2, 0);
      cmd.execute();

      expect(layerService.layers()[0].name).toBe(nameAtTwo);
    });

    it('should keep the layer count the same after the move', () => {
      const countBefore = layerService.layerCount();
      const cmd = new MoveLayerCommand(layerService, 0, 2);
      cmd.execute();

      expect(layerService.layerCount()).toBe(countBefore);
    });
  });

  describe('undo', () => {
    it('should restore the original layer order after undo', () => {
      const originalNames = layerService.layers().map((l) => l.name);
      const cmd = new MoveLayerCommand(layerService, 0, 2);
      cmd.execute();
      cmd.undo();

      const restoredNames = layerService.layers().map((l) => l.name);
      expect(restoredNames).toEqual(originalNames);
    });

    it('should restore order for an upward move after undo', () => {
      const originalNames = layerService.layers().map((l) => l.name);
      const cmd = new MoveLayerCommand(layerService, 2, 0);
      cmd.execute();
      cmd.undo();

      const restoredNames = layerService.layers().map((l) => l.name);
      expect(restoredNames).toEqual(originalNames);
    });

    it('should correctly handle adjacent swap + undo', () => {
      const originalNames = layerService.layers().map((l) => l.name);
      const cmd = new MoveLayerCommand(layerService, 1, 2);
      cmd.execute();
      cmd.undo();

      const restoredNames = layerService.layers().map((l) => l.name);
      expect(restoredNames).toEqual(originalNames);
    });
  });

  describe('activeLayerIndex tracking', () => {
    it('should follow the moved layer when it is active', () => {
      layerService.setActiveLayer(0);
      expect(layerService.activeLayerIndex()).toBe(0);
      const activeName = layerService.layers()[0].name;

      const cmd = new MoveLayerCommand(layerService, 0, 2);
      cmd.execute();

      expect(layerService.activeLayerIndex()).toBe(2);
      expect(layerService.layers()[2].name).toBe(activeName);
    });

    it('should shift active down when active is between from and to (move down)', () => {
      layerService.setActiveLayer(1);
      const activeName = layerService.layers()[1].name;

      // Move layer 0 to index 2 — active (1) is between from (0) and to (2)
      const cmd = new MoveLayerCommand(layerService, 0, 2);
      cmd.execute();

      expect(layerService.activeLayerIndex()).toBe(0);
      expect(layerService.layers()[0].name).toBe(activeName);
    });

    it('should shift active up when active is between to and from (move up)', () => {
      layerService.setActiveLayer(1);
      const activeName = layerService.layers()[1].name;

      // Move layer 2 to index 0 — active (1) is between to (0) and from (2)
      const cmd = new MoveLayerCommand(layerService, 2, 0);
      cmd.execute();

      expect(layerService.activeLayerIndex()).toBe(2);
      expect(layerService.layers()[2].name).toBe(activeName);
    });

    it('should restore activeLayerIndex on undo', () => {
      layerService.setActiveLayer(0);
      const cmd = new MoveLayerCommand(layerService, 0, 2);
      cmd.execute();
      expect(layerService.activeLayerIndex()).toBe(2);

      cmd.undo();
      expect(layerService.activeLayerIndex()).toBe(0);
    });
  });

  describe('bounds checking', () => {
    it('should no-op when fromIndex is out of range', () => {
      const originalNames = layerService.layers().map((l) => l.name);
      const cmd = new MoveLayerCommand(layerService, 5, 0);
      cmd.execute();
      expect(layerService.layers().map((l) => l.name)).toEqual(originalNames);
      expect(layerService.layerCount()).toBe(3);
    });

    it('should no-op when toIndex is out of range', () => {
      const originalNames = layerService.layers().map((l) => l.name);
      const cmd = new MoveLayerCommand(layerService, 0, 5);
      cmd.execute();
      expect(layerService.layers().map((l) => l.name)).toEqual(originalNames);
      expect(layerService.layerCount()).toBe(3);
    });

    it('should no-op when fromIndex is negative', () => {
      const originalNames = layerService.layers().map((l) => l.name);
      const cmd = new MoveLayerCommand(layerService, -1, 0);
      cmd.execute();
      expect(layerService.layers().map((l) => l.name)).toEqual(originalNames);
    });
  });
});
