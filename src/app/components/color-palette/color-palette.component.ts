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
  templateUrl: './color-palette.component.html',
  styleUrl: './color-palette.component.scss',
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
