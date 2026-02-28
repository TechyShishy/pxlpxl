import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { ToolbarComponent } from '../toolbar/toolbar.component';
import { ToolPaletteComponent } from '../tool-palette/tool-palette.component';
import { CanvasViewportComponent } from '../canvas-viewport/canvas-viewport.component';
import { ColorPaletteComponent } from '../color-palette/color-palette.component';
import { LayersPanelComponent } from '../layers-panel/layers-panel.component';
import { StatusBarComponent } from '../status-bar/status-bar.component';
import { LoadProjectPanelComponent } from '../load-project-panel/load-project-panel.component';
import { LayoutService } from '../../services/layout.service';
import { ToolService } from '../../services/tool.service';
import { ProjectService } from '../../services/project.service';
import { ColorService } from '../../services/color.service';
import { PencilTool } from '../../tools/pencil.tool';
import { EraserTool } from '../../tools/eraser.tool';
import { LineTool } from '../../tools/line.tool';
import { RectangleTool } from '../../tools/rectangle.tool';
import { EllipseTool } from '../../tools/ellipse.tool';
import { FillTool } from '../../tools/fill.tool';
import { EyedropperTool } from '../../tools/eyedropper.tool';
import { MoveTool } from '../../tools/move.tool';
import { PanTool } from '../../tools/pan.tool';
import { RotateTool } from '../../tools/rotate.tool';

@Component({
  selector: 'app-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ToolbarComponent,
    ToolPaletteComponent,
    CanvasViewportComponent,
    ColorPaletteComponent,
    LayersPanelComponent,
    StatusBarComponent,
    LoadProjectPanelComponent,
  ],
  templateUrl: './editor.component.html',
  styleUrl: './editor.component.scss',
})
export class EditorComponent implements OnInit {
  protected readonly layout = inject(LayoutService);
  private readonly toolService = inject(ToolService);
  private readonly projectService = inject(ProjectService);
  private readonly colorService = inject(ColorService);

  ngOnInit(): void {
    this.registerTools();
    this.projectService.newProject('Untitled', 32, 32);
  }

  async onProjectSelected(id: number): Promise<void> {
    await this.projectService.loadProject(id);
    this.layout.closeLoadPanel();
  }

  private registerTools(): void {
    const eyedropper = new EyedropperTool();
    eyedropper.onColorPicked = (color, isSecondary) => {
      if (isSecondary) {
        this.colorService.setSecondaryColor(color);
      } else {
        this.colorService.setPrimaryColor(color);
      }
    };

    this.toolService.registerTool(new PencilTool());
    this.toolService.registerTool(new EraserTool());
    this.toolService.registerTool(new LineTool());
    this.toolService.registerTool(new RectangleTool());
    this.toolService.registerTool(new EllipseTool());
    this.toolService.registerTool(new FillTool());
    this.toolService.registerTool(eyedropper);
    this.toolService.registerTool(new MoveTool());
    this.toolService.registerTool(new PanTool());
    this.toolService.registerTool(new RotateTool());
  }
}
