import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { CanvasStateService } from '../../services/canvas-state.service';
import { ToolService } from '../../services/tool.service';
import { ColorService } from '../../services/color.service';
import { colorToRgba } from '../../models';

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

  protected readonly activeToolLabel = computed(() => {
    const tool = this.toolService.activeTool;
    return tool?.label ?? 'None';
  });

  protected readonly primaryColorRgba = computed(() =>
    colorToRgba(this.colorService.primaryColor()),
  );
}
