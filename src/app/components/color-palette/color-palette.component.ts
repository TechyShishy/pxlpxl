import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ColorService } from '../../services/color.service';
import { Color, colorToRgba } from '../../models';

@Component({
  selector: 'app-color-palette',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
    <div class="color-palette panel-touch">
      <div class="active-colors">
        <button
          class="color-preview primary"
          [style.background]="primaryColorRgba()"
          matTooltip="Primary color"
          aria-label="Primary color"
        ></button>
        <button
          class="color-preview secondary"
          [style.background]="secondaryColorRgba()"
          matTooltip="Secondary color"
          aria-label="Secondary color"
        ></button>
        <button
          mat-icon-button
          matTooltip="Swap colors"
          (click)="colorService.swapColors()"
          aria-label="Swap primary and secondary colors"
        >
          <mat-icon>swap_horiz</mat-icon>
        </button>
      </div>

      <div class="swatches" role="listbox" aria-label="Color palette">
        @for (color of colorService.palette(); track $index) {
          <button
            class="swatch"
            [style.background]="toRgba(color)"
            [class.selected]="isSelected(color)"
            (click)="colorService.setPrimaryColor(color)"
            (dblclick)="colorService.setSecondaryColor(color)"
            [attr.aria-label]="'Color ' + ($index + 1)"
            role="option"
            [attr.aria-selected]="isSelected(color)"
          ></button>
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .color-palette {
        padding: 8px;
      }

      .active-colors {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
      }

      .color-preview {
        width: 40px;
        height: 40px;
        min-width: 40px;
        min-height: 40px;
        border-radius: 8px;
        border: 2px solid var(--mat-sys-outline);
        cursor: pointer;
      }

      .color-preview.primary {
        border-color: var(--mat-sys-primary);
      }

      .swatches {
        display: grid;
        grid-template-columns: repeat(auto-fill, 40px);
        gap: 4px;
        justify-content: start;
      }

      .swatch {
        width: 40px;
        height: 40px;
        min-width: 40px;
        min-height: 40px;
        border-radius: 4px;
        border: 2px solid transparent;
        cursor: pointer;
        padding: 0;
        /* Padding around swatch provides the 48px touch target */
        margin: 0;
        box-sizing: content-box;
      }

      .swatch.selected {
        border-color: var(--mat-sys-primary);
      }

      .swatch:focus-visible {
        outline: 2px solid var(--mat-sys-primary);
        outline-offset: 2px;
      }
    `,
  ],
})
export class ColorPaletteComponent {
  protected readonly colorService = inject(ColorService);

  protected primaryColorRgba = () => colorToRgba(this.colorService.primaryColor());
  protected secondaryColorRgba = () => colorToRgba(this.colorService.secondaryColor());

  protected toRgba(color: Color): string {
    return colorToRgba(color);
  }

  protected isSelected(color: Color): boolean {
    const primary = this.colorService.primaryColor();
    return (
      color.r === primary.r &&
      color.g === primary.g &&
      color.b === primary.b &&
      color.a === primary.a
    );
  }
}
