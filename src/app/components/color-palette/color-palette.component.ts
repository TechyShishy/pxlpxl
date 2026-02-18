import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { ColorService } from '../../services/color.service';
import { BackButtonService } from '../../services/back-button.service';
import { Color, colorToRgba } from '../../models';
import {
  EditSwatchDialogComponent,
  EditSwatchDialogResult,
} from '../edit-swatch-dialog/edit-swatch-dialog.component';

const LONG_PRESS_DELAY = 500;
const MOVE_THRESHOLD = 5;

@Component({
  selector: 'app-color-palette',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: './color-palette.component.html',
  styleUrl: './color-palette.component.scss',
})
export class ColorPaletteComponent {
  protected readonly colorService = inject(ColorService);
  private readonly dialog = inject(MatDialog);
  private readonly backButtonService = inject(BackButtonService);

  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private dragStartPos: { x: number; y: number } | null = null;

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

  protected onSwatchPointerDown(event: PointerEvent, index: number): void {
    this.dragStartPos = { x: event.clientX, y: event.clientY };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);

    this.longPressTimer = setTimeout(() => {
      this.longPressTimer = null;
      this.dragStartPos = null;
      this.openEditDialog(index);
    }, LONG_PRESS_DELAY);
  }

  protected onSwatchPointerMove(event: PointerEvent): void {
    if (!this.longPressTimer || !this.dragStartPos) return;
    const dx = event.clientX - this.dragStartPos.x;
    const dy = event.clientY - this.dragStartPos.y;
    if (Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD) {
      this.cancelLongPress();
    }
  }

  protected onSwatchPointerUp(): void {
    this.cancelLongPress();
  }

  protected onSwatchPointerCancel(): void {
    this.cancelLongPress();
  }

  protected onSwatchKeyDown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.openEditDialog(index);
    }
  }

  private cancelLongPress(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.dragStartPos = null;
  }

  private openEditDialog(index: number): void {
    const color = this.colorService.palette()[index];
    const ref = this.dialog.open(EditSwatchDialogComponent, {
      data: { index, color },
    });

    const deregister = this.backButtonService.push(() => {
      ref.close();
      return true;
    });

    ref.afterClosed().subscribe((result: EditSwatchDialogResult | undefined) => {
      deregister();
      if (result) {
        this.colorService.updatePaletteColor(result.index, result.color);
      }
    });
  }
}
