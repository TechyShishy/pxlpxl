import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LayersPanelComponent } from './layers-panel.component';
import { LayerService } from '../../services/layer.service';
import { CanvasStateService } from '../../services/canvas-state.service';

describe('LayersPanelComponent', () => {
  let component: LayersPanelComponent;
  let fixture: ComponentFixture<LayersPanelComponent>;
  let layerService: LayerService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LayersPanelComponent],
    }).compileComponents();

    layerService = TestBed.inject(LayerService);
    const canvasState = TestBed.inject(CanvasStateService);

    // Initialize a small canvas with one layer
    canvasState.setCanvasSize(4, 4);
    layerService.initLayers(4, 4);

    fixture = TestBed.createComponent(LayersPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display layer name in a span', () => {
    const nameEl = fixture.nativeElement.querySelector('.layer-name');
    expect(nameEl).toBeTruthy();
    expect(nameEl.textContent.trim()).toBe('Layer 1');
  });

  it('should not show edit input by default', () => {
    const input = fixture.nativeElement.querySelector('.edit-input');
    expect(input).toBeNull();
  });

  describe('long-press to edit', () => {
    it('should enter edit mode on long-press', () => {
      vi.useFakeTimers();
      fixture.detectChanges();

      const layer = layerService.layers()[0];
      const event = new PointerEvent('pointerdown', { clientX: 100, clientY: 100 });
      component.onPointerDown(event, layer);

      vi.advanceTimersByTime(500);

      expect(component.editingLayerId()).toBe(layer.id);
      vi.useRealTimers();
    });

    it('should not enter edit mode if pointer moves beyond threshold', () => {
      vi.useFakeTimers();
      fixture.detectChanges();

      const layer = layerService.layers()[0];
      const pointerDown = new PointerEvent('pointerdown', { clientX: 100, clientY: 100 });
      component.onPointerDown(pointerDown, layer);

      const pointerMove = new PointerEvent('pointermove', { clientX: 120, clientY: 100 });
      component.onPointerMove(pointerMove);

      vi.advanceTimersByTime(500);

      expect(component.editingLayerId()).toBeNull();
      vi.useRealTimers();
    });

    it('should not enter edit mode if pointer is released before delay', () => {
      vi.useFakeTimers();
      fixture.detectChanges();

      const layer = layerService.layers()[0];
      const event = new PointerEvent('pointerdown', { clientX: 100, clientY: 100 });
      component.onPointerDown(event, layer);

      vi.advanceTimersByTime(200);
      component.onPointerUp();

      vi.advanceTimersByTime(500);

      expect(component.editingLayerId()).toBeNull();
      vi.useRealTimers();
    });

    it('should show edit input after startEdit', () => {
      vi.useFakeTimers();
      const layer = layerService.layers()[0];
      component.startEdit(layer);
      vi.advanceTimersByTime(0);
      fixture.detectChanges();

      expect(component.editingLayerId()).toBe(layer.id);
      const input = fixture.nativeElement.querySelector('.edit-input');
      expect(input).toBeTruthy();
      expect(input.value).toBe('Layer 1');
      vi.useRealTimers();
    });

    it('should commit rename on commitEdit with changed name', () => {
      vi.useFakeTimers();
      const layer = layerService.layers()[0];
      const renameSpy = vi.spyOn(layerService, 'renameLayer');

      component.startEdit(layer);
      vi.advanceTimersByTime(0);
      fixture.detectChanges();

      component.editControl.setValue('New Name');
      component.commitEdit(layer, 0);
      fixture.detectChanges();

      expect(renameSpy).toHaveBeenCalledWith(0, 'New Name');
      expect(component.editingLayerId()).toBeNull();
      vi.useRealTimers();
    });

    it('should not rename if name is unchanged', () => {
      vi.useFakeTimers();
      const layer = layerService.layers()[0];
      const renameSpy = vi.spyOn(layerService, 'renameLayer');

      component.startEdit(layer);
      vi.advanceTimersByTime(0);
      fixture.detectChanges();

      // Don't change the value
      component.commitEdit(layer, 0);
      fixture.detectChanges();

      expect(renameSpy).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('should not rename if name is empty', () => {
      vi.useFakeTimers();
      const layer = layerService.layers()[0];
      const renameSpy = vi.spyOn(layerService, 'renameLayer');

      component.startEdit(layer);
      vi.advanceTimersByTime(0);
      fixture.detectChanges();

      component.editControl.setValue('   ');
      component.commitEdit(layer, 0);
      fixture.detectChanges();

      expect(renameSpy).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('should cancel edit without renaming', () => {
      vi.useFakeTimers();
      const layer = layerService.layers()[0];
      const renameSpy = vi.spyOn(layerService, 'renameLayer');

      component.startEdit(layer);
      vi.advanceTimersByTime(0);
      fixture.detectChanges();

      component.editControl.setValue('Something Else');
      component.cancelEdit();
      fixture.detectChanges();

      expect(renameSpy).not.toHaveBeenCalled();
      expect(component.editingLayerId()).toBeNull();
      vi.useRealTimers();
    });

    it('should suppress click after long-press triggers edit', () => {
      vi.useFakeTimers();
      fixture.detectChanges();
      const setActiveSpy = vi.spyOn(layerService, 'setActiveLayer');

      const layer = layerService.layers()[0];
      const event = new PointerEvent('pointerdown', { clientX: 100, clientY: 100 });
      component.onPointerDown(event, layer);

      vi.advanceTimersByTime(500);

      // Edit mode should be active
      expect(component.editingLayerId()).toBe(layer.id);

      // Now a click event fires (as it naturally would after pointerup)
      component.onSelect(0);

      // setActiveLayer should NOT have been called
      expect(setActiveSpy).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('should enter edit mode on Enter key press', () => {
      fixture.detectChanges();

      const layer = layerService.layers()[0];
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      vi.spyOn(event, 'preventDefault');

      component.onEnterKey(event, layer);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(component.editingLayerId()).toBe(layer.id);
      expect(component.editControl.value).toBe('Layer 1');
    });

    it('should not enter edit mode via Enter when already editing', () => {
      fixture.detectChanges();

      const layer = layerService.layers()[0];
      component.startEdit(layer);
      expect(component.editingLayerId()).toBe(layer.id);

      // Add a second layer to try editing it
      layerService.addLayer(4, 4);
      fixture.detectChanges();

      const layer2 = layerService.layers()[1];
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      vi.spyOn(event, 'preventDefault');

      component.onEnterKey(event, layer2);

      // Should still be editing the first layer
      expect(component.editingLayerId()).toBe(layer.id);
      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });

  describe('onSelect', () => {
    it('should set active layer on normal click', () => {
      const setActiveSpy = vi.spyOn(layerService, 'setActiveLayer');
      component.onSelect(0);
      expect(setActiveSpy).toHaveBeenCalledWith(0);
    });

    it('should not set active layer while editing', () => {
      const layer = layerService.layers()[0];
      const setActiveSpy = vi.spyOn(layerService, 'setActiveLayer');

      component.startEdit(layer);
      fixture.detectChanges();

      component.onSelect(0);
      expect(setActiveSpy).not.toHaveBeenCalled();
    });
  });
});
