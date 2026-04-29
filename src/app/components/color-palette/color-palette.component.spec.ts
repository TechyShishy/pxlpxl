import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Subject } from 'rxjs';
import { ColorPaletteComponent } from './color-palette.component';
import { ColorService } from '../../services/color.service';
import { BackButtonService } from '../../services/back-button.service';
import { Color } from '../../models';
import {
  ColorPickerDialogComponent,
  ColorPickerDialogResult,
} from '../color-picker-dialog/color-picker-dialog.component';

const RED: Color = { r: 255, g: 0, b: 0, a: 255 };
const BLUE: Color = { r: 0, g: 0, b: 255, a: 255 };

function makeColorService() {
  const palette = signal<Color[]>([RED, BLUE]);
  return {
    palette,
    primaryColor: signal<Color>(RED),
    secondaryColor: signal<Color>(BLUE),
    orphanMode: signal<boolean>(false),
    orphanThreshold: signal<number>(5),
    palettePixelCounts: signal<Map<number, number>>(new Map()),
    swapColors: vi.fn(),
    addToPalette: vi.fn(),
    removeFromPalette: vi.fn(),
    updatePaletteColor: vi.fn(),
    setPrimaryColor: vi.fn(),
    setSecondaryColor: vi.fn(),
    toggleOrphanMode: vi.fn(),
    increaseOrphanThreshold: vi.fn(),
    decreaseOrphanThreshold: vi.fn(),
  };
}

function makeBackButtonService() {
  return { push: vi.fn(() => vi.fn()) };
}

function makeDialogRef(afterClosedSubject: Subject<ColorPickerDialogResult | undefined>) {
  return {
    close: vi.fn(),
    afterClosed: () => afterClosedSubject.asObservable(),
  } as unknown as MatDialogRef<unknown>;
}

function setup() {
  const colorService = makeColorService();
  const backButtonService = makeBackButtonService();
  const afterClosedSubject = new Subject<ColorPickerDialogResult | undefined>();
  const dialogRef = makeDialogRef(afterClosedSubject);

  const dialog = {
    open: vi.fn(() => dialogRef),
  };

  TestBed.configureTestingModule({
    imports: [ColorPaletteComponent, NoopAnimationsModule],
    providers: [
      { provide: ColorService, useValue: colorService },
      { provide: BackButtonService, useValue: backButtonService },
      { provide: MatDialog, useValue: dialog },
    ],
  });

  const fixture = TestBed.createComponent(ColorPaletteComponent);
  fixture.detectChanges();

  return { fixture, component: fixture.componentInstance, colorService, dialog, afterClosedSubject };
}

describe('ColorPaletteComponent', () => {
  it('addSwatch() calls addToPalette with the current primary color', () => {
    const { component, colorService } = setup();
    (component as unknown as { addSwatch: () => void }).addSwatch();
    expect(colorService.addToPalette).toHaveBeenCalledWith(RED);
  });

  it('opening the edit dialog opens ColorPickerDialogComponent with correct data', () => {
    const { component, dialog, colorService } = setup();
    colorService.palette.set([RED, BLUE]);
    (component as unknown as { openEditDialog: (i: number) => void })['openEditDialog'](0);
    expect(dialog.open).toHaveBeenCalledWith(
      ColorPickerDialogComponent,
      expect.objectContaining({
        data: expect.objectContaining({ paletteLength: 2, index: 0, color: RED }),
      }),
    );
  });

  it('calls updatePaletteColor when dialog closes without deleted flag', () => {
    const { component, colorService, afterClosedSubject } = setup();
    (component as unknown as { openEditDialog: (i: number) => void })['openEditDialog'](0);
    const newColor: Color = { r: 100, g: 100, b: 100, a: 255 };
    afterClosedSubject.next({ color: newColor });
    expect(colorService.updatePaletteColor).toHaveBeenCalledWith(0, newColor);
    expect(colorService.removeFromPalette).not.toHaveBeenCalled();
  });

  it('calls removeFromPalette when dialog closes with deleted: true', () => {
    const { component, colorService, afterClosedSubject } = setup();
    (component as unknown as { openEditDialog: (i: number) => void })['openEditDialog'](1);
    afterClosedSubject.next({ color: BLUE, deleted: true });
    expect(colorService.removeFromPalette).toHaveBeenCalledWith(1);
    expect(colorService.updatePaletteColor).not.toHaveBeenCalled();
  });

  it('does nothing when dialog closes without a result', () => {
    const { component, colorService, afterClosedSubject } = setup();
    (component as unknown as { openEditDialog: (i: number) => void })['openEditDialog'](0);
    afterClosedSubject.next(undefined);
    expect(colorService.updatePaletteColor).not.toHaveBeenCalled();
    expect(colorService.removeFromPalette).not.toHaveBeenCalled();
  });
});
