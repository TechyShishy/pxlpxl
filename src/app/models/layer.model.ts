export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number; // 0-1
  data: Uint8ClampedArray; // RGBA pixel data (width * height * 4)
}

export function createLayer(id: string, name: string, width: number, height: number): Layer {
  return {
    id,
    name,
    visible: true,
    opacity: 1,
    data: new Uint8ClampedArray(width * height * 4),
  };
}

export function cloneLayerData(layer: Layer): Uint8ClampedArray {
  return new Uint8ClampedArray(layer.data);
}
