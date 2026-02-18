import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
} from '@angular/core';
import {
  MatDialogModule,
  MatDialogRef,
  MAT_DIALOG_DATA,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatSliderModule } from '@angular/material/slider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { Color, colorToRgba, hexToColor } from '../../models';

export interface EditSwatchDialogData {
  index: number;
  color: Color;
}

export interface EditSwatchDialogResult {
  index: number;
  color: Color;
}

/** Converts a Color to a 6-char #rrggbb hex string (drops alpha). */
function colorToHex6(color: Color): string {
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`;
}

@Component({
  selector: 'app-edit-swatch-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatSliderModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
  ],
  templateUrl: './edit-swatch-dialog.component.html',
  styleUrl: './edit-swatch-dialog.component.scss',
})
export class EditSwatchDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<EditSwatchDialogComponent>);
  protected readonly data = inject<EditSwatchDialogData>(MAT_DIALOG_DATA);

  /** 6-char #rrggbb string driving the native color input */
  protected readonly hexValue = signal<string>(colorToHex6(this.data.color));

  /** Alpha channel 0–255 */
  protected readonly alphaValue = signal<number>(this.data.color.a);

  /** Live preview — updates as the user moves either control */
  protected readonly previewColor = computed<Color>(() => {
    const base = hexToColor(this.hexValue());
    return { ...base, a: this.alphaValue() };
  });

  protected readonly previewRgba = computed<string>(() =>
    colorToRgba(this.previewColor()),
  );

  protected readonly alphaPercent = computed<number>(() =>
    Math.round((this.alphaValue() / 255) * 100),
  );

  onHexChange(value: string): void {
    this.hexValue.set(value);
  }

  onAlphaChange(value: number): void {
    this.alphaValue.set(value);
  }

  onConfirm(): void {
    const result: EditSwatchDialogResult = {
      index: this.data.index,
      color: this.previewColor(),
    };
    this.dialogRef.close(result);
  }
}
