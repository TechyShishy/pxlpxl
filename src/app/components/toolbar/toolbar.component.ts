import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { HistoryService } from '../../services/history.service';
import { LayoutService } from '../../services/layout.service';
import { CanvasStateService } from '../../services/canvas-state.service';
import { ProjectService } from '../../services/project.service';
import { ExportService } from '../../services/export.service';
import {
  NewProjectDialogComponent,
  NewProjectDialogResult,
} from '../new-project-dialog/new-project-dialog.component';

@Component({
  selector: 'app-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatToolbarModule, MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule],
  template: `
    <mat-toolbar class="toolbar safe-area-top">
      <button
        mat-icon-button
        matTooltip="Toggle tools"
        (click)="layout.toggleLeftSidebar()"
        aria-label="Toggle tool palette"
      >
        <mat-icon>menu</mat-icon>
      </button>

      <span class="app-title">Pxlpxl</span>

      <span class="spacer"></span>

      <!-- File menu -->
      <button
        mat-icon-button
        [matMenuTriggerFor]="fileMenu"
        matTooltip="File"
        aria-label="File menu"
      >
        <mat-icon>folder</mat-icon>
      </button>
      <mat-menu #fileMenu="matMenu">
        <button mat-menu-item (click)="onNewProject()">
          <mat-icon>add</mat-icon>
          <span>New Project</span>
        </button>
        <button mat-menu-item (click)="onSaveProject()">
          <mat-icon>save</mat-icon>
          <span>Save</span>
        </button>
        <button mat-menu-item (click)="onExportProject()">
          <mat-icon>download</mat-icon>
          <span>Export</span>
        </button>
      </mat-menu>

      <!-- Undo / Redo -->
      <button
        mat-icon-button
        [disabled]="!history.canUndo()"
        [matTooltip]="history.canUndo() ? 'Undo: ' + history.undoDescription() : 'Nothing to undo'"
        (click)="history.undo()"
        aria-label="Undo"
      >
        <mat-icon>undo</mat-icon>
      </button>
      <button
        mat-icon-button
        [disabled]="!history.canRedo()"
        [matTooltip]="history.canRedo() ? 'Redo: ' + history.redoDescription() : 'Nothing to redo'"
        (click)="history.redo()"
        aria-label="Redo"
      >
        <mat-icon>redo</mat-icon>
      </button>

      <!-- View controls -->
      <button
        mat-icon-button
        matTooltip="Zoom in"
        (click)="canvasState.zoomIn()"
        aria-label="Zoom in"
      >
        <mat-icon>zoom_in</mat-icon>
      </button>
      <button
        mat-icon-button
        matTooltip="Zoom out"
        (click)="canvasState.zoomOut()"
        aria-label="Zoom out"
      >
        <mat-icon>zoom_out</mat-icon>
      </button>
      <button
        mat-icon-button
        matTooltip="Toggle grid"
        (click)="canvasState.toggleGrid()"
        aria-label="Toggle pixel grid"
      >
        <mat-icon>grid_on</mat-icon>
      </button>

      <button
        mat-icon-button
        matTooltip="Toggle panels"
        (click)="layout.toggleRightSidebar()"
        aria-label="Toggle panels"
      >
        <mat-icon>dashboard</mat-icon>
      </button>
    </mat-toolbar>
  `,
  styles: [
    `
      :host {
        display: block;
        z-index: 100;
      }

      .toolbar {
        gap: 4px;
        padding: 0 8px;
      }

      .app-title {
        font-weight: 500;
        font-size: 18px;
        margin-left: 8px;
      }

      .spacer {
        flex: 1 1 auto;
      }
    `,
  ],
})
export class ToolbarComponent {
  protected readonly history = inject(HistoryService);
  protected readonly layout = inject(LayoutService);
  protected readonly canvasState = inject(CanvasStateService);
  private readonly projectService = inject(ProjectService);
  private readonly exportService = inject(ExportService);
  private readonly dialog = inject(MatDialog);

  onNewProject(): void {
    const dialogRef = this.dialog.open(NewProjectDialogComponent);
    dialogRef.afterClosed().subscribe((result: NewProjectDialogResult | undefined) => {
      if (result) {
        this.projectService.newProject(result.name, result.width, result.height, result.gridType);
      }
    });
  }

  async onSaveProject(): Promise<void> {
    await this.projectService.saveProject('Untitled');
  }

  async onExportProject(): Promise<void> {
    // TODO: Open ExportDialog
    await this.exportService.downloadExport(
      { format: 'png', scale: 1, transparent: true },
      'pxlpxl-export.png',
    );
  }
}
