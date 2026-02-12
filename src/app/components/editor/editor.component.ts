import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { ToolbarComponent } from '../toolbar/toolbar.component';
import { ToolPaletteComponent } from '../tool-palette/tool-palette.component';
import { CanvasViewportComponent } from '../canvas-viewport/canvas-viewport.component';
import { ColorPaletteComponent } from '../color-palette/color-palette.component';
import { LayersPanelComponent } from '../layers-panel/layers-panel.component';
import { StatusBarComponent } from '../status-bar/status-bar.component';
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
  ],
  template: `
    <div class="editor-layout" [class.portrait]="layout.isPortrait()">
      <app-toolbar />

      <div class="editor-body">
        @if (layout.leftSidebarOpen()) {
          <app-tool-palette />
        }

        <app-canvas-viewport />

        @if (layout.rightSidebarOpen() && layout.isLandscape()) {
          <aside class="right-sidebar panel-touch">
            <app-color-palette />
            <div class="sidebar-divider"></div>
            <app-layers-panel />
          </aside>
        }
      </div>

      <app-status-bar />
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        width: 100%;
      }

      .editor-layout {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
      }

      .editor-body {
        display: flex;
        flex: 1;
        overflow: hidden;
      }

      .right-sidebar {
        width: 240px;
        min-width: 240px;
        background: var(--mat-sys-surface-container);
        border-left: 1px solid var(--mat-sys-outline-variant);
        overflow-y: auto;
        display: flex;
        flex-direction: column;
      }

      .sidebar-divider {
        height: 1px;
        background: var(--mat-sys-outline-variant);
        margin: 8px 0;
      }

      /* Portrait: sidebars would become bottom sheets (future) */
      .editor-layout.portrait .right-sidebar {
        display: none;
      }
    `,
  ],
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
  }
}
