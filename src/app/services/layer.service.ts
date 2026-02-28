import { Injectable, signal, computed } from '@angular/core';
import { Layer, createLayer, cloneLayerData, Color, TRANSPARENT, pixelOffset, GridType } from '../models';

@Injectable({ providedIn: 'root' })
export class LayerService {
  private readonly _layers = signal<Layer[]>([]);
  private readonly _activeLayerIndex = signal<number>(0);

  readonly layers = this._layers.asReadonly();
  readonly activeLayerIndex = this._activeLayerIndex.asReadonly();

  readonly activeLayer = computed(() => {
    const idx = this._activeLayerIndex();
    const all = this._layers();
    return all[idx] ?? null;
  });

  readonly layerCount = computed(() => this._layers().length);

  initLayers(width: number, height: number, pixelCount?: number): void {
    const layer = createLayer(crypto.randomUUID(), 'Layer 1', width, height, pixelCount);
    this._layers.set([layer]);
    this._activeLayerIndex.set(0);
  }

  addLayer(width: number, height: number, pixelCount?: number): void {
    const idx = this.layerCount();
    const layer = createLayer(crypto.randomUUID(), `Layer ${idx + 1}`, width, height, pixelCount);
    this._layers.update((layers) => [...layers, layer]);
    this._activeLayerIndex.set(idx);
  }

  removeLayer(index: number): void {
    if (this.layerCount() <= 1) return; // Must keep at least one layer
    this._layers.update((layers) => layers.filter((_, i) => i !== index));
    const active = this._activeLayerIndex();
    if (active >= this.layerCount()) {
      this._activeLayerIndex.set(this.layerCount() - 1);
    } else if (index < active) {
      this._activeLayerIndex.set(active - 1);
    }
  }

  /** Insert a fully-formed layer at the given index, shifting existing layers down. */
  insertLayer(atIndex: number, layer: Layer): void {
    this._layers.update((layers) => {
      const result = [...layers];
      result.splice(atIndex, 0, layer);
      return result;
    });
    this._activeLayerIndex.set(atIndex);
  }

  setActiveLayer(index: number): void {
    if (index >= 0 && index < this.layerCount()) {
      this._activeLayerIndex.set(index);
    }
  }

  toggleVisibility(index: number): void {
    this._layers.update((layers) =>
      layers.map((l, i) => (i === index ? { ...l, visible: !l.visible } : l)),
    );
  }

  setOpacity(index: number, opacity: number): void {
    this._layers.update((layers) =>
      layers.map((l, i) =>
        i === index ? { ...l, opacity: Math.max(0, Math.min(1, opacity)) } : l,
      ),
    );
  }

  renameLayer(index: number, name: string): void {
    this._layers.update((layers) => layers.map((l, i) => (i === index ? { ...l, name } : l)));
  }

  moveLayer(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return;
    const count = this.layerCount();
    if (fromIndex < 0 || fromIndex >= count || toIndex < 0 || toIndex >= count) return;
    this._layers.update((layers) => {
      const result = [...layers];
      const [moved] = result.splice(fromIndex, 1);
      result.splice(toIndex, 0, moved);
      return result;
    });
    // Adjust active index to follow the same layer identity
    const active = this._activeLayerIndex();
    if (active === fromIndex) {
      this._activeLayerIndex.set(toIndex);
    } else if (fromIndex < active && active <= toIndex) {
      this._activeLayerIndex.set(active - 1);
    } else if (toIndex <= active && active < fromIndex) {
      this._activeLayerIndex.set(active + 1);
    }
  }

  /** Get pixel color at coordinates on a specific layer */
  getPixel(
    layerIndex: number, x: number, y: number, width: number,
    gridType?: GridType, triangularA?: number, triangularD?: number,
    triangularDNum?: number, triangularDDen?: number, triangularShift?: number,
  ): Color {
    const layer = this.layers()[layerIndex];
    if (!layer) return { ...TRANSPARENT };
    const offset = pixelOffset(x, y, width, gridType, triangularA, triangularD, triangularDNum, triangularDDen, triangularShift);
    return {
      r: layer.data[offset],
      g: layer.data[offset + 1],
      b: layer.data[offset + 2],
      a: layer.data[offset + 3],
    };
  }

  /** Set pixel color at coordinates on a specific layer */
  setPixel(
    layerIndex: number, x: number, y: number, width: number, color: Color,
    gridType?: GridType, triangularA?: number, triangularD?: number,
    triangularDNum?: number, triangularDDen?: number, triangularShift?: number,
  ): void {
    const layer = this.layers()[layerIndex];
    if (!layer) return;
    const offset = pixelOffset(x, y, width, gridType, triangularA, triangularD, triangularDNum, triangularDDen, triangularShift);
    layer.data[offset] = color.r;
    layer.data[offset + 1] = color.g;
    layer.data[offset + 2] = color.b;
    layer.data[offset + 3] = color.a;
  }

  /**
   * Notify the layers signal that layer data has been mutated in place.
   * Call this after a batch of setPixel() calls (e.g., after undo/redo)
   * so that Angular's signal-based change detection picks up the update.
   */
  notifyLayersChanged(): void {
    this._layers.update((layers) => [...layers]);
  }

  /** Get the raw data of a layer (for undo/redo snapshots) */
  getLayerData(index: number): Uint8ClampedArray | null {
    const layer = this.layers()[index];
    return layer ? cloneLayerData(layer) : null;
  }

  /** Restore layer data from a snapshot */
  setLayerData(index: number, data: Uint8ClampedArray): void {
    this._layers.update((layers) =>
      layers.map((l, i) => (i === index ? { ...l, data: new Uint8ClampedArray(data) } : l)),
    );
  }

  /**
   * Returns true if any pixel in any layer matches the given color exactly.
   * Fully transparent pixels (a === 0) are ignored.
   */
  isColorInUse(color: Color): boolean {
    for (const layer of this.layers()) {
      const data = layer.data;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) continue;
        if (
          data[i] === color.r &&
          data[i + 1] === color.g &&
          data[i + 2] === color.b &&
          data[i + 3] === color.a
        ) {
          return true;
        }
      }
    }
    return false;
  }

  /** Set layers from deserialized project data */
  setLayers(layers: Layer[]): void {
    this._layers.set(layers);
    this._activeLayerIndex.set(0);
  }
}
