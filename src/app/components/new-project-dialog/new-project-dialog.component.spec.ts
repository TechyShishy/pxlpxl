import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { NewProjectDialogComponent } from './new-project-dialog.component';
import { SettingsService } from '../../services/settings.service';
import { DEFAULT_SETTINGS } from '../../models/settings.model';

function makeSettingsService(settingsOverride?: Partial<typeof DEFAULT_SETTINGS>) {
  const base = { ...DEFAULT_SETTINGS, ...settingsOverride };
  return {
    settings: signal(base).asReadonly(),
    defaultColorPool: signal(base.defaultColorPool),
  };
}

function makeDialogRef() {
  return { close: vi.fn() } as unknown as MatDialogRef<NewProjectDialogComponent>;
}

function setup(settingsOverride?: Partial<typeof DEFAULT_SETTINGS>) {
  const settingsService = makeSettingsService(settingsOverride);
  const dialogRef = makeDialogRef();

  TestBed.configureTestingModule({
    imports: [NewProjectDialogComponent, NoopAnimationsModule],
    providers: [
      { provide: SettingsService, useValue: settingsService },
      { provide: MatDialogRef, useValue: dialogRef },
    ],
  });

  const fixture = TestBed.createComponent(NewProjectDialogComponent);
  const component = fixture.componentInstance;

  return { fixture, component, dialogRef };
}

describe('NewProjectDialogComponent', () => {
  describe('aspectRatioLocked signal', () => {
    it('starts unlocked', () => {
      const { component } = setup();
      expect(component.aspectRatioLocked()).toBe(false);
    });

    it('toggleAspectRatioLock() sets locked to true and captures ratio', () => {
      const { component } = setup({ defaultWidth: 32, defaultHeight: 16 });
      component.toggleAspectRatioLock();
      expect(component.aspectRatioLocked()).toBe(true);
    });

    it('toggleAspectRatioLock() unlocks and clears ratio on second call', () => {
      const { component } = setup({ defaultWidth: 32, defaultHeight: 16 });
      component.toggleAspectRatioLock(); // lock
      component.toggleAspectRatioLock(); // unlock
      expect(component.aspectRatioLocked()).toBe(false);
    });
  });

  describe('onWidthChange', () => {
    it('updates width when not locked', () => {
      const { component } = setup();
      component.onWidthChange(64);
      expect(component.width).toBe(64);
    });

    it('adjusts height proportionally when locked', () => {
      // width=32, height=16 → ratio=2; set width=64 → height should become 32
      const { component } = setup({ defaultWidth: 32, defaultHeight: 16 });
      component.toggleAspectRatioLock();
      component.onWidthChange(64);
      expect(component.width).toBe(64);
      expect(component.height).toBe(32);
    });

    it('clamps adjusted height to minimum 1', () => {
      const { component } = setup({ defaultWidth: 1000, defaultHeight: 1 });
      component.toggleAspectRatioLock(); // ratio ≈ 1000
      component.onWidthChange(1);
      expect(component.height).toBeGreaterThanOrEqual(1);
    });

    it('is a no-op for empty string input', () => {
      const { component } = setup({ defaultWidth: 32, defaultHeight: 32 });
      component.onWidthChange('');
      expect(component.width).toBe(32);
    });

    it('is a no-op for null input', () => {
      const { component } = setup({ defaultWidth: 32, defaultHeight: 32 });
      component.onWidthChange(null);
      expect(component.width).toBe(32);
    });

    it('is a no-op for value < 1', () => {
      const { component } = setup({ defaultWidth: 32, defaultHeight: 32 });
      component.onWidthChange(0);
      expect(component.width).toBe(32);
    });

    it('is a no-op for NaN', () => {
      const { component } = setup({ defaultWidth: 32, defaultHeight: 32 });
      component.onWidthChange(NaN);
      expect(component.width).toBe(32);
    });
  });

  describe('onHeightChange', () => {
    it('updates height when not locked', () => {
      const { component } = setup();
      component.onHeightChange(64);
      expect(component.height).toBe(64);
    });

    it('adjusts width proportionally when locked', () => {
      // width=16, height=32 → ratio=0.5; set height=64 → width should become 32
      const { component } = setup({ defaultWidth: 16, defaultHeight: 32 });
      component.toggleAspectRatioLock();
      component.onHeightChange(64);
      expect(component.height).toBe(64);
      expect(component.width).toBe(32);
    });

    it('is a no-op for empty string input', () => {
      const { component } = setup({ defaultWidth: 32, defaultHeight: 32 });
      component.onHeightChange('');
      expect(component.height).toBe(32);
    });

    it('is a no-op for null input', () => {
      const { component } = setup({ defaultWidth: 32, defaultHeight: 32 });
      component.onHeightChange(null);
      expect(component.height).toBe(32);
    });
  });

  describe('swapDimensions', () => {
    it('swaps width and height', () => {
      const { component } = setup({ defaultWidth: 16, defaultHeight: 32 });
      component.swapDimensions();
      expect(component.width).toBe(32);
      expect(component.height).toBe(16);
    });

    it('updates lockedRatio after swap when locked', () => {
      // Start 16×32 (ratio = 0.5), swap → 32×16 (ratio = 2)
      // Then changing width by 2× should change height by ½
      const { component } = setup({ defaultWidth: 16, defaultHeight: 32 });
      component.toggleAspectRatioLock(); // lock at ratio 0.5
      component.swapDimensions(); // now 32×16, ratio should refresh to 2
      component.onWidthChange(64); // width=64 → height = 64/2 = 32
      expect(component.height).toBe(32);
    });
  });

  describe('setPreset', () => {
    it('sets width and height', () => {
      const { component } = setup();
      component.setPreset(64, 128);
      expect(component.width).toBe(64);
      expect(component.height).toBe(128);
    });

    it('updates lockedRatio after preset when locked', () => {
      // Lock at 32×32 (ratio=1), then preset to 16×32 (ratio=0.5)
      // Changing width to 64 should give height=128
      const { component } = setup({ defaultWidth: 32, defaultHeight: 32 });
      component.toggleAspectRatioLock();
      component.setPreset(16, 32); // ratio → 0.5
      component.onWidthChange(64); // width=64 → height=128
      expect(component.height).toBe(128);
    });
  });
});
