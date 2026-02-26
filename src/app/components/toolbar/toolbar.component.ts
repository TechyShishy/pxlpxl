import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  OnDestroy,
  ElementRef,
  viewChildren,
} from '@angular/core';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
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
import {
  ExportDialogComponent,
  ExportDialogResult,
} from '../export-dialog/export-dialog.component';
import { ExportFormat } from '../../services/export.service';

const LONG_PRESS_DELAY = 500;
const MOVE_THRESHOLD = 5;

@Component({
  selector: 'app-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatToolbarModule, MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule, MatDividerModule],
  templateUrl: './toolbar.component.html',
  styleUrl: './toolbar.component.scss',
})
export class ToolbarComponent implements OnDestroy {
  protected readonly history = inject(HistoryService);
  protected readonly layout = inject(LayoutService);
  protected readonly canvasState = inject(CanvasStateService);
  protected readonly projectService = inject(ProjectService);
  private readonly exportService = inject(ExportService);
  private readonly importService = inject(ImportService);
  private readonly dialog = inject(MatDialog);

  readonly editingTitle = signal(false);
  readonly editControl = new FormControl('', { nonNullable: true });

  private readonly titleEditInputs = viewChildren<ElementRef<HTMLInputElement>>('titleEditInput');

  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private pointerStart: { x: number; y: number } | null = null;
  private suppressClick = false;
  private originalName = '';

  ngOnDestroy(): void {
    this.clearLongPressTimer();
  }

  onTitlePointerDown(event: PointerEvent): void {
    this.pointerStart = { x: event.clientX, y: event.clientY };
    this.clearLongPressTimer();

    this.longPressTimer = setTimeout(() => {
      this.suppressClick = true;
      this.startTitleEdit();
    }, LONG_PRESS_DELAY);
  }

  onTitlePointerMove(event: PointerEvent): void {
    if (this.pointerStart == null) return;
    const dx = event.clientX - this.pointerStart.x;
    const dy = event.clientY - this.pointerStart.y;
    if (Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD) {
      this.clearLongPressTimer();
    }
  }

  onTitlePointerUp(): void {
    this.clearLongPressTimer();
  }

  startTitleEdit(): void {
    this.originalName = this.projectService.currentProjectName();
    this.editControl.setValue(this.originalName);
    this.editingTitle.set(true);

    setTimeout(() => {
      const inputs = this.titleEditInputs();
      if (inputs.length > 0) {
        const input = inputs[0].nativeElement;
        input.focus();
        input.select();
      }
    });
  }

  async commitTitleEdit(): Promise<void> {
    if (!this.editingTitle()) return;

    const newName = this.editControl.value.trim();
    this.editingTitle.set(false);

    if (newName === '' || newName === this.originalName) return;

    const id = this.projectService.currentId;
    if (id == null) {
      this.projectService.currentProjectName.set(newName);
      return;
    }

    await this.projectService.renameProject(id, newName);
  }

  cancelTitleEdit(): void {
    this.editingTitle.set(false);
  }

  private clearLongPressTimer(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  onNewProject(): void {
    const dialogRef = this.dialog.open(NewProjectDialogComponent);
    dialogRef.afterClosed().subscribe((result: NewProjectDialogResult | undefined) => {
      if (result) {
        this.projectService.newProject(
          result.name, result.width, result.height, result.gridType,
          result.triangularA, result.triangularD,
          result.triangularDNum, result.triangularDDen, result.triangularShift,
        );
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

  onExport(): void {
    const dialogRef = this.dialog.open(ExportDialogComponent);
    dialogRef.afterClosed().subscribe((result: ExportDialogResult | undefined) => {
      if (!result) return;
      const name = this.sanitizeFilename(this.projectService.currentProjectName());
      switch (result.format) {
        case 'pxl':
          void this.exportService.downloadPxl(`${name}.pxl`);
          break;
        case 'rgp':
          void this.exportService.downloadRgp(`${name}.rgp`, result.rgpOddRowDirection);
          break;
        default:
          void this.exportService.downloadExport(
            { format: result.format as ExportFormat, scale: result.scale, transparent: result.transparent },
            `${name}.${result.format}`,
          );
      }
    });
  }

  private sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'untitled';
  }
}
