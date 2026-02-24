import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatRadioModule } from '@angular/material/radio';
import { FormsModule } from '@angular/forms';

export type ExportDialogFormat = 'png' | 'pxl' | 'rgp';

export interface ExportDialogResult {
  format: ExportDialogFormat;
  scale: number;
  transparent: boolean;
  rgpOddRowDirection: 'ltr' | 'rtl';
}

export const EXPORT_FORMATS: { value: ExportDialogFormat; label: string }[] = [
  { value: 'png', label: 'PNG' },
  { value: 'pxl', label: 'PXL (Pxlpxl Project)' },
  { value: 'rgp', label: 'RGP (RowGuide Project)' },
];

export const PNG_SCALE_OPTIONS = [1, 2, 4, 8, 16] as const;

@Component({
  selector: 'app-export-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatRadioModule,
    FormsModule,
  ],
  templateUrl: './export-dialog.component.html',
  styleUrl: './export-dialog.component.scss',
})
export class ExportDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<ExportDialogComponent>);

  readonly formats = EXPORT_FORMATS;
  readonly pngScaleOptions = PNG_SCALE_OPTIONS;

  readonly selectedFormat = signal<ExportDialogFormat>('png');
  readonly pngScale = signal<number>(1);
  readonly pngTransparent = signal<boolean>(true);
  readonly rgpOddRowDirection = signal<'ltr' | 'rtl'>('rtl');

  onExport(): void {
    const format = this.selectedFormat();
    const result: ExportDialogResult = {
      format,
      scale: format === 'png' ? this.pngScale() : 1,
      transparent: format === 'png' ? this.pngTransparent() : true,
      rgpOddRowDirection: format === 'rgp' ? this.rgpOddRowDirection() : 'rtl',
    };
    this.dialogRef.close(result);
  }
}
