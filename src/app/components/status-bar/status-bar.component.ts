import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { CanvasStateService } from '../../services/canvas-state.service';
import { ToolService } from '../../services/tool.service';

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

  protected readonly activeToolLabel = computed(() => {
    const tool = this.toolService.activeTool;
    return tool?.label ?? 'None';
  });
}
