import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatBadgeModule } from '@angular/material/badge';
import { MatDialog } from '@angular/material/dialog';
import { CdkDragDrop, CdkDropList, CdkDrag } from '@angular/cdk/drag-drop';
import { ColorService } from '../../services/color.service';
import { LayerService } from '../../services/layer.service';
import { HistoryService } from '../../services/history.service';
import { BackButtonService } from '../../services/back-button.service';
import { CanvasStateService, AbsorptionState, PixelAbsorptionAssignment } from '../../services/canvas-state.service';
import { Color, colorToRgba, PixelCoord, pixelOffset } from '../../models';
import { GridService } from '../../services/grid.service';
import {
  ColorPickerDialogComponent,
  ColorPickerDialogData,
  ColorPickerDialogResult,
} from '../color-picker-dialog/color-picker-dialog.component';
import { ReplaceColorCommand } from '../../commands/replace-color.command';
import { MovePaletteCommand } from '../../commands/move-palette.command';
import { AbsorbColorCommand } from '../../commands/absorb-color.command';
import { colorDistance, nearestColor } from '../../utils/color-quantize';
import { byteOffsetToPixelCoord } from '../../utils/buffer-coords';

const LONG_PRESS_DELAY = 500;
const MOVE_THRESHOLD = 5;

@Component({
  selector: 'app-color-palette',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, MatMenuModule, MatBadgeModule, CdkDropList, CdkDrag],
  templateUrl: './color-palette.component.html',
  styleUrl: './color-palette.component.scss',
})
export class ColorPaletteComponent {
  protected readonly colorService = inject(ColorService);
  private readonly layerService = inject(LayerService);
  private readonly historyService = inject(HistoryService);
  private readonly dialog = inject(MatDialog);
  private readonly backButtonService = inject(BackButtonService);
  private readonly canvasState = inject(CanvasStateService);
  private readonly gridService = inject(GridService);

  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private dragStartPos: { x: number; y: number } | null = null;

  protected readonly isAbsorbing = computed(() => this.canvasState.absorptionState() !== null);

  /** True when orphan mode is active and not in mid-absorb preview. */
  protected readonly showOrphanBadges = computed(
    () => this.colorService.orphanMode() && !this.isAbsorbing(),
  );

  /** Maps palette index → pixel count. Reactive via ColorService.palettePixelCounts. */
  protected readonly pixelCounts = this.colorService.palettePixelCounts;

  protected isOrphan(index: number): boolean {
    return (this.pixelCounts().get(index) ?? 0) <= this.colorService.orphanThreshold();
  }

  protected pixelCountLabel(index: number): string {
    return String(this.pixelCounts().get(index) ?? 0);
  }

  protected primaryColorRgba = () => colorToRgba(this.colorService.primaryColor());

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

  protected increaseThreshold(): void {
    this.colorService.increaseOrphanThreshold();
  }

  protected decreaseThreshold(): void {
    this.colorService.decreaseOrphanThreshold();
  }

  /** Begin the absorb preview for palette entry at `paletteIndex`. */
  protected initiateAbsorb(paletteIndex: number): void {
    const palette = this.colorService.palette();
    const sourceColor = palette[paletteIndex];
    const threshold = this.colorService.orphanThreshold();
    const counts = this.pixelCounts();

    // Candidates: palette entries with pixel count > threshold, sorted by distance.
    const candidates: Color[] = palette
      .map((c, i) => ({ color: c, index: i, count: counts.get(i) ?? 0 }))
      .filter(({ index, count }) => index !== paletteIndex && count > threshold)
      .sort((a, b) => colorDistance(sourceColor, a.color) - colorDistance(sourceColor, b.color))
      .map(({ color }) => color);

    if (candidates.length === 0) return; // nothing to absorb into

    // Scan all layers for pixels matching sourceColor and build assignments.
    const gridType = this.canvasState.gridType();
    const bufferWidth = this.canvasState.bufferWidth();
    const bufferHeight = this.canvasState.bufferHeight();
    const isTriangular = this.gridService.isAnyTriangular(gridType);
    const triangularA = this.canvasState.triangularA();
    const triangularD = this.canvasState.triangularD();
    const triangularDNum = this.canvasState.triangularDNum();
    const triangularDDen = this.canvasState.triangularDDen();
    const triangularShift = this.canvasState.triangularShift();

    const assignments: PixelAbsorptionAssignment[] = [];
    const layers = this.layerService.layers();

    for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
      const data = layers[layerIndex].data;
      for (let i = 0; i < data.length; i += 4) {
        if (
          data[i]     === sourceColor.r &&
          data[i + 1] === sourceColor.g &&
          data[i + 2] === sourceColor.b &&
          data[i + 3] === sourceColor.a
        ) {
          const { x, y } = byteOffsetToPixelCoord(
            i,
            bufferWidth,
            gridType,
            bufferHeight,
            isTriangular ? triangularA : undefined,
            isTriangular ? triangularD : undefined,
            isTriangular ? triangularDNum : undefined,
            isTriangular ? triangularDDen : undefined,
            isTriangular ? triangularShift : undefined,
          );
          assignments.push({
            layerIndex,
            byteOffset: i,
            bufX: x,
            bufY: y,
            candidateIndex: 0, // default to nearest neighbor
          });
        }
      }
    }

    const state: AbsorptionState = {
      paletteIndex,
      sourceColor,
      candidates,
      assignments,
    };
    this.canvasState.enterAbsorptionMode(state);
  }

  /** Commit the current absorption preview — fires the undoable command. */
  protected commitAbsorb(): void {
    const state = this.canvasState.absorptionState();
    if (!state) return;

    const pixelAbsorptions = state.assignments.map((a) => ({
      layerIndex: a.layerIndex,
      byteOffset: a.byteOffset,
      targetColor: state.candidates[a.candidateIndex],
    }));

    this.historyService.execute(
      new AbsorbColorCommand(
        this.layerService,
        this.colorService,
        state.paletteIndex,
        state.sourceColor,
        pixelAbsorptions,
      ),
    );

    this.canvasState.exitAbsorptionMode();
  }

  /** Cancel the absorption preview without making any changes. */
  protected cancelAbsorb(): void {
    this.canvasState.exitAbsorptionMode();
  }

  private openEditDialog(index: number): void {
    const palette = this.colorService.palette();
    const color = palette[index];
    const isInUse = this.layerService.isColorInUse(color);
    const data: ColorPickerDialogData = {
      color,
      index,
      paletteLength: palette.length,
      isInUse,
    };
    const ref = this.dialog.open<
      ColorPickerDialogComponent,
      ColorPickerDialogData,
      ColorPickerDialogResult
    >(ColorPickerDialogComponent, { data });

    const deregister = this.backButtonService.push(() => {
      ref.close();
      return true;
    });

    ref.afterClosed().subscribe((result: ColorPickerDialogResult | undefined) => {
      deregister();
      if (result) {
        if (result.deleted) {
          this.colorService.removeFromPalette(index);
        } else {
          this.historyService.execute(
            new ReplaceColorCommand(
              this.layerService,
              this.colorService,
              index,
              color,
              result.color,
            ),
          );
        }
      }
    });
  }
}
