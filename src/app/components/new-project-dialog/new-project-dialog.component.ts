import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';

export interface NewProjectDialogResult {
  name: string;
  width: number;
  height: number;
}

@Component({
  selector: 'app-new-project-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatInputModule, MatFormFieldModule, FormsModule],
  template: `
    <h2 mat-dialog-title>New Project</h2>
    <mat-dialog-content>
      <div class="new-project-form">
        <mat-form-field appearance="outline">
          <mat-label>Project Name</mat-label>
          <input matInput [(ngModel)]="name" placeholder="Untitled" aria-label="Project name" />
        </mat-form-field>

        <div class="dimensions">
          <mat-form-field appearance="outline">
            <mat-label>Width</mat-label>
            <input
              matInput
              type="number"
              [(ngModel)]="width"
              [min]="1"
              aria-label="Canvas width in pixels"
            />
            <span matSuffix>px</span>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Height</mat-label>
            <input
              matInput
              type="number"
              [(ngModel)]="height"
              [min]="1"
              aria-label="Canvas height in pixels"
            />
            <span matSuffix>px</span>
          </mat-form-field>
        </div>

        <div class="presets">
          <button mat-stroked-button (click)="setPreset(16, 16)">16×16</button>
          <button mat-stroked-button (click)="setPreset(32, 32)">32×32</button>
          <button mat-stroked-button (click)="setPreset(64, 64)">64×64</button>
          <button mat-stroked-button (click)="setPreset(128, 128)">128×128</button>
        </div>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button [disabled]="width < 1 || height < 1" (click)="onCreate()">
        Create
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .new-project-form {
        display: flex;
        flex-direction: column;
        gap: 16px;
        min-width: 280px;
      }

      .dimensions {
        display: flex;
        gap: 16px;
      }

      .dimensions mat-form-field {
        flex: 1;
      }

      .presets {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
    `,
  ],
})
export class NewProjectDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<NewProjectDialogComponent>);

  name = 'Untitled';
  width = 32;
  height = 32;

  setPreset(w: number, h: number): void {
    this.width = w;
    this.height = h;
  }

  onCreate(): void {
    const result: NewProjectDialogResult = {
      name: this.name,
      width: this.width,
      height: this.height,
    };
    this.dialogRef.close(result);
  }
}
