import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  viewChild,
  ElementRef,
  afterNextRender,
  InjectionToken,
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
import iro from '@jaames/iro';
import { Color, colorToRgba, hexToColor } from '../../models';
import { colorToDbCode, dbCodeToHex } from '../../utils/color-pools';

export const IRO_TOKEN = new InjectionToken<typeof iro>('iro', {
  providedIn: 'root',
  factory: () => iro,
});

export interface ColorPickerDialogData {
  color: Color;
  /** Palette index of the swatch being edited. Required to show the Remove button. */
  index?: number;
  /** Number of entries in the palette. Used to disable Remove when only one remains. */
  paletteLength?: number;
  /** True when the color is referenced by at least one pixel on the canvas. Disables Remove. */
  isInUse?: boolean;
}

export interface ColorPickerDialogResult {
  color: Color;
  /** Palette index, echoed from the input data when provided. */
  index?: number;
  /** True when the user clicked Remove. */
  deleted?: true;
}

function colorToHex6(color: Color): string {
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`;
}

@Component({
  selector: 'app-color-picker-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatSliderModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './color-picker-dialog.component.html',
  styleUrl: './color-picker-dialog.component.scss',
})
export class ColorPickerDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<ColorPickerDialogComponent>);
  protected readonly data = inject<ColorPickerDialogData>(MAT_DIALOG_DATA);
  private readonly iroLib = inject(IRO_TOKEN);

  private readonly pickerContainer =
    viewChild.required<ElementRef<HTMLDivElement>>('pickerContainer');

  private picker: iro.ColorPicker | null = null;
  private isProgrammaticUpdate = false;

  /** Raw value of the hex text input — may be incomplete while the user is typing. */
  protected readonly hexInput = signal<string>(colorToHex6(this.data.color));

  /** Last validated 6-digit hex value; drives previewColor. */
  protected readonly hexValue = signal<string>(colorToHex6(this.data.color));

  /** Alpha channel (0–255). */
  protected readonly alphaValue = signal<number>(this.data.color.a);

  /** DB code field raw input value. Empty string when the current color has no catalog entry. */
  protected readonly dbCodeInput = signal<string>(colorToDbCode(this.data.color) ?? '');

  /** True while the DB code field contains a non-empty, unrecognized code. */
  protected readonly dbCodeError = signal<boolean>(false);

  protected readonly previewColor = computed<Color>(() => ({
    ...hexToColor(this.hexValue()),
    a: this.alphaValue(),
  }));

  protected readonly previewRgba = computed<string>(() =>
    colorToRgba(this.previewColor()),
  );

  protected readonly alphaPercent = computed<number>(() =>
    Math.round((this.alphaValue() / 255) * 100),
  );

  /** True when a palette index was provided — i.e., the Remove button should be rendered. */
  protected readonly showRemoveButton = computed<boolean>(
    () => this.data.index !== undefined,
  );

  /** True when Remove is enabled: palette has more than one entry and color is not in use. */
  protected readonly canRemove = computed<boolean>(
    () => (this.data.paletteLength ?? 1) > 1 && !(this.data.isInUse ?? false),
  );

  /** Mirrors the isInUse flag for template binding. */
  protected readonly inUse = this.data.isInUse ?? false;

  constructor() {
    afterNextRender(() => {
      this.picker = this.iroLib.ColorPicker(this.pickerContainer().nativeElement, {
        color: colorToHex6(this.data.color),
        width: 260,
        borderWidth: 1,
        borderColor: '#ccc',
      });
      this.picker.on('color:change', (color: { hexString: string }) => {
        if (!this.isProgrammaticUpdate) {
          const hex = color.hexString;
          this.hexValue.set(hex);
          this.hexInput.set(hex);
          this.dbCodeInput.set(colorToDbCode(hexToColor(hex)) ?? '');
          this.dbCodeError.set(false);
        }
      });
    });
  }

  protected onHexInputChange(value: string): void {
    this.hexInput.set(value);
    if (/^#[0-9a-fA-F]{6}$/.test(value)) {
      this.hexValue.set(value);
      this.dbCodeInput.set(colorToDbCode(hexToColor(value)) ?? '');
      this.dbCodeError.set(false);
      if (this.picker) {
        this.isProgrammaticUpdate = true;
        this.picker.color.hexString = value;
        this.isProgrammaticUpdate = false;
      }
    }
  }

  protected onDbCodeInputChange(value: string): void {
    this.dbCodeInput.set(value);
    if (value === '') {
      this.dbCodeError.set(false);
      return;
    }
    const hex = dbCodeToHex(value);
    if (hex !== null) {
      this.hexValue.set(hex);
      this.hexInput.set(hex);
      this.dbCodeError.set(false);
      if (this.picker) {
        this.isProgrammaticUpdate = true;
        this.picker.color.hexString = hex;
        this.isProgrammaticUpdate = false;
      }
    } else {
      this.dbCodeError.set(true);
    }
  }

  protected onAlphaChange(value: number): void {
    this.alphaValue.set(value);
  }

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected onConfirm(): void {
    const result: ColorPickerDialogResult = {
      color: this.previewColor(),
      index: this.data.index,
    };
    this.dialogRef.close(result);
  }

  protected onRemove(): void {
    const result: ColorPickerDialogResult = {
      color: this.previewColor(),
      index: this.data.index,
      deleted: true,
    };
    this.dialogRef.close(result);
  }
}
