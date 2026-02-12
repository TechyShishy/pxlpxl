import { Injectable, signal, computed } from '@angular/core';
import { Layer, createLayer, cloneLayerData, Color, TRANSPARENT } from '../models';

@Injectable({ providedIn: 'root' })
export class LayerService {
  readonly layers = signal<Layer[]>([]);
  readonly activeLayerIndex = signal<number>(0);

  readonly activeLayer = computed(() => {
    const idx = this.activeLayerIndex();
    const all = this.layers();
    return all[idx] ?? null;
  });

  readonly layerCount = computed(() => this.layers().length);

  initLayers(width: number, height: number): void {
    const layer = createLayer(crypto.randomUUID(), 'Layer 1', width, height);
    this.layers.set([layer]);
    this.activeLayerIndex.set(0);
  }

  addLayer(width: number, height: number): void {
    const idx = this.layerCount();
    const layer = createLayer(crypto.randomUUID(), `Layer ${idx + 1}`, width, height);
    this.layers.update((layers) => [...layers, layer]);
    this.activeLayerIndex.set(idx);
  }

  removeLayer(index: number): void {
    if (this.layerCount() <= 1) return; // Must keep at least one layer
    this.layers.update((layers) => layers.filter((_, i) => i !== index));
    const active = this.activeLayerIndex();
    if (active >= this.layerCount()) {
      this.activeLayerIndex.set(this.layerCount() - 1);
    }
  }

  setActiveLayer(index: number): void {
    if (index >= 0 && index < this.layerCount()) {
      this.activeLayerIndex.set(index);
    }
  }

  toggleVisibility(index: number): void {
    this.layers.update((layers) =>
      layers.map((l, i) => (i === index ? { ...l, visible: !l.visible } : l)),
    );
  }

  setOpacity(index: number, opacity: number): void {
    this.layers.update((layers) =>
      layers.map((l, i) =>
        i === index ? { ...l, opacity: Math.max(0, Math.min(1, opacity)) } : l,
      ),
    );
  }

  renameLayer(index: number, name: string): void {
    this.layers.update((layers) => layers.map((l, i) => (i === index ? { ...l, name } : l)));
  }

  moveLayer(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return;
    this.layers.update((layers) => {
      const result = [...layers];
      const [moved] = result.splice(fromIndex, 1);
      result.splice(toIndex, 0, moved);
      return result;
    });
    // Adjust active index to follow the same layer identity
    const active = this.activeLayerIndex();
    if (active === fromIndex) {
      this.activeLayerIndex.set(toIndex);
    } else if (fromIndex < active && active <= toIndex) {
      this.activeLayerIndex.set(active - 1);
    } else if (toIndex <= active && active < fromIndex) {
      this.activeLayerIndex.set(active + 1);
    }
  }

  /** Get pixel color at coordinates on a specific layer */
  getPixel(layerIndex: number, x: number, y: number, width: number): Color {
    const layer = this.layers()[layerIndex];
    if (!layer) return { ...TRANSPARENT };
    const offset = (y * width + x) * 4;
    return {
      r: layer.data[offset],
      g: layer.data[offset + 1],
      b: layer.data[offset + 2],
      a: layer.data[offset + 3],
    };
  }

  /** Set pixel color at coordinates on a specific layer */
  setPixel(layerIndex: number, x: number, y: number, width: number, color: Color): void {
    const layer = this.layers()[layerIndex];
    if (!layer) return;
    const offset = (y * width + x) * 4;
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
    this.layers.update((layers) => [...layers]);
  }

  /** Get the raw data of a layer (for undo/redo snapshots) */
  getLayerData(index: number): Uint8ClampedArray | null {
    const layer = this.layers()[index];
    return layer ? cloneLayerData(layer) : null;
  }

  /** Restore layer data from a snapshot */
  setLayerData(index: number, data: Uint8ClampedArray): void {
    this.layers.update((layers) =>
      layers.map((l, i) => (i === index ? { ...l, data: new Uint8ClampedArray(data) } : l)),
    );
  }

  /** Set layers from deserialized project data */
  setLayers(layers: Layer[]): void {
    this.layers.set(layers);
    this.activeLayerIndex.set(0);
  }
}
