import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsModule } from '@angular/forms';
import { GridType, triangularRowWidth, DEFAULT_PALETTE } from '../../models';
import type { Color } from '../../models';
import { SettingsService } from '../../services/settings.service';
import { ColorPoolId, DEFAULT_DELICA_PALETTE } from '../../utils/color-pools';

export interface NewProjectDialogResult {
  name: string;
  width: number;
  height: number;
  gridType: GridType;
  triangularA?: number;
  triangularD?: number;
  triangularDNum?: number;
  triangularDDen?: number;
  triangularShift?: number;
  colorPool?: Color[];
}

@Component({
  selector: 'app-new-project-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule,
    MatTooltipModule,
    FormsModule,
  ],
  templateUrl: './new-project-dialog.component.html',
  styleUrl: './new-project-dialog.component.scss',
})
export class NewProjectDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<NewProjectDialogComponent>);
  private readonly settingsService = inject(SettingsService);

  readonly poolOptions: Array<{ id: ColorPoolId; label: string }> = [
    { id: 'any', label: 'Default' },
    { id: 'delica', label: 'Delica' },
  ];

  name = 'Untitled';
  selectedPoolId: ColorPoolId = this.settingsService.defaultColorPool();
  width = this.settingsService.settings().defaultWidth;
  height = this.settingsService.settings().defaultHeight;
  gridType: GridType = this.settingsService.settings().defaultGridType;

  readonly aspectRatioLocked = signal(false);
  private readonly lockedRatio = signal<number | null>(null);
  triangularA = this.settingsService.settings().defaultTriangularA;
  triangularD = 2;
  triangularDNum = this.settingsService.settings().defaultTriangularDNum;
  triangularDDen = this.settingsService.settings().defaultTriangularDDen;
  triangularShift = this.settingsService.settings().defaultTriangularShift;
  /** For triangular grids, height = number of rows (R). */
  triangularRows = this.settingsService.settings().defaultTriangularRows;

  get shiftMax(): number {
    return Math.max(0, this.triangularDDen - 1);
  }

  toggleAspectRatioLock(): void {
    const locked = !this.aspectRatioLocked();
    this.aspectRatioLocked.set(locked);
    if (locked && this.height > 0) {
      this.lockedRatio.set(this.width / this.height);
    } else {
      this.lockedRatio.set(null);
    }
  }

  onWidthChange(value: number | string | null): void {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1) return;
    this.width = n;
    const ratio = this.lockedRatio();
    if (this.aspectRatioLocked() && ratio !== null) {
      this.height = Math.max(1, Math.round(n / ratio));
    }
  }

  onHeightChange(value: number | string | null): void {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1) return;
    this.height = n;
    const ratio = this.lockedRatio();
    if (this.aspectRatioLocked() && ratio !== null) {
      this.width = Math.max(1, Math.round(n * ratio));
    }
  }

  swapDimensions(): void {
    [this.width, this.height] = [this.height, this.width];
    if (this.aspectRatioLocked() && this.height > 0) {
      this.lockedRatio.set(this.width / this.height);
    }
  }

  setPreset(w: number, h: number): void {
    this.width = w;
    this.height = h;
    if (this.aspectRatioLocked() && h > 0) {
      this.lockedRatio.set(w / h);
    }
  }

  setTriangularPreset(a: number, dNum: number, dDen: number, rows: number, shift: number = 0): void {
    this.triangularA = a;
    this.triangularDNum = dNum;
    this.triangularDDen = dDen;
    this.triangularShift = shift;
    this.triangularRows = rows;
  }

  private get isTriangularType(): boolean {
    return this.gridType === 'triangular';
  }

  private computeMaxWidth(): number {
    if (this.gridType === 'triangular') {
      let max = 0;
      for (let r = 0; r < this.triangularRows; r++) {
        max = Math.max(max, triangularRowWidth(r, this.triangularA, this.triangularDNum, this.triangularDDen, this.triangularShift));
      }
      return max;
    }
    return this.width;
  }

  onCreate(): void {
    const result: NewProjectDialogResult = {
      name: this.name,
      width: this.isTriangularType ? this.computeMaxWidth() : this.width,
      height: this.isTriangularType ? this.triangularRows : this.height,
      gridType: this.gridType,
      triangularA: this.isTriangularType ? this.triangularA : undefined,
      triangularD: undefined,
      triangularDNum: this.isTriangularType ? this.triangularDNum : undefined,
      triangularDDen: this.isTriangularType ? this.triangularDDen : undefined,
      triangularShift: this.isTriangularType ? this.triangularShift : undefined,
      colorPool: this.selectedPoolId === 'delica' ? [...DEFAULT_DELICA_PALETTE] : [...DEFAULT_PALETTE],
    };
    this.dialogRef.close(result);
  }

  get isCreateDisabled(): boolean {
    if (this.gridType === 'triangular') {
      return this.triangularA < 1 || this.triangularDNum < 1 || this.triangularDDen < 1 || this.triangularRows < 1;
    }
    return this.width < 1 || this.height < 1;
  }
}
