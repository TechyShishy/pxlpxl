import {
  Component,
  ChangeDetectionStrategy,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { distinctUntilChanged } from 'rxjs/operators';
import { SettingsService } from '../../services/settings.service';
import { DEFAULT_SETTINGS } from '../../models/settings.model';

@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatDividerModule,
    MatTooltipModule,
    MatSlideToggleModule,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent {
  private readonly router = inject(Router);
  protected readonly settingsService = inject(SettingsService);
  private readonly fb = inject(FormBuilder);

  protected readonly form: FormGroup = this.fb.group({
    theme: [this.settingsService.settings().theme],
    defaultColorPool: [this.settingsService.settings().defaultColorPool],
    defaultGridType: [this.settingsService.settings().defaultGridType],
    defaultWidth: [this.settingsService.settings().defaultWidth],
    defaultHeight: [this.settingsService.settings().defaultHeight],
    defaultTriangularA: [this.settingsService.settings().defaultTriangularA],
    defaultTriangularDNum: [this.settingsService.settings().defaultTriangularDNum],
    defaultTriangularDDen: [this.settingsService.settings().defaultTriangularDDen],
    defaultTriangularShift: [this.settingsService.settings().defaultTriangularShift],
    defaultTriangularRows: [this.settingsService.settings().defaultTriangularRows],
    defaultShowGrid: [this.settingsService.settings().defaultShowGrid],
    defaultShowRulers: [this.settingsService.settings().defaultShowRulers],
    defaultSamplingMode: [this.settingsService.settings().defaultSamplingMode],
    defaultMaxColors: [this.settingsService.settings().defaultMaxColors],
    defaultQuantizeAlgorithm: [this.settingsService.settings().defaultQuantizeAlgorithm],
  });

  constructor() {
    this.form.valueChanges
      .pipe(
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
        takeUntilDestroyed(),
      )
      .subscribe((value) => {
        this.settingsService.update(value);
      });
  }

  goBack(): void {
    this.router.navigate(['/editor']);
  }

  resetToDefaults(): void {
    this.settingsService.resetToDefaults();
    this.form.patchValue(DEFAULT_SETTINGS, { emitEvent: false });
  }
}
