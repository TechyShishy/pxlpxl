import {
  Component,
  ChangeDetectionStrategy,
  inject,
  output,
  signal,
  OnInit,
  OnDestroy,
  ElementRef,
  viewChildren,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatRippleModule } from '@angular/material/core';
import { ProjectService } from '../../services/project.service';
import { MatSnackBar } from '@angular/material/snack-bar';

const LONG_PRESS_DELAY = 500;
const MOVE_THRESHOLD = 5;

@Component({
  selector: 'app-load-project-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatRippleModule,
  ],
  templateUrl: './load-project-panel.component.html',
  styleUrl: './load-project-panel.component.scss',
})
export class LoadProjectPanelComponent implements OnInit, OnDestroy {
  protected readonly projectService = inject(ProjectService);
  private readonly snackBar = inject(MatSnackBar);

  readonly projectSelected = output<number>();
  readonly closed = output<void>();

  readonly editingProjectId = signal<number | null>(null);
  readonly editControl = new FormControl('', { nonNullable: true });

  private readonly editInputs = viewChildren<ElementRef<HTMLInputElement>>('editInput');

  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private pointerStart: { x: number; y: number } | null = null;
  private suppressClick = false;
  private originalName = '';

  ngOnInit(): void {
    this.projectService.refreshSavedProjects();
  }

  ngOnDestroy(): void {
    this.clearLongPressTimer();
  }

  onPointerDown(event: PointerEvent, project: { id?: number; name: string }): void {
    this.pointerStart = { x: event.clientX, y: event.clientY };
    this.clearLongPressTimer();

    this.longPressTimer = setTimeout(() => {
      this.suppressClick = true;
      this.startEdit(project);
    }, LONG_PRESS_DELAY);
  }

  onPointerMove(event: PointerEvent): void {
    if (this.pointerStart == null) return;
    const dx = event.clientX - this.pointerStart.x;
    const dy = event.clientY - this.pointerStart.y;
    if (Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD) {
      this.clearLongPressTimer();
    }
  }

  onPointerUp(): void {
    this.clearLongPressTimer();
  }

  onEnterKey(event: Event, project: { id?: number; name: string }): void {
    if (this.editingProjectId() !== null) return;
    event.preventDefault();
    this.startEdit(project);
  }

  onSelect(project: { id?: number }): void {
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    if (this.editingProjectId() !== null) return;
    if (project.id != null) {
      this.projectSelected.emit(project.id);
    }
  }

  async onDelete(event: Event, project: { id?: number }): Promise<void> {
    event.stopPropagation();
    if (project.id == null) return;

    try {
      await this.projectService.deleteProject(project.id);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      this.snackBar.open(`Delete failed: ${message}`, 'Dismiss', { duration: 5000 });
    }
  }

  startEdit(project: { id?: number; name: string }): void {
    if (project.id == null) return;
    this.originalName = project.name;
    this.editControl.setValue(project.name);
    this.editingProjectId.set(project.id);

    // Focus the input after Angular renders it
    setTimeout(() => {
      const inputs = this.editInputs();
      if (inputs.length > 0) {
        const input = inputs[0].nativeElement;
        input.focus();
        input.select();
      }
    });
  }

  async commitEdit(project: { id?: number }): Promise<void> {
    const id = this.editingProjectId();
    if (id === null || project.id !== id) return;

    const newName = this.editControl.value.trim();
    this.editingProjectId.set(null);

    if (newName === '' || newName === this.originalName) return;

    try {
      await this.projectService.renameProject(id, newName);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      this.snackBar.open(`Rename failed: ${message}`, 'Dismiss', { duration: 5000 });
    }
  }

  cancelEdit(): void {
    this.editingProjectId.set(null);
  }

  private clearLongPressTimer(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }
}
