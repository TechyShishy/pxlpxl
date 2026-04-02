import {
  serializeLayer,
  deserializeLayer,
  createDefaultProject,
  computeBufferDimensions,
  computeBufferPixelCount,
  triangularCumPixels,
  triangularRowWidth,
  triangularSlowRowWidth,
  triangularSlowCumPixels,
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
      // 10 column-pairs, 10 visible rows → bufferWidth=10, bufferHeight=10
      const project = createDefaultProject('P', 10, 10, 'peyote');
      const { bufferWidth, bufferHeight } = computeBufferDimensions(10, 10, 'peyote');
      expect(bufferWidth).toBe(10);
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
      expect(bufferWidth).toBe(8);  // column-pair count = canvasWidth
      expect(bufferHeight).toBe(4); // same as height (visible rows)
    });

    it('should handle wide peyote grid', () => {
      const { bufferWidth, bufferHeight } = computeBufferDimensions(7, 3, 'peyote');
      expect(bufferWidth).toBe(7);  // column-pair count = canvasWidth
      expect(bufferHeight).toBe(3); // same as height (visible rows)
    });
  });

  describe('computeBufferPixelCount', () => {
    it('should return width * height for square grid', () => {
      expect(computeBufferPixelCount(8, 8, 'square')).toBe(64);
    });

    it('should return bufferWidth * bufferHeight for peyote grid', () => {
      // 8 column-pairs, 4 visible rows → bufferWidth=8, bufferHeight=4
      expect(computeBufferPixelCount(8, 4, 'peyote')).toBe(32);
    });

    it('should compute triangular pixel count with a=1, d=2, R=4', () => {
      // Row widths: 1, 3, 5, 7 → total = 16
      // Formula: R*a + d*R*(R-1)/2 = 4*1 + 2*4*3/2 = 4 + 12 = 16
      expect(computeBufferPixelCount(0, 4, 'triangular', 1, 2)).toBe(16);
    });

    it('should compute triangular pixel count with a=3, d=1, R=5', () => {
      // Row widths: 3, 4, 5, 6, 7 → total = 25
      // Formula: 5*3 + 1*5*4/2 = 15 + 10 = 25
      expect(computeBufferPixelCount(0, 5, 'triangular', 3, 1)).toBe(25);
    });

    it('should compute triangular pixel count for single row', () => {
      // R=1, a=5, d=3 → total = 5
      expect(computeBufferPixelCount(0, 1, 'triangular', 5, 3)).toBe(5);
    });

    it('should compute triangular pixel count with a=1, d=1, R=3', () => {
      // Row widths: 1, 2, 3 → total = 6
      // Formula: 3*1 + 1*3*2/2 = 3 + 3 = 6
      expect(computeBufferPixelCount(0, 3, 'triangular', 1, 1)).toBe(6);
    });
  });

  describe('createDefaultProject (triangular)', () => {
    it('should create project with triangular grid type', () => {
      const project = createDefaultProject('Tri', 0, 4, 'triangular', 1, 2);
      expect(project.gridType).toBe('triangular');
      expect(project.triangularA).toBe(1);
      expect(project.triangularD).toBe(2);
    });

    it('should allocate correct buffer size for triangular layer', () => {
      // a=1, d=2, R=4 → 16 pixels → 64 bytes
      const project = createDefaultProject('Tri', 0, 4, 'triangular', 1, 2);
      expect(project.layers[0].data.length).toBe(16 * 4);
    });

    it('should allocate correct buffer for a=3, d=1, R=5', () => {
      // 25 pixels → 100 bytes
      const project = createDefaultProject('Tri', 0, 5, 'triangular', 3, 1);
      expect(project.layers[0].data.length).toBe(25 * 4);
    });
  });

  describe('triangularSlowRowWidth', () => {
    it('should return a for row 0 (a=1, d=2)', () => {
      expect(triangularSlowRowWidth(0, 1, 1, 2)).toBe(1);
    });

    it('should return a+1 for row 1 (bump, a=1, d=2)', () => {
      expect(triangularSlowRowWidth(1, 1, 1, 2)).toBe(2);
    });

    it('should return a for row 2 (a=1, d=2)', () => {
      expect(triangularSlowRowWidth(2, 1, 1, 2)).toBe(1);
    });

    it('should verify full sequence a=1, d=2, R=10', () => {
      const expected = [1, 2, 1, 2, 3, 2, 3, 4, 3, 4];
      for (let r = 0; r < 10; r++) {
        expect(triangularSlowRowWidth(r, 1, 1, 2)).toBe(expected[r]);
      }
    });

    it('should verify full sequence a=1, d=4, R=10', () => {
      const expected = [1, 2, 1, 2, 1, 2, 1, 2, 3, 2];
      for (let r = 0; r < 10; r++) {
        expect(triangularSlowRowWidth(r, 1, 1, 4)).toBe(expected[r]);
      }
    });

    it('should handle larger a (a=3, d=4)', () => {
      // L=7, cycle 0: 3,4,3,4,3,4,3, cycle 1: 4,5,4,5,4,5,4
      expect(triangularSlowRowWidth(0, 3, 1, 4)).toBe(3);
      expect(triangularSlowRowWidth(1, 3, 1, 4)).toBe(4);
      expect(triangularSlowRowWidth(6, 3, 1, 4)).toBe(3);
      expect(triangularSlowRowWidth(7, 3, 1, 4)).toBe(4);
      expect(triangularSlowRowWidth(8, 3, 1, 4)).toBe(5);
    });

    it('should verify full sequence a=1, d=3, R=10 (odd d, peyote)', () => {
      // L=5: cycle 0: 1,2,1,2,1, cycle 1: 2,3,2,3,2
      const expected = [1, 2, 1, 2, 1, 2, 3, 2, 3, 2];
      for (let r = 0; r < 10; r++) {
        expect(triangularSlowRowWidth(r, 1, 1, 3)).toBe(expected[r]);
      }
    });

    it('should verify fractional d (dNum=2, dDen=3, a=1, R=20)', () => {
      const expected = [1, 2, 1, 2, 3, 4, 3, 4, 5, 6, 5, 6, 7, 8, 7, 8, 9, 10, 9, 10];
      for (let r = 0; r < 20; r++) {
        expect(triangularSlowRowWidth(r, 1, 2, 3)).toBe(expected[r]);
      }
    });
  });

  describe('triangularSlowCumPixels', () => {
    it('should return 0 for y=0', () => {
      expect(triangularSlowCumPixels(0, 1, 1, 2)).toBe(0);
    });

    it('should return a for y=1 (even d)', () => {
      expect(triangularSlowCumPixels(1, 1, 1, 2)).toBe(1);
    });

    it('should compute total for a=1, d=2, R=10', () => {
      // widths = [1,2,1,2,3,2,3,4,3,4] → sum = 25
      expect(triangularSlowCumPixels(10, 1, 1, 2)).toBe(25);
    });

    it('should match manual sum for small R (even d)', () => {
      const a = 1, dNum = 1, dDen = 2;
      for (let R = 1; R <= 12; R++) {
        let manual = 0;
        for (let r = 0; r < R; r++) manual += triangularSlowRowWidth(r, a, dNum, dDen);
        expect(
          triangularSlowCumPixels(R, a, dNum, dDen),
          `cumPixels(${R}, ${a}, ${dNum}, ${dDen}) should be ${manual}`,
        ).toBe(manual);
      }
    });

    it('should match manual sum for small R (odd d)', () => {
      const a = 2, dNum = 1, dDen = 3;
      for (let R = 1; R <= 12; R++) {
        let manual = 0;
        for (let r = 0; r < R; r++) manual += triangularSlowRowWidth(r, a, dNum, dDen);
        expect(
          triangularSlowCumPixels(R, a, dNum, dDen),
          `cumPixels(${R}, ${a}, ${dNum}, ${dDen}) should be ${manual}`,
        ).toBe(manual);
      }
    });

    it('should match manual sum for fractional d (dNum=2, dDen=3)', () => {
      const a = 1, dNum = 2, dDen = 3;
      for (let R = 1; R <= 20; R++) {
        let manual = 0;
        for (let r = 0; r < R; r++) manual += triangularSlowRowWidth(r, a, dNum, dDen);
        expect(
          triangularSlowCumPixels(R, a, dNum, dDen),
          `cumPixels(${R}, ${a}, ${dNum}, ${dDen}) should be ${manual}`,
        ).toBe(manual);
      }
    });
  });

  describe('computeBufferPixelCount (triangular slow-growth)', () => {
    it('should compute pixel count for a=1, dNum=1, dDen=2, R=10', () => {
      // shift=0: widths [1,0,1,2,1,2,3,2,3,4] → sum=19
      expect(computeBufferPixelCount(0, 10, 'triangular', 1, undefined, 1, 2)).toBe(19);
    });

    it('should compute pixel count for a=1, dNum=1, dDen=3, R=6', () => {
      // shift=0 (clamped): widths [1,0,0,0,1,2] → sum=4
      expect(computeBufferPixelCount(0, 6, 'triangular', 1, undefined, 1, 3)).toBe(4);
    });

    it('should compute pixel count for a=1, dNum=1, dDen=4, R=10', () => {
      // shift=0 (clamped): cycle0=[1,0,0,0,0,0,1]+rows7-9=[2,1,0] → sum=5
      expect(computeBufferPixelCount(0, 10, 'triangular', 1, undefined, 1, 4)).toBe(5);
    });

    it('should compute pixel count for single row', () => {
      expect(computeBufferPixelCount(0, 1, 'triangular', 5, undefined, 5, 2)).toBe(5);
    });
  });

  describe('computeBufferDimensions (triangular slow-growth)', () => {
    it('should set bufferHeight to number of rows', () => {
      const { bufferHeight } = computeBufferDimensions(0, 10, 'triangular', 1, undefined, 1, 2);
      expect(bufferHeight).toBe(10);
    });

    it('should set bufferWidth to max row width (even dDen)', () => {
      // a=1, dNum=1, dDen=2, R=10, shift=0 → widths [1,0,1,2,1,2,3,2,3,4] → max=4
      const { bufferWidth } = computeBufferDimensions(0, 10, 'triangular', 1, undefined, 1, 2);
      expect(bufferWidth).toBe(4);
    });

    it('should set bufferWidth to max row width (odd dDen)', () => {
      // a=1, dNum=1, dDen=3, R=10, shift=0 (clamped) → max=2
      const { bufferWidth } = computeBufferDimensions(0, 10, 'triangular', 1, undefined, 1, 3);
      expect(bufferWidth).toBe(2);
    });
  });

  describe('createDefaultProject (triangular slow-growth)', () => {
    it('should create project with triangular grid type', () => {
      const project = createDefaultProject('TriSlow', 0, 10, 'triangular', 1, undefined, 1, 2);
      expect(project.gridType).toBe('triangular');
      expect(project.triangularA).toBe(1);
      expect(project.triangularDNum).toBe(1);
      expect(project.triangularDDen).toBe(2);
    });

    it('should allocate correct buffer size for triangular slow-growth layer', () => {
      // a=1, dNum=1, dDen=2, R=10, shift=0 → 19 pixels → 76 bytes
      const project = createDefaultProject('TriSlow', 0, 10, 'triangular', 1, undefined, 1, 2);
      expect(project.layers[0].data.length).toBe(19 * 4);
    });
  });

  // Lookup table: a=1, dNum=3, dDen=4, R=9
  // shift | row widths (rows 0-8)
  //   0   | 1,0,1,2,3,4,3,4,5
  //   1   | 1,2,1,2,3,4,5,4,5
  //   2   | 1,2,3,2,3,4,5,6,5
  //   3   | 1,2,3,4,3,4,5,6,7
  describe('triangularRowWidth with shift (a=1, dNum=3, dDen=4)', () => {
    const a = 1;
    const dNum = 3;
    const dDen = 4;
    const R = 9;

    const expected: Record<number, number[]> = {
      0: [1, 0, 1, 2, 3, 4, 3, 4, 5],
      1: [1, 2, 1, 2, 3, 4, 5, 4, 5],
      2: [1, 2, 3, 2, 3, 4, 5, 6, 5],
      3: [1, 2, 3, 4, 3, 4, 5, 6, 7],
    };

    for (const shift of [0, 1, 2, 3]) {
      it(`shift=${shift}: produces correct row widths for all ${R} rows`, () => {
        const actual = Array.from({ length: R }, (_, row) =>
          triangularRowWidth(row, a, dNum, dDen, shift),
        );
        expect(actual).toEqual(expected[shift]);
      });
    }

    it('shift is ignored for fast-growth (dNum >= dDen)', () => {
      // a=1, dNum=4, dDen=4 → fast growth, shift should have no effect
      const w0 = triangularRowWidth(0, 1, 4, 4, 0);
      const w1 = triangularRowWidth(0, 1, 4, 4, 3);
      expect(w0).toBe(w1);
      // Also check a few rows are equal between shifts
      for (let r = 0; r < 5; r++) {
        expect(triangularRowWidth(r, 1, 5, 4, 0)).toBe(triangularRowWidth(r, 1, 5, 4, 2));
      }
    });

    it('shift=0 matches width=0 row in lookup correctly', () => {
      // Row 1 has width 0 for shift=0 (negative delta cancels preceding positive)
      expect(triangularRowWidth(1, 1, 3, 4, 0)).toBe(0);
    });
  });

  describe('computeBufferDimensions (triangular fast-growth)', () => {
    it('should set bufferWidth to max row width (a=1, d=2, R=4)', () => {
      // Row widths: 1, 3, 5, 7 → max = 7
      const { bufferWidth, bufferHeight } = computeBufferDimensions(0, 4, 'triangular', 1, 2);
      expect(bufferWidth).toBe(7);
      expect(bufferHeight).toBe(4);
    });

    it('should set bufferWidth to max row width (a=3, d=1, R=5)', () => {
      // Row widths: 3, 4, 5, 6, 7 → max = 7
      const { bufferWidth, bufferHeight } = computeBufferDimensions(0, 5, 'triangular', 3, 1);
      expect(bufferWidth).toBe(7);
      expect(bufferHeight).toBe(5);
    });

    it('should handle single-row triangular grid', () => {
      const { bufferWidth, bufferHeight } = computeBufferDimensions(0, 1, 'triangular', 5, 3);
      expect(bufferWidth).toBe(5);
      expect(bufferHeight).toBe(1);
    });

    it('should handle d=0 (constant width)', () => {
      // dNum=0, dDen=1 → every row has width a=4
      const { bufferWidth } = computeBufferDimensions(0, 10, 'triangular', 4, 0);
      expect(bufferWidth).toBe(4);
    });
  });

  describe('triangularCumPixels', () => {
    it('should return 0 for y=0', () => {
      expect(triangularCumPixels(0, 1, 1, 1)).toBe(0);
    });

    it('should return 0 for negative y', () => {
      expect(triangularCumPixels(-3, 1, 1, 1)).toBe(0);
    });

    it('should return a for y=1 (fast growth)', () => {
      expect(triangularCumPixels(1, 5, 2, 1)).toBe(5);
    });

    it('should compute fast-growth sum for a=1, d=2, R=4', () => {
      // Row widths: 1, 3, 5, 7 → total = 16
      expect(triangularCumPixels(4, 1, 2, 1)).toBe(16);
    });

    it('should compute fast-growth sum for a=3, d=1, R=5', () => {
      // Row widths: 3, 4, 5, 6, 7 → total = 25
      expect(triangularCumPixels(5, 3, 1, 1)).toBe(25);
    });

    it('should match manual sum for fast-growth (a=1, dNum=2, dDen=1)', () => {
      const a = 1, dNum = 2, dDen = 1;
      for (let R = 1; R <= 12; R++) {
        let manual = 0;
        for (let r = 0; r < R; r++) manual += triangularRowWidth(r, a, dNum, dDen);
        expect(
          triangularCumPixels(R, a, dNum, dDen),
          `cumPixels(${R}, ${a}, ${dNum}, ${dDen}) should be ${manual}`,
        ).toBe(manual);
      }
    });

    it('should match manual sum for slow-growth (a=1, dNum=1, dDen=2)', () => {
      const a = 1, dNum = 1, dDen = 2;
      for (let R = 1; R <= 20; R++) {
        let manual = 0;
        for (let r = 0; r < R; r++) manual += triangularRowWidth(r, a, dNum, dDen);
        expect(
          triangularCumPixels(R, a, dNum, dDen),
          `cumPixels(${R}, ${a}, ${dNum}, ${dDen}) should be ${manual}`,
        ).toBe(manual);
      }
    });

    it('should match manual sum for slow-growth with shift (a=1, dNum=3, dDen=4, shift=2)', () => {
      const a = 1, dNum = 3, dDen = 4, shift = 2;
      for (let R = 1; R <= 20; R++) {
        let manual = 0;
        for (let r = 0; r < R; r++) manual += triangularRowWidth(r, a, dNum, dDen, shift);
        expect(
          triangularCumPixels(R, a, dNum, dDen, shift),
          `cumPixels(${R}, ${a}, ${dNum}/${dDen}, shift=${shift}) should be ${manual}`,
        ).toBe(manual);
      }
    });

    it('should handle constant-a with dNum=0 via slow-growth path', () => {
      // dNum=0, dDen=1 → slow-growth path (dNum < dDen)
      // L = 2*1 - 0 = 2, rows alternate: 4, 3, 4, 3, 4 → sum = 18
      expect(triangularCumPixels(5, 4, 0, 1)).toBe(18);
    });

    it('should handle dNum=dDen (1 pixel growth per row)', () => {
      // a=1, dNum=1, dDen=1 → widths: 1,2,3,4,5 → total = 15
      expect(triangularCumPixels(5, 1, 1, 1)).toBe(15);
    });
  });
});
