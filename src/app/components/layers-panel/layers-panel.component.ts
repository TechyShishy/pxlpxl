import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LayerService } from '../../services/layer.service';
import { CanvasStateService } from '../../services/canvas-state.service';

@Component({
  selector: 'app-layers-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatSliderModule, MatTooltipModule],
  template: `
    <div class="layers-panel panel-touch">
      <div class="layers-header">
        <span class="layers-title">Layers</span>
        <button
          mat-icon-button
          matTooltip="Add layer"
          (click)="addLayer()"
          aria-label="Add new layer"
        >
          <mat-icon>add</mat-icon>
        </button>
      </div>

      <div class="layers-list" role="listbox" aria-label="Layers">
        @for (layer of layerService.layers(); track layer.id; let i = $index) {
          <div
            class="layer-item"
            [class.active]="i === layerService.activeLayerIndex()"
            (click)="layerService.setActiveLayer(i)"
            role="option"
            [attr.aria-selected]="i === layerService.activeLayerIndex()"
            [attr.aria-label]="layer.name"
          >
            <button
              mat-icon-button
              (click)="layerService.toggleVisibility(i); $event.stopPropagation()"
              [matTooltip]="layer.visible ? 'Hide layer' : 'Show layer'"
              [attr.aria-label]="layer.visible ? 'Hide ' + layer.name : 'Show ' + layer.name"
            >
              <mat-icon>{{ layer.visible ? 'visibility' : 'visibility_off' }}</mat-icon>
            </button>

            <span class="layer-name">{{ layer.name }}</span>

            <button
              mat-icon-button
              [disabled]="layerService.layerCount() <= 1"
              (click)="layerService.removeLayer(i); $event.stopPropagation()"
              matTooltip="Delete layer"
              [attr.aria-label]="'Delete ' + layer.name"
            >
              <mat-icon>delete</mat-icon>
            </button>
          </div>

          <div class="layer-opacity">
            <mat-icon class="opacity-icon">opacity</mat-icon>
            <mat-slider [min]="0" [max]="100" [step]="1" class="opacity-slider">
              <input
                matSliderThumb
                [value]="layer.opacity * 100"
                (valueChange)="layerService.setOpacity(i, $event / 100)"
                [attr.aria-label]="layer.name + ' opacity'"
              />
            </mat-slider>
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .layers-panel {
        padding: 8px;
      }

      .layers-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
      }

      .layers-title {
        font-weight: 500;
        font-size: 14px;
      }

      .layers-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .layer-item {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px;
        border-radius: 8px;
        cursor: pointer;
        min-height: 48px;
      }

      .layer-item:hover {
        background: var(--mat-sys-surface-container-high);
      }

      .layer-item.active {
        background: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);
      }

      .layer-name {
        flex: 1;
        font-size: 13px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .layer-opacity {
        display: flex;
        align-items: center;
        padding: 0 4px 0 12px;
        gap: 4px;
      }

      .opacity-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        opacity: 0.6;
      }

      .opacity-slider {
        flex: 1;
      }
    `,
  ],
})
export class LayersPanelComponent {
  protected readonly layerService = inject(LayerService);
  private readonly canvasState = inject(CanvasStateService);

  addLayer(): void {
    this.layerService.addLayer(this.canvasState.canvasWidth(), this.canvasState.canvasHeight());
  }
}
