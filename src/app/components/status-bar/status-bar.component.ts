import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { CanvasStateService } from '../../services/canvas-state.service';
import { ToolService } from '../../services/tool.service';

@Component({
  selector: 'app-status-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  template: `
    <div class="status-bar safe-area-bottom">
      <span class="status-item"
        >{{ canvasState.canvasWidth() }}×{{ canvasState.canvasHeight() }}px</span
      >
      <span class="status-item">Zoom: {{ canvasState.zoomPercent() }}%</span>
      <span class="status-item">Tool: {{ activeToolLabel() }}</span>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        z-index: 80;
      }

      .status-bar {
        display: flex;
        align-items: center;
        height: 32px;
        padding: 0 16px;
        gap: 24px;
        background: var(--mat-sys-surface-container);
        border-top: 1px solid var(--mat-sys-outline-variant);
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
    `,
  ],
})
export class StatusBarComponent {
  protected readonly canvasState = inject(CanvasStateService);
  private readonly toolService = inject(ToolService);

  protected readonly activeToolLabel = computed(() => {
    const tool = this.toolService.activeTool;
    return tool?.label ?? 'None';
  });
}
