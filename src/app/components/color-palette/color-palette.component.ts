import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { CdkDragDrop, CdkDropList, CdkDrag } from '@angular/cdk/drag-drop';
import { ColorService } from '../../services/color.service';
import { LayerService } from '../../services/layer.service';
import { HistoryService } from '../../services/history.service';
import { BackButtonService } from '../../services/back-button.service';
import { Color, colorToRgba } from '../../models';
import {
  EditSwatchDialogComponent,
  EditSwatchDialogResult,
} from '../edit-swatch-dialog/edit-swatch-dialog.component';
import { ReplaceColorCommand } from '../../commands/replace-color.command';
import { MovePaletteCommand } from '../../commands/move-palette.command';

const LONG_PRESS_DELAY = 500;
const MOVE_THRESHOLD = 5;

@Component({
  selector: 'app-color-palette',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, CdkDropList, CdkDrag],
  templateUrl: './color-palette.component.html',
  styleUrl: './color-palette.component.scss',
})
export class ColorPaletteComponent {
  protected readonly colorService = inject(ColorService);
  private readonly layerService = inject(LayerService);
  private readonly historyService = inject(HistoryService);
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
    // Note: setPointerCapture is intentionally omitted here. CDK DragDrop
    // manages its own pointer capture once a drag starts, and capturing the
    // pointer on the button conflicts with CDK's internal handling. The
    // long-press guard (onSwatchDragStarted → cancelLongPress) ensures the
    // timer is cancelled before the 500 ms threshold when CDK takes over.

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

  protected onSwatchDrop(event: CdkDragDrop<Color[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    this.historyService.execute(
      new MovePaletteCommand(this.colorService, event.previousIndex, event.currentIndex),
    );
  }

  protected onSwatchDragStarted(): void {
    this.cancelLongPress();
  }

  private cancelLongPress(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.dragStartPos = null;
  }

  protected addSwatch(): void {
    this.colorService.addToPalette(this.colorService.primaryColor());
  }

  private openEditDialog(index: number): void {
    const palette = this.colorService.palette();
    const color = palette[index];
    const isInUse = this.layerService.isColorInUse(color);
    const ref = this.dialog.open(EditSwatchDialogComponent, {
      data: { index, color, paletteLength: palette.length, isInUse },
    });

    const deregister = this.backButtonService.push(() => {
      ref.close();
      return true;
    });

    ref.afterClosed().subscribe((result: EditSwatchDialogResult | undefined) => {
      deregister();
      if (result) {
        if (result.deleted) {
          this.colorService.removeFromPalette(result.index);
        } else {
          this.historyService.execute(
            new ReplaceColorCommand(
              this.layerService,
              this.colorService,
              result.index,
              color,
              result.color,
            ),
          );
        }
      }
    });
  }
}
