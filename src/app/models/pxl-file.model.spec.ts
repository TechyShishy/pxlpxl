import { uint8ArrayToBase64, base64ToUint8Array } from './pxl-file.model';

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
});
