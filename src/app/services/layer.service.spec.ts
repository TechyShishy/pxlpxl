import { TestBed } from '@angular/core/testing';
import { LayerService } from './layer.service';
import { BLACK, WHITE, TRANSPARENT, Color, colorsEqual } from '../models';

describe('LayerService', () => {
  let service: LayerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LayerService);
  });

  describe('initLayers', () => {
    it('should create 1 layer', () => {
      service.initLayers(8, 8);
      expect(service.layerCount()).toBe(1);
    });

    it('should set active layer to 0', () => {
      service.initLayers(8, 8);
      expect(service.activeLayerIndex()).toBe(0);
    });

    it('should create a layer named "Layer 1"', () => {
      service.initLayers(8, 8);
      expect(service.layers()[0].name).toBe('Layer 1');
    });

    it('should create layer data of correct size', () => {
      service.initLayers(16, 8);
      expect(service.layers()[0].data.length).toBe(16 * 8 * 4);
    });

    it('should create layer with zeroed data', () => {
      service.initLayers(4, 4);
      const data = service.layers()[0].data;
      for (let i = 0; i < data.length; i++) {
        expect(data[i]).toBe(0);
      }
    });

    it('should set layer as visible with opacity 1', () => {
      service.initLayers(4, 4);
      expect(service.layers()[0].visible).toBe(true);
      expect(service.layers()[0].opacity).toBe(1);
    });
  });

  describe('addLayer', () => {
    beforeEach(() => service.initLayers(8, 8));

    it('should add a new layer', () => {
      service.addLayer(8, 8);
      expect(service.layerCount()).toBe(2);
    });

    it('should set active index to the new layer', () => {
      service.addLayer(8, 8);
      expect(service.activeLayerIndex()).toBe(1);
    });

    it('should name layers sequentially', () => {
      service.addLayer(8, 8);
      expect(service.layers()[1].name).toBe('Layer 2');
      service.addLayer(8, 8);
      expect(service.layers()[2].name).toBe('Layer 3');
    });

    it('should create layer with correct data size', () => {
      service.addLayer(8, 8);
      expect(service.layers()[1].data.length).toBe(8 * 8 * 4);
    });
  });

  describe('removeLayer', () => {
    beforeEach(() => {
      service.initLayers(4, 4);
      service.addLayer(4, 4);
      service.addLayer(4, 4);
    });

    it('should remove the specified layer', () => {
      service.removeLayer(1);
      expect(service.layerCount()).toBe(2);
    });

    it('should not remove the last remaining layer', () => {
      service.removeLayer(2);
      service.removeLayer(1);
      service.removeLayer(0); // should be blocked
      expect(service.layerCount()).toBe(1);
    });

    it('should adjust active index if at end of list', () => {
      service.setActiveLayer(2);
      service.removeLayer(2);
      expect(service.activeLayerIndex()).toBe(1);
    });

    it('should keep active index if removing below active', () => {
      service.setActiveLayer(2);
      service.removeLayer(0);
      // Active was 2, removing index 0 shifts it down to 1 to follow the same layer
      expect(service.activeLayerIndex()).toBe(1);
    });

    it('should follow the same layer identity when removing below active', () => {
      // 4 layers: [L0, L1, L2, L3], active = 2
      service.addLayer(4, 4);
      service.setActiveLayer(2);
      const activeName = service.layers()[2].name;
      service.removeLayer(0);
      // After removing L0: [L1, L2, L3], active should be 1 (was L2, now at index 1)
      expect(service.activeLayerIndex()).toBe(1);
      expect(service.layers()[1].name).toBe(activeName);
    });
  });

  describe('setActiveLayer', () => {
    beforeEach(() => {
      service.initLayers(4, 4);
      service.addLayer(4, 4);
    });

    it('should set active layer to valid index', () => {
      service.setActiveLayer(1);
      expect(service.activeLayerIndex()).toBe(1);
    });

    it('should ignore negative index', () => {
      service.setActiveLayer(0);
      service.setActiveLayer(-1);
      expect(service.activeLayerIndex()).toBe(0);
    });

    it('should ignore index >= layerCount', () => {
      service.setActiveLayer(0);
      service.setActiveLayer(5);
      expect(service.activeLayerIndex()).toBe(0);
    });
  });

  describe('activeLayer', () => {
    it('should return null when no layers exist', () => {
      expect(service.activeLayer()).toBeNull();
    });

    it('should return the active layer', () => {
      service.initLayers(4, 4);
      const active = service.activeLayer();
      expect(active).not.toBeNull();
      expect(active!.name).toBe('Layer 1');
    });
  });

  describe('toggleVisibility', () => {
    beforeEach(() => service.initLayers(4, 4));

    it('should toggle visibility to false', () => {
      service.toggleVisibility(0);
      expect(service.layers()[0].visible).toBe(false);
    });

    it('should toggle visibility back to true', () => {
      service.toggleVisibility(0);
      service.toggleVisibility(0);
      expect(service.layers()[0].visible).toBe(true);
    });

    it('should not affect other layers', () => {
      service.addLayer(4, 4);
      service.toggleVisibility(0);
      expect(service.layers()[1].visible).toBe(true);
    });
  });

  describe('setOpacity', () => {
    beforeEach(() => service.initLayers(4, 4));

    it('should set opacity to given value', () => {
      service.setOpacity(0, 0.5);
      expect(service.layers()[0].opacity).toBe(0.5);
    });

    it('should clamp opacity to 0 for negative values', () => {
      service.setOpacity(0, -0.5);
      expect(service.layers()[0].opacity).toBe(0);
    });

    it('should clamp opacity to 1 for values > 1', () => {
      service.setOpacity(0, 2.0);
      expect(service.layers()[0].opacity).toBe(1);
    });

    it('should accept 0', () => {
      service.setOpacity(0, 0);
      expect(service.layers()[0].opacity).toBe(0);
    });

    it('should accept 1', () => {
      service.setOpacity(0, 0.5);
      service.setOpacity(0, 1);
      expect(service.layers()[0].opacity).toBe(1);
    });
  });

  describe('renameLayer', () => {
    beforeEach(() => service.initLayers(4, 4));

    it('should rename the layer', () => {
      service.renameLayer(0, 'Background');
      expect(service.layers()[0].name).toBe('Background');
    });

    it('should not affect other layers', () => {
      service.addLayer(4, 4);
      service.renameLayer(0, 'BG');
      expect(service.layers()[1].name).toBe('Layer 2');
    });
  });

  describe('moveLayer', () => {
    beforeEach(() => {
      service.initLayers(4, 4);
      service.addLayer(4, 4);
      service.addLayer(4, 4);
      // Layers: [Layer 1, Layer 2, Layer 3]
    });

    it('should move layer forward (from < to)', () => {
      const layer1Name = service.layers()[0].name;
      service.moveLayer(0, 2);
      expect(service.layers()[2].name).toBe(layer1Name);
    });

    it('should move layer backward (from > to)', () => {
      const layer3Name = service.layers()[2].name;
      service.moveLayer(2, 0);
      expect(service.layers()[0].name).toBe(layer3Name);
    });

    it('should be no-op when from === to', () => {
      const before = service.layers().map((l) => l.name);
      service.moveLayer(1, 1);
      const after = service.layers().map((l) => l.name);
      expect(after).toEqual(before);
    });

    it('should update active index to follow the moved layer when it is active', () => {
      service.setActiveLayer(0);
      service.moveLayer(0, 2);
      expect(service.activeLayerIndex()).toBe(2);
    });

    it('should not adjust active index when a different layer is moved', () => {
      // Active is Layer 1 (index 0). Move Layer 3 (index 2) to index 0.
      // After move: [Layer 3, Layer 1, Layer 2]. Layer 1 is now at index 1.
      // But the service only adjusts active if activeLayerIndex() === fromIndex.
      // So active stays at 0, which now points to "Layer 3" — WRONG.
      // This test documents the bug.
      service.setActiveLayer(0);
      const activeLayerName = service.activeLayer()!.name; // "Layer 1"
      service.moveLayer(2, 0);
      // Active should still point to the same layer identity
      // Currently it stays at index 0, which is now "Layer 3"
      const newActiveName = service.activeLayer()!.name;
      expect(newActiveName).toBe(activeLayerName); // Expected to FAIL
    });
  });

  describe('getPixel', () => {
    beforeEach(() => service.initLayers(4, 4));

    it('should return TRANSPARENT for zeroed pixel', () => {
      const color = service.getPixel(0, 0, 0, 4);
      expect(colorsEqual(color, TRANSPARENT)).toBe(true);
    });

    it('should return correct color after manual data write', () => {
      const layer = service.layers()[0];
      // Set pixel (1, 0) to red
      layer.data[4] = 255;
      layer.data[5] = 0;
      layer.data[6] = 0;
      layer.data[7] = 255;
      const color = service.getPixel(0, 1, 0, 4);
      expect(color).toEqual({ r: 255, g: 0, b: 0, a: 255 });
    });

    it('should return TRANSPARENT-like color for invalid layer index', () => {
      const color = service.getPixel(99, 0, 0, 4);
      expect(colorsEqual(color, TRANSPARENT)).toBe(true);
    });
  });

  describe('setPixel', () => {
    beforeEach(() => service.initLayers(4, 4));

    it('should write correct RGBA to buffer', () => {
      const color: Color = { r: 100, g: 150, b: 200, a: 128 };
      service.setPixel(0, 2, 1, 4, color);
      const readBack = service.getPixel(0, 2, 1, 4);
      expect(readBack).toEqual(color);
    });

    it('should silently ignore invalid layer index', () => {
      expect(() => {
        service.setPixel(99, 0, 0, 4, BLACK);
      }).not.toThrow();
    });

    it('should NOT trigger signal identity change (mutates in-place)', () => {
      const layersBefore = service.layers();
      service.setPixel(0, 0, 0, 4, BLACK);
      const layersAfter = service.layers();
      // Same array reference — setPixel does NOT call layers.update()
      expect(layersAfter).toBe(layersBefore);
    });
  });

  describe('getLayerData', () => {
    beforeEach(() => service.initLayers(4, 4));

    it('should return a Uint8ClampedArray clone', () => {
      const data = service.getLayerData(0);
      expect(data).toBeInstanceOf(Uint8ClampedArray);
      expect(data).not.toBe(service.layers()[0].data);
    });

    it('should return null for invalid index', () => {
      expect(service.getLayerData(99)).toBeNull();
    });

    it('should not be affected by subsequent pixel changes', () => {
      const snapshot = service.getLayerData(0)!;
      service.setPixel(0, 0, 0, 4, BLACK);
      expect(snapshot[3]).toBe(0); // alpha was 0 (transparent) before setPixel
    });
  });

  describe('setLayerData', () => {
    beforeEach(() => service.initLayers(4, 4));

    it('should replace layer data', () => {
      const newData = new Uint8ClampedArray(4 * 4 * 4);
      newData[0] = 255;
      service.setLayerData(0, newData);
      expect(service.layers()[0].data[0]).toBe(255);
    });

    it('should trigger signal identity change (creates new layer object)', () => {
      const layersBefore = service.layers();
      const newData = new Uint8ClampedArray(4 * 4 * 4);
      service.setLayerData(0, newData);
      const layersAfter = service.layers();
      expect(layersAfter).not.toBe(layersBefore);
    });

    it('should create an independent copy of the data', () => {
      const newData = new Uint8ClampedArray(4 * 4 * 4);
      newData[0] = 42;
      service.setLayerData(0, newData);
      newData[0] = 99; // mutate original
      expect(service.layers()[0].data[0]).toBe(42);
    });

    it('should not affect other layers', () => {
      service.addLayer(4, 4);
      service.setPixel(1, 0, 0, 4, BLACK);
      const newData = new Uint8ClampedArray(4 * 4 * 4);
      newData[0] = 111;
      service.setLayerData(0, newData);
      // Layer 1 should be untouched
      const layer1Pixel = service.getPixel(1, 0, 0, 4);
      expect(layer1Pixel).toEqual(BLACK);
    });
  });

  describe('setLayers', () => {
    it('should replace all layers', () => {
      service.initLayers(4, 4);
      const newLayers = [
        { id: 'a', name: 'A', visible: true, opacity: 1, data: new Uint8ClampedArray(16) },
        { id: 'b', name: 'B', visible: true, opacity: 1, data: new Uint8ClampedArray(16) },
      ];
      service.setLayers(newLayers);
      expect(service.layerCount()).toBe(2);
      expect(service.layers()[0].name).toBe('A');
    });

    it('should reset active layer to 0', () => {
      service.initLayers(4, 4);
      service.addLayer(4, 4);
      service.setActiveLayer(1);
      service.setLayers([
        { id: 'x', name: 'X', visible: true, opacity: 1, data: new Uint8ClampedArray(16) },
      ]);
      expect(service.activeLayerIndex()).toBe(0);
    });
  });
});
