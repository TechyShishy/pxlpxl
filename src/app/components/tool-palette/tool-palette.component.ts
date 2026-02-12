import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ToolService } from '../../services/tool.service';
import { ToolType } from '../../models';

@Component({
  selector: 'app-tool-palette',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
    <nav class="tool-palette panel-touch" aria-label="Drawing tools">
      @for (tool of tools(); track tool.type) {
        <button
          mat-icon-button
          [class.active]="tool.type === activeToolType()"
          [matTooltip]="tool.label"
          matTooltipPosition="right"
          (click)="selectTool(tool.type)"
          [attr.aria-label]="tool.label"
          [attr.aria-pressed]="tool.type === activeToolType()"
        >
          <mat-icon>{{ tool.icon }}</mat-icon>
        </button>
      }
    </nav>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 64px;
        background: var(--mat-sys-surface-container);
        border-right: 1px solid var(--mat-sys-outline-variant);
        padding: 8px 0;
        overflow-y: auto;
      }

      .tool-palette {
        display: flex;
        flex-direction: column;
        gap: 8px;
        align-items: center;
      }

      button.active {
        background: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);
      }
    `,
  ],
})
export class ToolPaletteComponent {
  private readonly toolService = inject(ToolService);

  readonly activeToolType = this.toolService.activeToolType;

  readonly tools = computed(() =>
    this.toolService.getAllTools().map((t) => ({
      type: t.type,
      icon: t.icon,
      label: t.label,
    })),
  );

  selectTool(type: ToolType): void {
    this.toolService.setActiveTool(type);
  }
}
