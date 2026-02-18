import { TestBed } from '@angular/core/testing';
import { DuplicateLayerCommand } from './duplicate-layer.command';
import { LayerService } from '../services/layer.service';
import { HistoryService } from '../services/history.service';
import { BLACK } from '../models';
import { Layer } from '../models';

describe('DuplicateLayerCommand (integration)', () => {
  let layerService: LayerService;
  let historyService: HistoryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    layerService = TestBed.inject(LayerService);
    historyService = TestBed.inject(HistoryService);
    layerService.initLayers(4, 4);
  });

  function duplicateActiveLayer(): void {
    const index = layerService.activeLayerIndex();
    const source = layerService.layers()[index];
    const cloned: Layer = {
      id: crypto.randomUUID(),
      name: `Copy of ${source.name}`,
      visible: source.visible,
      opacity: source.opacity,
      data: new Uint8ClampedArray(source.data),
    };
    historyService.execute(new DuplicateLayerCommand(layerService, index + 1, cloned));
  }

  it('duplicate → undo → redo round-trip', () => {
    // Draw a pixel to distinguish the source layer
    layerService.setPixel(0, 1, 1, 4, BLACK);
    layerService.notifyLayersChanged();

    duplicateActiveLayer();
    expect(layerService.layerCount()).toBe(2);
    expect(layerService.layers()[1].name).toBe('Copy of Layer 1');
    // Duplicated layer should carry the drawn pixel
    expect(layerService.getPixel(1, 1, 1, 4)).toEqual(BLACK);

    historyService.undo();
    expect(layerService.layerCount()).toBe(1);
    expect(historyService.canUndo()).toBe(false);

    historyService.redo();
    expect(layerService.layerCount()).toBe(2);
    expect(layerService.layers()[1].name).toBe('Copy of Layer 1');
  });

  it('active layer is the duplicate after execute', () => {
    duplicateActiveLayer();
    expect(layerService.activeLayerIndex()).toBe(1);
    expect(layerService.activeLayer()?.name).toBe('Copy of Layer 1');
  });

  it('duplicate clones pixel data independently', () => {
    layerService.setPixel(0, 0, 0, 4, BLACK);
    layerService.notifyLayersChanged();

    duplicateActiveLayer();

    // Modify original layer; cloned layer should be unaffected
    const white = { r: 255, g: 255, b: 255, a: 255 };
    layerService.setPixel(0, 0, 0, 4, white);
    layerService.notifyLayersChanged();

    expect(layerService.getPixel(1, 0, 0, 4)).toEqual(BLACK);
  });

  it('duplicate preserves opacity and visibility', () => {
    layerService.setOpacity(0, 0.5);
    layerService.toggleVisibility(0);

    duplicateActiveLayer();

    const dup = layerService.layers()[1];
    expect(dup.opacity).toBe(0.5);
    expect(dup.visible).toBe(false);
  });
});
