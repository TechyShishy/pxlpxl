import {
  Component,
  ChangeDetectionStrategy,
  inject,
  output,
  OnInit,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatRippleModule } from '@angular/material/core';
import { ProjectService } from '../../services/project.service';

@Component({
  selector: 'app-load-project-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, MatButtonModule, MatIconModule, MatListModule, MatRippleModule],
  template: `
    <div class="panel-header">
      <h2>Projects</h2>
      <button mat-icon-button (click)="closed.emit()" aria-label="Close projects panel">
        <mat-icon>close</mat-icon>
      </button>
    </div>

    <div class="panel-body">
      @if (projectService.savedProjects().length === 0) {
        <div class="empty-state">
          <mat-icon class="empty-icon">folder_off</mat-icon>
          <p>No saved projects</p>
        </div>
      } @else {
        <mat-nav-list>
          @for (project of projectService.savedProjects(); track project.id) {
            <mat-list-item (click)="onSelect(project)" class="project-item">
              <mat-icon matListItemIcon>image</mat-icon>
              <span matListItemTitle>{{ project.name }}</span>
              <span matListItemLine class="project-meta">
                {{ project.width }}×{{ project.height }} · {{ project.updatedAt | date: 'short' }}
              </span>
              <button
                mat-icon-button
                matListItemMeta
                (click)="onDelete($event, project)"
                aria-label="Delete project"
              >
                <mat-icon>delete</mat-icon>
              </button>
            </mat-list-item>
          }
        </mat-nav-list>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        width: 320px;
        min-width: 320px;
        height: 100%;
        background: var(--mat-sys-surface-container);
        border-right: 1px solid var(--mat-sys-outline-variant);
        z-index: 150;
        animation: slideIn 250ms ease;
      }

      @keyframes slideIn {
        from {
          transform: translateX(-100%);
        }
        to {
          transform: translateX(0);
        }
      }

      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        border-bottom: 1px solid var(--mat-sys-outline-variant);
      }

      .panel-header h2 {
        margin: 0;
        font-size: 16px;
        font-weight: 500;
      }

      .panel-body {
        flex: 1;
        overflow-y: auto;
      }

      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 16px;
        color: var(--mat-sys-on-surface-variant);
      }

      .empty-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        margin-bottom: 12px;
        opacity: 0.5;
      }

      .project-meta {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }

      .project-item {
        cursor: pointer;
      }
    `,
  ],
})
export class LoadProjectPanelComponent implements OnInit {
  protected readonly projectService = inject(ProjectService);

  readonly projectSelected = output<number>();
  readonly closed = output<void>();

  ngOnInit(): void {
    this.projectService.refreshSavedProjects();
  }

  onSelect(project: { id?: number }): void {
    if (project.id != null) {
      this.projectSelected.emit(project.id);
    }
  }

  async onDelete(event: Event, project: { id?: number }): Promise<void> {
    event.stopPropagation();
    if (project.id == null) return;

    await this.projectService.deleteProject(project.id);
  }
}
