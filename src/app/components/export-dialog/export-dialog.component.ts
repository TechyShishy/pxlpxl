import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatRadioModule } from '@angular/material/radio';
import { MatSliderModule } from '@angular/material/slider';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { FormsModule } from '@angular/forms';
import { ExportFormat } from '../../services/export.service';

export interface ExportDialogResult {
  format: ExportFormat;
  scale: number;
  transparent: boolean;
}

@Component({
  selector: 'app-export-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatRadioModule,
    MatSliderModule,
    MatCheckboxModule,
    FormsModule,
  ],
  template: `
    <h2 mat-dialog-title>Export</h2>
    <mat-dialog-content>
      <div class="export-options">
        <label id="format-label">Format</label>
        <mat-radio-group aria-labelledby="format-label" [(ngModel)]="format">
          <mat-radio-button value="png">PNG</mat-radio-button>
          <mat-radio-button value="gif">GIF</mat-radio-button>
          <mat-radio-button value="spritesheet">Sprite Sheet</mat-radio-button>
        </mat-radio-group>

        <label>Scale: {{ scale }}x</label>
        <mat-slider [min]="1" [max]="16" [step]="1">
          <input matSliderThumb [(ngModel)]="scale" aria-label="Export scale" />
        </mat-slider>

        <mat-checkbox [(ngModel)]="transparent">Transparent background</mat-checkbox>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button (click)="onExport()">Export</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .export-options {
        display: flex;
        flex-direction: column;
        gap: 16px;
        min-width: 280px;
      }

      mat-radio-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
    `,
  ],
})
export class ExportDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<ExportDialogComponent>);

  format: ExportFormat = 'png';
  scale = 1;
  transparent = true;

  onExport(): void {
    const result: ExportDialogResult = {
      format: this.format,
      scale: this.scale,
      transparent: this.transparent,
    };
    this.dialogRef.close(result);
  }
}
