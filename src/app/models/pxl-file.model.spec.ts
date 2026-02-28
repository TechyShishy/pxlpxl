import { uint8ArrayToBase64, base64ToUint8Array, PxlFileSchema } from './pxl-file.model';

describe('pxl-file.model base64 helpers', () => {
  describe('uint8ArrayToBase64 / base64ToUint8Array round-trip', () => {
    it('should round-trip an empty array', () => {
      const data = new Uint8ClampedArray(0);
      const b64 = uint8ArrayToBase64(data);
      const result = base64ToUint8Array(b64);
      expect(result.length).toBe(0);
    });

    it('should round-trip a simple RGBA pixel', () => {
      const data = new Uint8ClampedArray([255, 0, 128, 255]);
      const b64 = uint8ArrayToBase64(data);
      const result = base64ToUint8Array(b64);
      expect(Array.from(result)).toEqual([255, 0, 128, 255]);
    });

    it('should round-trip a full 4x4 pixel buffer', () => {
      const data = new Uint8ClampedArray(4 * 4 * 4);
      for (let i = 0; i < data.length; i++) {
        data[i] = i % 256;
      }
      const b64 = uint8ArrayToBase64(data);
      const result = base64ToUint8Array(b64);
      expect(Array.from(result)).toEqual(Array.from(data));
    });

    it('should handle all byte values 0-255', () => {
      const data = new Uint8ClampedArray(256);
      for (let i = 0; i < 256; i++) {
        data[i] = i;
      }
      const b64 = uint8ArrayToBase64(data);
      const result = base64ToUint8Array(b64);
      expect(Array.from(result)).toEqual(Array.from(data));
    });

    it('should produce a valid base64 string', () => {
      const data = new Uint8ClampedArray([1, 2, 3]);
      const b64 = uint8ArrayToBase64(data);
      expect(() => atob(b64)).not.toThrow();
    });
  });

  describe('base64ToUint8Array error handling', () => {
    it('should throw a descriptive error for invalid base64 input', () => {
      expect(() => base64ToUint8Array('!!!not-valid-base64!!!')).toThrowError(
        /invalid base64/i,
      );
    });

    it('should still decode valid base64 correctly', () => {
      const original = new Uint8ClampedArray([10, 20, 30]);
      const encoded = uint8ArrayToBase64(original);
      const decoded = base64ToUint8Array(encoded);
      expect(Array.from(decoded)).toEqual([10, 20, 30]);
    });
  });
});

describe('PxlFileSchema history validation', () => {
  const validBase = {
    version: 1,
    name: 'Test',
    width: 4,
    height: 4,
    gridType: 'square' as const,
    palette: [{ r: 0, g: 0, b: 0, a: 255 }],
    layers: [{ id: '1', name: 'L1', visible: true, opacity: 1, data: 'AAAA' }],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  };

  it('should accept a file without history', () => {
    const result = PxlFileSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it('should accept a file with valid history structure', () => {
    const result = PxlFileSchema.safeParse({
      ...validBase,
      history: {
        undoStack: [
          { type: 'draw', description: 'Draw', layerIndex: 0, canvasWidth: 4 },
        ],
        redoStack: [],
      },
    });
    expect(result.success).toBe(true);
  });

  it('should reject history that is not an object', () => {
    const result = PxlFileSchema.safeParse({
      ...validBase,
      history: 'not-an-object',
    });
    expect(result.success).toBe(false);
  });

  it('should reject history missing undoStack', () => {
    const result = PxlFileSchema.safeParse({
      ...validBase,
      history: { redoStack: [] },
    });
    expect(result.success).toBe(false);
  });

  it('should reject history missing redoStack', () => {
    const result = PxlFileSchema.safeParse({
      ...validBase,
      history: { undoStack: [] },
    });
    expect(result.success).toBe(false);
  });

  it('should reject history entries missing required type field', () => {
    const result = PxlFileSchema.safeParse({
      ...validBase,
      history: {
        undoStack: [{ description: 'Draw', layerIndex: 0, canvasWidth: 4 }],
        redoStack: [],
      },
    });
    expect(result.success).toBe(false);
  });

  it('should reject history entries with invalid type', () => {
    const result = PxlFileSchema.safeParse({
      ...validBase,
      history: {
        undoStack: [
          { type: 'invalid-type', description: 'X', layerIndex: 0, canvasWidth: 4 },
        ],
        redoStack: [],
      },
    });
    expect(result.success).toBe(false);
  });
});
