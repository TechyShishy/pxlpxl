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
  templateUrl: './export-dialog.component.html',
  styleUrl: './export-dialog.component.scss',
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
