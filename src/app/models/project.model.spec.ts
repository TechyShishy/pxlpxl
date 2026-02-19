import {
  serializeLayer,
  deserializeLayer,
  createDefaultProject,
  computeBufferDimensions,
  SerializedLayer,
} from './project.model';
import { createLayer } from './layer.model';
import { DEFAULT_PALETTE } from './color.model';

describe('Project Model', () => {
  describe('serializeLayer', () => {
    it('should convert Uint8ClampedArray data to number[]', () => {
      const layer = createLayer('id-1', 'Layer 1', 2, 2);
      layer.data[0] = 255;
      layer.data[1] = 128;
      const serialized = serializeLayer(layer);
      expect(Array.isArray(serialized.data)).toBe(true);
      expect(serialized.data[0]).toBe(255);
      expect(serialized.data[1]).toBe(128);
    });

    it('should preserve all layer properties', () => {
      const layer = createLayer('my-id', 'My Layer', 4, 4);
      layer.visible = false;
      layer.opacity = 0.5;
      const serialized = serializeLayer(layer);
      expect(serialized.id).toBe('my-id');
      expect(serialized.name).toBe('My Layer');
      expect(serialized.visible).toBe(false);
      expect(serialized.opacity).toBe(0.5);
    });

    it('should preserve data length', () => {
      const layer = createLayer('id', 'L', 8, 8);
      const serialized = serializeLayer(layer);
      expect(serialized.data.length).toBe(8 * 8 * 4);
    });
  });

  describe('deserializeLayer', () => {
    it('should convert number[] data back to Uint8ClampedArray', () => {
      const serialized: SerializedLayer = {
        id: 'id-1',
        name: 'Layer 1',
        visible: true,
        opacity: 1,
        data: [255, 128, 64, 32, 0, 0, 0, 0],
      };
      const layer = deserializeLayer(serialized);
      expect(layer.data).toBeInstanceOf(Uint8ClampedArray);
      expect(layer.data[0]).toBe(255);
      expect(layer.data[1]).toBe(128);
    });

    it('should preserve all layer properties', () => {
      const serialized: SerializedLayer = {
        id: 'test-id',
        name: 'Test',
        visible: false,
        opacity: 0.75,
        data: [0, 0, 0, 0],
      };
      const layer = deserializeLayer(serialized);
      expect(layer.id).toBe('test-id');
      expect(layer.name).toBe('Test');
      expect(layer.visible).toBe(false);
      expect(layer.opacity).toBe(0.75);
    });

    it('should round-trip with serializeLayer losslessly', () => {
      const original = createLayer('rt-id', 'RT Layer', 4, 4);
      original.data[0] = 100;
      original.data[5] = 200;
      original.data[10] = 50;
      const roundTripped = deserializeLayer(serializeLayer(original));
      expect(roundTripped.id).toBe(original.id);
      expect(roundTripped.name).toBe(original.name);
      expect(roundTripped.visible).toBe(original.visible);
      expect(roundTripped.opacity).toBe(original.opacity);
      expect(Array.from(roundTripped.data)).toEqual(Array.from(original.data));
    });
  });

  describe('createDefaultProject', () => {
    it('should create a project with given name, width, height', () => {
      const project = createDefaultProject('Test', 32, 32);
      expect(project.name).toBe('Test');
      expect(project.width).toBe(32);
      expect(project.height).toBe(32);
    });

    it('should default gridType to square', () => {
      const project = createDefaultProject('P', 16, 16);
      expect(project.gridType).toBe('square');
    });

    it('should accept a custom gridType', () => {
      const project = createDefaultProject('P', 16, 16, 'peyote');
      expect(project.gridType).toBe('peyote');
    });

    it('should create exactly 1 layer', () => {
      const project = createDefaultProject('P', 8, 8);
      expect(project.layers.length).toBe(1);
    });

    it('should create a layer named "Layer 1"', () => {
      const project = createDefaultProject('P', 8, 8);
      expect(project.layers[0].name).toBe('Layer 1');
    });

    it('should have layer data of correct size', () => {
      const project = createDefaultProject('P', 16, 8);
      expect(project.layers[0].data.length).toBe(16 * 8 * 4);
    });

    it('should have layer data as a plain number array (serialized)', () => {
      const project = createDefaultProject('P', 4, 4);
      expect(Array.isArray(project.layers[0].data)).toBe(true);
    });

    it('should use DEFAULT_PALETTE', () => {
      const project = createDefaultProject('P', 4, 4);
      expect(project.palette.length).toBe(DEFAULT_PALETTE.length);
      for (let i = 0; i < DEFAULT_PALETTE.length; i++) {
        expect(project.palette[i]).toEqual(DEFAULT_PALETTE[i]);
      }
    });

    it('should set createdAt and updatedAt as Date instances', () => {
      const project = createDefaultProject('P', 4, 4);
      expect(project.createdAt).toBeInstanceOf(Date);
      expect(project.updatedAt).toBeInstanceOf(Date);
    });

    it('should set layer as visible with opacity 1', () => {
      const project = createDefaultProject('P', 4, 4);
      expect(project.layers[0].visible).toBe(true);
      expect(project.layers[0].opacity).toBe(1);
    });

    it('should have a string id on the layer', () => {
      const project = createDefaultProject('P', 4, 4);
      expect(typeof project.layers[0].id).toBe('string');
      expect(project.layers[0].id.length).toBeGreaterThan(0);
    });

    it('should use buffer dimensions for peyote layer data', () => {
      // 10 visual columns, 10 visible rows → bufferWidth=5, bufferHeight=10
      const project = createDefaultProject('P', 10, 10, 'peyote');
      const { bufferWidth, bufferHeight } = computeBufferDimensions(10, 10, 'peyote');
      expect(bufferWidth).toBe(5);
      expect(bufferHeight).toBe(10);
      expect(project.layers[0].data.length).toBe(bufferWidth * bufferHeight * 4);
    });
  });

  describe('computeBufferDimensions', () => {
    it('should return same dimensions for square grid', () => {
      const { bufferWidth, bufferHeight } = computeBufferDimensions(16, 8, 'square');
      expect(bufferWidth).toBe(16);
      expect(bufferHeight).toBe(8);
    });

    it('should compute dense buffer dims for peyote grid', () => {
      const { bufferWidth, bufferHeight } = computeBufferDimensions(8, 4, 'peyote');
      expect(bufferWidth).toBe(4);  // ceil(8/2)
      expect(bufferHeight).toBe(4); // same as height (visible rows)
    });

    it('should handle odd visual columns for peyote', () => {
      const { bufferWidth, bufferHeight } = computeBufferDimensions(7, 3, 'peyote');
      expect(bufferWidth).toBe(4);  // ceil(7/2)
      expect(bufferHeight).toBe(3); // same as height (visible rows)
    });
  });
});
