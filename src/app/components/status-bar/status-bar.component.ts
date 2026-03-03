import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { CanvasStateService } from '../../services/canvas-state.service';
import { LayerService } from '../../services/layer.service';
import { ToolService } from '../../services/tool.service';
import { ColorService } from '../../services/color.service';
import { colorToRgba, pixelOffset, triangularRowWidth } from '../../models';

@Component({
  selector: 'app-status-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './status-bar.component.html',
  styleUrl: './status-bar.component.scss',
})
export class StatusBarComponent {
  protected readonly canvasState = inject(CanvasStateService);
  private readonly toolService = inject(ToolService);
  protected readonly colorService = inject(ColorService);
  private readonly layerService = inject(LayerService);

  protected readonly activeToolLabel = computed(() => {
    const tool = this.toolService.activeTool;
    return tool?.label ?? 'None';
  });

  protected readonly primaryColorRgba = computed(() =>
    colorToRgba(this.colorService.primaryColor()),
  );

  /** Count of pixels in the active layer that match the current primary color. */
  protected readonly primaryColorPixelCount = computed(() => {
    const layer = this.layerService.activeLayer();
    if (!layer) return 0;
    const { data } = layer;
    const color = this.colorService.primaryColor();
    const bw = this.canvasState.bufferWidth();
    const bh = this.canvasState.bufferHeight();
    const gridType = this.canvasState.gridType();
    const triangularA = this.canvasState.triangularA();
    const triangularDNum = this.canvasState.triangularDNum();
    const triangularDDen = this.canvasState.triangularDDen();
    const triangularShift = this.canvasState.triangularShift();
    let count = 0;
    for (let y = 0; y < bh; y++) {
      const rowWidth =
        gridType === 'triangular'
          ? triangularRowWidth(y, triangularA, triangularDNum, triangularDDen, triangularShift)
          : bw;
      for (let x = 0; x < rowWidth; x++) {
        const o = pixelOffset(
          x, y, bw, gridType,
          triangularA, undefined,
          triangularDNum, triangularDDen, triangularShift,
        );
        if (
          data[o] === color.r &&
          data[o + 1] === color.g &&
          data[o + 2] === color.b &&
          data[o + 3] === color.a
        ) {
          count++;
        }
      }
    }
    return count;
  });
}
