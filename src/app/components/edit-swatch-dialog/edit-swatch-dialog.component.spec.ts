import { TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Subject } from 'rxjs';
import { EditSwatchDialogComponent } from './edit-swatch-dialog.component';
import { ColorPickerDialogComponent } from '../color-picker-dialog/color-picker-dialog.component';
import { Color } from '../../models';

describe('EditSwatchDialogComponent', () => {
  const RED: Color = { r: 255, g: 0, b: 0, a: 255 };

  let afterClosedSubject: Subject<Color | undefined>;
  let mockDialogRef: { afterClosed: () => Subject<Color | undefined> };
  let mockDialog: { open: ReturnType<typeof vi.fn> };

  function setup(color: Color, index = 0, paletteLength = 3, isInUse = false) {
    afterClosedSubject = new Subject<Color | undefined>();
    mockDialogRef = { afterClosed: () => afterClosedSubject };
    mockDialog = { open: vi.fn().mockReturnValue(mockDialogRef) };

    const closeSpy = vi.fn();
    TestBed.configureTestingModule({
      imports: [EditSwatchDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { index, color, paletteLength, isInUse } },
        { provide: MatDialogRef, useValue: { close: closeSpy } },
      ],
    });
    // MatDialogModule re-provides MatDialog in the component's environment injector,
    // shadowing a root-level mock. Override at the component level to ensure the mock wins.
    TestBed.overrideComponent(EditSwatchDialogComponent, {
      add: { providers: [{ provide: MatDialog, useValue: mockDialog }] },
    });
    const fixture = TestBed.createComponent(EditSwatchDialogComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, closeSpy };
  }

  type Comp = {
    color: () => Color;
    openColorPicker: () => void;
    onConfirm: () => void;
    onRemove: () => void;
    canRemove: () => boolean;
  };

  it('initializes color from the provided data', () => {
    const { component } = setup(RED);
    expect((component as unknown as Comp).color()).toEqual(RED);
  });

  it('openColorPicker opens ColorPickerDialogComponent', () => {
    const { component } = setup(RED);
    (component as unknown as Comp).openColorPicker();
    expect(mockDialog.open).toHaveBeenCalledWith(
      ColorPickerDialogComponent,
      expect.objectContaining({ data: { color: RED } }),
    );
  });

  it('updates color when the picker dialog closes with a new color', () => {
    const { component } = setup(RED);
    const BLUE: Color = { r: 0, g: 0, b: 255, a: 255 };
    (component as unknown as Comp).openColorPicker();
    afterClosedSubject.next(BLUE);
    expect((component as unknown as Comp).color()).toEqual(BLUE);
  });

  it('does not change color when the picker dialog is cancelled', () => {
    const { component } = setup(RED);
    (component as unknown as Comp).openColorPicker();
    afterClosedSubject.next(undefined);
    expect((component as unknown as Comp).color()).toEqual(RED);
  });

  it('closes the dialog with index and current color on confirm', () => {
    const { component, closeSpy } = setup(RED, 3);
    (component as unknown as Comp).onConfirm();
    expect(closeSpy).toHaveBeenCalledWith({ index: 3, color: RED });
  });

  it('closes the dialog with deleted flag on remove', () => {
    const { component, closeSpy } = setup(RED, 2, 4);
    (component as unknown as Comp).onRemove();
    expect(closeSpy).toHaveBeenCalledWith({
      index: 2,
      color: expect.objectContaining({ r: 255, g: 0, b: 0 }),
      deleted: true,
    });
  });

  it('canRemove is true when paletteLength > 1 and not in use', () => {
    const { component } = setup(RED, 0, 3, false);
    expect((component as unknown as Comp).canRemove()).toBe(true);
  });

  it('canRemove is false when paletteLength === 1', () => {
    const { component } = setup(RED, 0, 1, false);
    expect((component as unknown as Comp).canRemove()).toBe(false);
  });

  it('canRemove is false when color is in use', () => {
    const { component } = setup(RED, 0, 3, true);
    expect((component as unknown as Comp).canRemove()).toBe(false);
  });
});

