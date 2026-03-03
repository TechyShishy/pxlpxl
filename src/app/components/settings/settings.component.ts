import {
  Component,
  ChangeDetectionStrategy,
  inject,
  OnInit,
  OnDestroy,
} from '@angular/core';
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
import { Subscription } from 'rxjs';
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
export class SettingsComponent implements OnInit, OnDestroy {
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

  private subscription: Subscription | undefined;

  ngOnInit(): void {
    this.subscription = this.form.valueChanges
      .pipe(distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)))
      .subscribe((value) => {
        this.settingsService.update(value);
      });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  goBack(): void {
    this.router.navigate(['/editor']);
  }

  resetToDefaults(): void {
    this.settingsService.resetToDefaults();
    this.form.patchValue(DEFAULT_SETTINGS, { emitEvent: false });
  }
}
