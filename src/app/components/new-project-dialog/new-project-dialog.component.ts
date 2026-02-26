import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { GridType, triangularRowWidth } from '../../models';

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
}

@Component({
  selector: 'app-new-project-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule,
    FormsModule,
  ],
  templateUrl: './new-project-dialog.component.html',
  styleUrl: './new-project-dialog.component.scss',
})
export class NewProjectDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<NewProjectDialogComponent>);

  name = 'Untitled';
  width = 32;
  height = 32;
  gridType: GridType = 'square';
  triangularA = 1;
  triangularD = 2;
  triangularDNum = 1;
  triangularDDen = 2;
  triangularShift = 0;
  /** For triangular grids, height = number of rows (R). */
  triangularRows = 10;

  get shiftMax(): number {
    return Math.max(0, this.triangularDDen - 1);
  }

  setPreset(w: number, h: number): void {
    this.width = w;
    this.height = h;
  }

  setTriangularPreset(a: number, dNum: number, dDen: number, rows: number): void {
    this.triangularA = a;
    this.triangularDNum = dNum;
    this.triangularDDen = dDen;
    this.triangularShift = 0;
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
