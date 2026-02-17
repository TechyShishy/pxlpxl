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
  templateUrl: './tool-palette.component.html',
  styleUrl: './tool-palette.component.scss',
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
