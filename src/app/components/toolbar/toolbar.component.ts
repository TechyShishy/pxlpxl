import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog } from '@angular/material/dialog';
import { HistoryService } from '../../services/history.service';
import { LayoutService } from '../../services/layout.service';
import { CanvasStateService } from '../../services/canvas-state.service';
import { ProjectService } from '../../services/project.service';
import { ExportService } from '../../services/export.service';
import { ImportService } from '../../services/import.service';
import {
  NewProjectDialogComponent,
  NewProjectDialogResult,
} from '../new-project-dialog/new-project-dialog.component';

@Component({
  selector: 'app-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatToolbarModule, MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule, MatDividerModule],
  templateUrl: './toolbar.component.html',
  styleUrl: './toolbar.component.scss',
})
export class ToolbarComponent {
  protected readonly history = inject(HistoryService);
  protected readonly layout = inject(LayoutService);
  protected readonly canvasState = inject(CanvasStateService);
  protected readonly projectService = inject(ProjectService);
  private readonly exportService = inject(ExportService);
  private readonly importService = inject(ImportService);
  private readonly dialog = inject(MatDialog);

  onNewProject(): void {
    const dialogRef = this.dialog.open(NewProjectDialogComponent);
    dialogRef.afterClosed().subscribe((result: NewProjectDialogResult | undefined) => {
      if (result) {
        this.projectService.newProject(result.name, result.width, result.height, result.gridType);
      }
    });
  }

  onLoadProject(): void {
    this.layout.openLoadPanel();
  }

  async onImportFile(): Promise<void> {
    const file = await this.importService.openFilePicker();
    if (file) {
      await this.importService.importFile(file);
    }
  }

  async onSaveProject(): Promise<void> {
    await this.projectService.saveProject();
  }

  async onExportProject(): Promise<void> {
    const name = this.sanitizeFilename(this.projectService.currentProjectName());
    await this.exportService.downloadExport(
      { format: 'png', scale: 1, transparent: true },
      `${name}.png`,
    );
  }

  async onExportPxl(): Promise<void> {
    const name = this.sanitizeFilename(this.projectService.currentProjectName());
    await this.exportService.downloadPxl(`${name}.pxl`);
  }

  private sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'untitled';
  }
}
