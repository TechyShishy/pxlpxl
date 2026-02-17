import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { GridType } from '../../models';

export interface NewProjectDialogResult {
  name: string;
  width: number;
  height: number;
  gridType: GridType;
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

  setPreset(w: number, h: number): void {
    this.width = w;
    this.height = h;
  }

  onCreate(): void {
    const result: NewProjectDialogResult = {
      name: this.name,
      width: this.width,
      height: this.height,
      gridType: this.gridType,
    };
    this.dialogRef.close(result);
  }
}
