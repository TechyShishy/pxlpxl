import { TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { EditSwatchDialogComponent } from './edit-swatch-dialog.component';
import { Color } from '../../models';

describe('EditSwatchDialogComponent', () => {
  const RED: Color = { r: 255, g: 0, b: 0, a: 255 };
  const SEMI_TRANSPARENT_BLUE: Color = { r: 0, g: 0, b: 255, a: 128 };

  function setup(color: Color, index = 0) {
    const closeSpy = vi.fn();
    TestBed.configureTestingModule({
      imports: [EditSwatchDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { index, color } },
        { provide: MatDialogRef, useValue: { close: closeSpy } },
      ],
    });
    const fixture = TestBed.createComponent(EditSwatchDialogComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, closeSpy };
  }

  it('should initialize hexValue from the provided color', () => {
    const { component } = setup(RED);
    expect((component as unknown as { hexValue: { (): string } }).hexValue()).toBe('#ff0000');
  });

  it('should initialize alphaValue from the provided color', () => {
    const { component } = setup(RED);
    expect((component as unknown as { alphaValue: { (): number } }).alphaValue()).toBe(255);
  });

  it('should initialize alphaValue from a semi-transparent color', () => {
    const { component } = setup(SEMI_TRANSPARENT_BLUE);
    expect((component as unknown as { alphaValue: { (): number } }).alphaValue()).toBe(128);
  });

  it('should compute previewColor as RGB from hexValue with the current alpha', () => {
    const { component } = setup(RED);
    const preview = (component as unknown as { previewColor: { (): Color } }).previewColor();
    expect(preview.r).toBe(255);
    expect(preview.g).toBe(0);
    expect(preview.b).toBe(0);
    expect(preview.a).toBe(255);
  });

  it('should update previewColor when alpha changes', () => {
    const { component } = setup(RED);
    (component as unknown as { onAlphaChange: (v: number) => void }).onAlphaChange(128);
    const preview = (component as unknown as { previewColor: { (): Color } }).previewColor();
    expect(preview.a).toBe(128);
  });

  it('should update previewColor when hex changes', () => {
    const { component } = setup(RED);
    (component as unknown as { onHexChange: (v: string) => void }).onHexChange('#0000ff');
    const preview = (component as unknown as { previewColor: { (): Color } }).previewColor();
    expect(preview.r).toBe(0);
    expect(preview.b).toBe(255);
  });

  it('should close the dialog with index and updated color on confirm', () => {
    const { component, closeSpy } = setup(RED, 3);
    (component as unknown as { onAlphaChange: (v: number) => void }).onAlphaChange(200);
    (component as unknown as { onConfirm: () => void }).onConfirm();
    expect(closeSpy).toHaveBeenCalledWith({
      index: 3,
      color: { r: 255, g: 0, b: 0, a: 200 },
    });
  });

  it('should compute alphaPercent correctly', () => {
    const { component } = setup(SEMI_TRANSPARENT_BLUE);
    // 128/255 * 100 ≈ 50
    const pct = (component as unknown as { alphaPercent: { (): number } }).alphaPercent();
    expect(pct).toBe(50);
  });
});
