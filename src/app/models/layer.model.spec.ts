import { createLayer, cloneLayerData, Layer } from './layer.model';

describe('Layer Model', () => {
  describe('createLayer', () => {
    it('should create a layer with correct properties', () => {
      const layer = createLayer('test-id', 'Test Layer', 4, 4);
      expect(layer.id).toBe('test-id');
      expect(layer.name).toBe('Test Layer');
      expect(layer.visible).toBe(true);
      expect(layer.opacity).toBe(1);
    });

    it('should create data buffer of correct size (w * h * 4)', () => {
      const layer = createLayer('id', 'L', 8, 6);
      expect(layer.data.length).toBe(8 * 6 * 4);
    });

    it('should initialize data buffer to all zeros', () => {
      const layer = createLayer('id', 'L', 4, 4);
      for (let i = 0; i < layer.data.length; i++) {
        expect(layer.data[i]).toBe(0);
      }
    });

    it('should create a 1x1 canvas with 4-byte buffer', () => {
      const layer = createLayer('id', 'L', 1, 1);
      expect(layer.data.length).toBe(4);
    });

    it('should create a Uint8ClampedArray for data', () => {
      const layer = createLayer('id', 'L', 2, 2);
      expect(layer.data).toBeInstanceOf(Uint8ClampedArray);
    });

    it('should handle different dimensions correctly', () => {
      const small = createLayer('a', 'S', 1, 1);
      const large = createLayer('b', 'L', 64, 64);
      expect(small.data.length).toBe(4);
      expect(large.data.length).toBe(64 * 64 * 4);
    });
  });

  describe('cloneLayerData', () => {
    it('should return a new Uint8ClampedArray', () => {
      const layer = createLayer('id', 'L', 4, 4);
      const clone = cloneLayerData(layer);
      expect(clone).toBeInstanceOf(Uint8ClampedArray);
      expect(clone).not.toBe(layer.data);
    });

    it('should copy values identically', () => {
      const layer = createLayer('id', 'L', 2, 2);
      layer.data[0] = 255;
      layer.data[1] = 128;
      layer.data[2] = 64;
      layer.data[3] = 32;
      const clone = cloneLayerData(layer);
      expect(clone[0]).toBe(255);
      expect(clone[1]).toBe(128);
      expect(clone[2]).toBe(64);
      expect(clone[3]).toBe(32);
    });

    it('should not be affected by mutations to the original after cloning', () => {
      const layer = createLayer('id', 'L', 2, 2);
      layer.data[0] = 100;
      const clone = cloneLayerData(layer);
      layer.data[0] = 200;
      expect(clone[0]).toBe(100);
    });

    it('mutations to clone should not affect the original', () => {
      const layer = createLayer('id', 'L', 2, 2);
      layer.data[0] = 50;
      const clone = cloneLayerData(layer);
      clone[0] = 99;
      expect(layer.data[0]).toBe(50);
    });

    it('should have the same length as the original', () => {
      const layer = createLayer('id', 'L', 8, 8);
      const clone = cloneLayerData(layer);
      expect(clone.length).toBe(layer.data.length);
    });
  });
});
