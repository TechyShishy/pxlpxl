import { TestBed } from '@angular/core/testing';
import { FlattenLayerCommand } from './flatten-layer.command';
import { LayerService } from '../services/layer.service';

const W = 2;
const H = 2;
const SIZE = W * H * 4;

function setPixel(data: Uint8ClampedArray, x: number, y: number, r: number, g: number, b: number, a: number): void {
  const i = (y * W + x) * 4;
  data[i] = r;
  data[i + 1] = g;
  data[i + 2] = b;
  data[i + 3] = a;
}

function getPixel(data: Uint8ClampedArray, x: number, y: number): [number, number, number, number] {
  const i = (y * W + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

/**
 * Layer panel displays index 0 at the top. "Flatten to above" on the panel-bottom
 * layer (index 1) merges it into the panel-above layer (index 0). Index 1 is visually
 * on top of index 0 on the canvas, so index 1's pixels composite over index 0's pixels.
 *
 * Setup:
 *   index 0 — Layer 1 (panel-top,    visual-bottom)
 *   index 1 — Layer 2 (panel-bottom, visual-top)
 *
 * FlattenLayerCommand(layerService, 1, W, H) merges Layer 2 into Layer 1.
 */
describe('FlattenLayerCommand', () => {
  let layerService: LayerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    layerService = TestBed.inject(LayerService);
    // layers: [0: Layer 1 (panel-top), 1: Layer 2 (panel-bottom)]
    layerService.initLayers(W, H);
    layerService.addLayer(W, H);
  });

  it('should have description "Flatten layer to above"', () => {
    const cmd = new FlattenLayerCommand(layerService, 1, W, H);
    expect(cmd.description).toBe('Flatten layer to above');
  });

  describe('execute', () => {
    it('should reduce the layer count by 1', () => {
      expect(layerService.layerCount()).toBe(2);
      const cmd = new FlattenLayerCommand(layerService, 1, W, H);
      cmd.execute();
      expect(layerService.layerCount()).toBe(1);
    });

    it('should remove the selected layer and keep the panel-above layer', () => {
      // index 0 (panel-above) is the surviving layer
      const aboveName = layerService.layers()[0].name;
      const cmd = new FlattenLayerCommand(layerService, 1, W, H);
      cmd.execute();
      expect(layerService.layers()[0].name).toBe(aboveName);
    });

    it('should composite: selected (visual-top) fully opaque over transparent panel-above', () => {
      // Selected layer (index 1, visual-top): red pixel at (0,0)
      const selectedData = layerService.layers()[1].data;
      setPixel(selectedData, 0, 0, 255, 0, 0, 255);
      // Panel-above (index 0): transparent — result should be red

      const cmd = new FlattenLayerCommand(layerService, 1, W, H);
      cmd.execute();

      const [r, g, b, a] = getPixel(layerService.layers()[0].data, 0, 0);
      expect(r).toBe(255);
      expect(g).toBe(0);
      expect(b).toBe(0);
      expect(a).toBe(255);
    });

    it('should composite: transparent selected over opaque panel-above leaves panel-above color', () => {
      // Panel-above (index 0): blue pixel at (0,0)
      const aboveData = layerService.layers()[0].data;
      setPixel(aboveData, 0, 0, 0, 0, 255, 255);
      // Selected (index 1): fully transparent

      const cmd = new FlattenLayerCommand(layerService, 1, W, H);
      cmd.execute();

      const [, , b, a] = getPixel(layerService.layers()[0].data, 0, 0);
      expect(b).toBe(255);
      expect(a).toBe(255);
    });

    it('should bake the panel-above layer opacity to 1.0 after execute', () => {
      layerService.setOpacity(0, 0.5);
      const cmd = new FlattenLayerCommand(layerService, 1, W, H);
      cmd.execute();
      expect(layerService.layers()[0].opacity).toBeCloseTo(1.0);
    });

    it('should blend selected (visual-top) over panel-above using Porter-Duff "over"', () => {
      // Panel-above (index 0, visual-bottom): opaque red
      const aboveData = layerService.layers()[0].data;
      setPixel(aboveData, 0, 0, 255, 0, 0, 255);
      // Selected (index 1, visual-top): 50% transparent blue
      const selectedData = layerService.layers()[1].data;
      setPixel(selectedData, 0, 0, 0, 0, 255, 128);

      const cmd = new FlattenLayerCommand(layerService, 1, W, H);
      cmd.execute();

      const [r, , b, a] = getPixel(layerService.layers()[0].data, 0, 0);
      // outA = (128/255) + 1*(1 - 128/255) ≈ 1.0
      expect(a).toBe(255);
      // blue component from selected dominates, but red from panel-above also present
      expect(b).toBeGreaterThan(0);
      expect(r).toBeGreaterThan(0);
    });
  });

  describe('undo', () => {
    it('should restore the layer count', () => {
      const cmd = new FlattenLayerCommand(layerService, 1, W, H);
      cmd.execute();
      expect(layerService.layerCount()).toBe(1);
      cmd.undo();
      expect(layerService.layerCount()).toBe(2);
    });

    it('should restore the selected layer at the original index', () => {
      const selectedName = layerService.layers()[1].name;
      const cmd = new FlattenLayerCommand(layerService, 1, W, H);
      cmd.execute();
      cmd.undo();
      expect(layerService.layers()[1].name).toBe(selectedName);
    });

    it('should restore the panel-above layer original pixel data', () => {
      // Paint panel-above (index 0) with green before flattening
      const aboveData = layerService.layers()[0].data;
      setPixel(aboveData, 0, 0, 0, 255, 0, 255);

      const cmd = new FlattenLayerCommand(layerService, 1, W, H);
      cmd.execute();
      cmd.undo();

      const [, g, , a] = getPixel(layerService.layers()[0].data, 0, 0);
      expect(g).toBe(255);
      expect(a).toBe(255);
    });

    it('should restore the panel-above layer original opacity', () => {
      layerService.setOpacity(0, 0.6);
      const cmd = new FlattenLayerCommand(layerService, 1, W, H);
      cmd.execute();
      cmd.undo();
      expect(layerService.layers()[0].opacity).toBeCloseTo(0.6);
    });

    it('should restore the selected layer pixel data', () => {
      const selectedData = layerService.layers()[1].data;
      setPixel(selectedData, 1, 1, 100, 100, 100, 255);

      const cmd = new FlattenLayerCommand(layerService, 1, W, H);
      cmd.execute();
      cmd.undo();

      const [r, g, b, a] = getPixel(layerService.layers()[1].data, 1, 1);
      expect(r).toBe(100);
      expect(g).toBe(100);
      expect(b).toBe(100);
      expect(a).toBe(255);
    });
  });

  describe('execute → undo → execute (re-do)', () => {
    it('should produce the same merged result on second execute', () => {
      const aboveData = layerService.layers()[0].data;
      setPixel(aboveData, 0, 0, 200, 100, 50, 255);

      const cmd = new FlattenLayerCommand(layerService, 1, W, H);
      cmd.execute();
      const pixelAfterFirst = getPixel(layerService.layers()[0].data, 0, 0);

      cmd.undo();
      cmd.execute();
      const pixelAfterSecond = getPixel(layerService.layers()[0].data, 0, 0);

      expect(pixelAfterSecond).toEqual(pixelAfterFirst);
    });
  });
});
