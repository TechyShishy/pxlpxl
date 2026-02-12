import { Color, DEFAULT_PALETTE } from './color.model';
import { Layer } from './layer.model';

export interface Project {
  id?: number;
  name: string;
  width: number;
  height: number;
  layers: SerializedLayer[];
  palette: Color[];
  createdAt: Date;
  updatedAt: Date;
}

/** Layer with data stored as a plain array for IndexedDB serialization */
export interface SerializedLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  data: number[]; // Plain array for Dexie storage
}

export function serializeLayer(layer: Layer): SerializedLayer {
  return {
    id: layer.id,
    name: layer.name,
    visible: layer.visible,
    opacity: layer.opacity,
    data: Array.from(layer.data),
  };
}

export function deserializeLayer(serialized: SerializedLayer): Layer {
  return {
    id: serialized.id,
    name: serialized.name,
    visible: serialized.visible,
    opacity: serialized.opacity,
    data: new Uint8ClampedArray(serialized.data),
  };
}

export function createDefaultProject(name: string, width: number, height: number): Project {
  return {
    name,
    width,
    height,
    layers: [
      {
        id: crypto.randomUUID(),
        name: 'Layer 1',
        visible: true,
        opacity: 1,
        data: Array.from(new Uint8ClampedArray(width * height * 4)),
      },
    ],
    palette: [...DEFAULT_PALETTE],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
