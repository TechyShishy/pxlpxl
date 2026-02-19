import { Injectable, signal, computed, inject } from '@angular/core';
import { ViewTransform, GridType } from '../models';
import { GridService } from './grid.service';

@Injectable({ providedIn: 'root' })
export class CanvasStateService {
  private readonly gridService = inject(GridService);

  readonly canvasWidth = signal<number>(32);
  readonly canvasHeight = signal<number>(32);
  readonly showGrid = signal<boolean>(true);
  readonly showRulers = signal<boolean>(false);
  readonly gridType = signal<GridType>('square');

  readonly transform = signal<ViewTransform>({
    scale: 10,
    offsetX: 0,
    offsetY: 0,
  });

  readonly zoomPercent = computed(() => Math.round(this.transform().scale * 100));

  setCanvasSize(width: number, height: number): void {
    this.canvasWidth.set(width);
    this.canvasHeight.set(height);
  }

  setGridType(type: GridType): void {
    this.gridType.set(type);
  }

  setZoom(scale: number): void {
    const clamped = Math.max(0.5, Math.min(64, scale));
    this.transform.update((t) => ({ ...t, scale: clamped }));
  }

  zoomIn(): void {
    this.setZoom(this.transform().scale * 1.25);
  }

  zoomOut(): void {
    this.setZoom(this.transform().scale / 1.25);
  }

  resetZoom(): void {
    this.transform.set({ scale: 10, offsetX: 0, offsetY: 0 });
  }

  pan(deltaX: number, deltaY: number): void {
    this.transform.update((t) => ({
      ...t,
      offsetX: t.offsetX + deltaX,
      offsetY: t.offsetY + deltaY,
    }));
  }

  setPan(offsetX: number, offsetY: number): void {
    this.transform.update((t) => ({ ...t, offsetX, offsetY }));
  }

  toggleGrid(): void {
    this.showGrid.update((v) => !v);
  }

  toggleRulers(): void {
    this.showRulers.update((v) => !v);
  }

  /** Convert screen coordinates to pixel coordinates on the canvas */
  screenToPixel(
    screenX: number,
    screenY: number,
    canvasRect: DOMRect,
  ): { x: number; y: number } | null {
    const t = this.transform();
    const localX = screenX - canvasRect.left - t.offsetX;
    const localY = screenY - canvasRect.top - t.offsetY;

    return this.gridService.screenToPixel(
      localX,
      localY,
      t.scale,
      this.canvasWidth(),
      this.canvasHeight(),
      this.gridType(),
    );
  }
}
