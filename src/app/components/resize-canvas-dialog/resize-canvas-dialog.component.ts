import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { GridType } from '../../models';

/** Current canvas state passed into the dialog when opened. */
export interface ResizeCanvasDialogData {
  width: number;
  height: number;
  gridType: GridType;
  triangularA?: number;
  triangularDNum?: number;
  triangularDDen?: number;
  triangularShift?: number;
}

/** Result returned when the user confirms the dialog. */
export interface ResizeCanvasDialogResult {
  newWidth: number;
  newHeight: number;
  /** Only relevant for triangular grids. */
  newTriangularA?: number;
  anchor: {
    h: 0 | 1 | 2;
    v: 0 | 1 | 2;
  };
}

@Component({
  selector: 'app-resize-canvas-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
  ],
  templateUrl: './resize-canvas-dialog.component.html',
  styleUrl: './resize-canvas-dialog.component.scss',
})
export class ResizeCanvasDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<ResizeCanvasDialogComponent>);
  protected readonly data = inject<ResizeCanvasDialogData>(MAT_DIALOG_DATA);

  readonly newWidth = signal(this.data.width);
  readonly newHeight = signal(this.data.height);
  readonly newTriangularA = signal(this.data.triangularA ?? 1);

  readonly anchorH = signal<0 | 1 | 2>(1);
  readonly anchorV = signal<0 | 1 | 2>(1);

  /** Label for a given anchor column and row. */
  anchorLabel(col: number, row: number): string {
    const v = ['top', 'middle', 'bottom'][row];
    const h = ['left', 'center', 'right'][col];
    return `Anchor: ${v}-${h}`;
  }

  isActiveAnchor(col: number, row: number): boolean {
    return this.anchorH() === col && this.anchorV() === row;
  }

  setAnchor(col: number, row: number): void {
    this.anchorH.set(col as 0 | 1 | 2);
    this.anchorV.set(row as 0 | 1 | 2);
  }

  readonly isValid = computed(() => {
    const w = this.newWidth();
    const h = this.newHeight();
    if (!Number.isInteger(w) || w < 1) return false;
    if (!Number.isInteger(h) || h < 1) return false;
    if (this.data.gridType === 'triangular') {
      const a = this.newTriangularA();
      if (!Number.isInteger(a) || a < 1) return false;
    }
    return true;
  });

  confirm(): void {
    if (!this.isValid()) return;
    const result: ResizeCanvasDialogResult = {
      newWidth: this.newWidth(),
      newHeight: this.newHeight(),
      anchor: { h: this.anchorH(), v: this.anchorV() },
    };
    if (this.data.gridType === 'triangular') {
      result.newTriangularA = this.newTriangularA();
    }
    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
