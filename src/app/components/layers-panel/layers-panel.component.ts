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
  templateUrl: './layers-panel.component.html',
  styleUrl: './layers-panel.component.scss',
})
export class LayersPanelComponent {
  protected readonly layerService = inject(LayerService);
  private readonly canvasState = inject(CanvasStateService);

  addLayer(): void {
    this.layerService.addLayer(this.canvasState.canvasWidth(), this.canvasState.canvasHeight());
  }
}
