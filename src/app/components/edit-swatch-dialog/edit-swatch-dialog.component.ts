import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
} from '@angular/core';
import {
  MatDialog,
  MatDialogModule,
  MatDialogRef,
  MAT_DIALOG_DATA,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { Color, colorToRgba } from '../../models';
import {
  ColorPickerDialogComponent,
  ColorPickerDialogData,
} from '../color-picker-dialog/color-picker-dialog.component';

export interface EditSwatchDialogData {
  index: number;
  color: Color;
  paletteLength: number;
  /** True when this color is currently referenced by at least one pixel in the project. */
  isInUse: boolean;
}

export interface EditSwatchDialogResult {
  index: number;
  color: Color;
  deleted?: true;
}

@Component({
  selector: 'app-edit-swatch-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule],
  templateUrl: './edit-swatch-dialog.component.html',
  styleUrl: './edit-swatch-dialog.component.scss',
})
export class EditSwatchDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<EditSwatchDialogComponent>);
  private readonly dialog = inject(MatDialog);
  protected readonly data = inject<EditSwatchDialogData>(MAT_DIALOG_DATA);

  /** Currently selected color; updated when the nested color picker dialog closes. */
  protected readonly color = signal<Color>(this.data.color);

  protected readonly previewRgba = computed<string>(() =>
    colorToRgba(this.color()),
  );

  protected readonly canRemove = computed<boolean>(
    () => this.data.paletteLength > 1 && !this.data.isInUse,
  );

  protected readonly inUse = this.data.isInUse;

  openColorPicker(): void {
    this.dialog
      .open<ColorPickerDialogComponent, ColorPickerDialogData, Color>(
        ColorPickerDialogComponent,
        { data: { color: this.color() } },
      )
      .afterClosed()
      .subscribe((result: Color | undefined) => {
        if (result !== undefined) {
          this.color.set(result);
        }
      });
  }

  onConfirm(): void {
    const result: EditSwatchDialogResult = {
      index: this.data.index,
      color: this.color(),
    };
    this.dialogRef.close(result);
  }

  onRemove(): void {
    const result: EditSwatchDialogResult = {
      index: this.data.index,
      color: this.color(),
      deleted: true,
    };
    this.dialogRef.close(result);
  }
}
