import { TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import {
  ColorPickerDialogComponent,
  IRO_TOKEN,
} from './color-picker-dialog.component';
import { Color } from '../../models';

/** Callbacks registered via picker.on(), keyed by event name. Reset before each test. */
let capturedCallbacks: Map<string, (arg: { hexString: string }) => void>;

/** Minimal iro.js stub that captures event callbacks for inspection in tests. */
const mockIro = {
  ColorPicker: (_el: unknown, _opts: unknown) => ({
    color: { hexString: '#000000' },
    on: (event: string, cb: unknown) => {
      capturedCallbacks.set(event, cb as (arg: { hexString: string }) => void);
    },
  }),
} as never;

describe('ColorPickerDialogComponent', () => {
  const RED: Color = { r: 255, g: 0, b: 0, a: 255 };
  const SEMI: Color = { r: 0, g: 0, b: 255, a: 128 };

  beforeEach(() => {
    capturedCallbacks = new Map();
  });

  function setup(color: Color) {
    const closeSpy = vi.fn();
    TestBed.configureTestingModule({
      imports: [ColorPickerDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { color } },
        { provide: MatDialogRef, useValue: { close: closeSpy } },
        { provide: IRO_TOKEN, useValue: mockIro },
      ],
    });
    const fixture = TestBed.createComponent(ColorPickerDialogComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, closeSpy };
  }

  type Comp = {
    hexInput: () => string;
    hexValue: () => string;
    alphaValue: () => number;
    previewColor: () => Color;
    alphaPercent: () => number;
    dbCodeInput: () => string;
    dbCodeError: () => boolean;
    onHexInputChange: (v: string) => void;
    onAlphaChange: (v: number) => void;
    onDbCodeInputChange: (v: string) => void;
    onConfirm: () => void;
  };

  it('initializes hexInput from the provided color', () => {
    const { component } = setup(RED);
    expect((component as unknown as Comp).hexInput()).toBe('#ff0000');
  });

  it('initializes alphaValue from the provided color', () => {
    const { component } = setup(RED);
    expect((component as unknown as Comp).alphaValue()).toBe(255);
  });

  it('initializes alphaValue from a semi-transparent color', () => {
    const { component } = setup(SEMI);
    expect((component as unknown as Comp).alphaValue()).toBe(128);
  });

  it('onHexInputChange updates hexValue for a valid 6-digit hex', () => {
    const { component } = setup(RED);
    (component as unknown as Comp).onHexInputChange('#0000ff');
    expect((component as unknown as Comp).hexValue()).toBe('#0000ff');
  });

  it('onHexInputChange does not update hexValue for a partial/invalid hex', () => {
    const { component } = setup(RED);
    (component as unknown as Comp).onHexInputChange('#ff');
    expect((component as unknown as Comp).hexValue()).toBe('#ff0000');
  });

  it('onAlphaChange updates alphaValue', () => {
    const { component } = setup(RED);
    (component as unknown as Comp).onAlphaChange(100);
    expect((component as unknown as Comp).alphaValue()).toBe(100);
  });

  it('previewColor reflects hexValue and alphaValue', () => {
    const { component } = setup(RED);
    (component as unknown as Comp).onHexInputChange('#00ff00');
    (component as unknown as Comp).onAlphaChange(64);
    const c = (component as unknown as Comp).previewColor();
    expect(c.r).toBe(0);
    expect(c.g).toBe(255);
    expect(c.b).toBe(0);
    expect(c.a).toBe(64);
  });

  it('alphaPercent computes correctly for semi-transparent', () => {
    const { component } = setup(SEMI);
    // 128/255 * 100 ≈ 50
    expect((component as unknown as Comp).alphaPercent()).toBe(50);
  });

  it('onConfirm closes the dialog with the current previewColor', () => {
    const { component, closeSpy } = setup(RED);
    (component as unknown as Comp).onAlphaChange(200);
    (component as unknown as Comp).onConfirm();
    expect(closeSpy).toHaveBeenCalledWith({
      r: 255,
      g: 0,
      b: 0,
      a: 200,
    });
  });

  it('color:change event from the iro wheel updates hexValue and hexInput', async () => {
    const { component, fixture } = setup(RED);
    await fixture.whenStable();
    capturedCallbacks.get('color:change')?.({ hexString: '#0000ff' });
    expect((component as unknown as Comp).hexValue()).toBe('#0000ff');
    expect((component as unknown as Comp).hexInput()).toBe('#0000ff');
  });

  // ── DB code field ──────────────────────────────────────────────────────────

  it('initializes dbCodeInput to the catalog code when the initial color is in the catalog', () => {
    // DB0001 → #23242d
    const DB0001_COLOR: Color = { r: 0x23, g: 0x24, b: 0x2d, a: 255 };
    const { component } = setup(DB0001_COLOR);
    expect((component as unknown as Comp).dbCodeInput()).toBe('DB0001');
  });

  it('initializes dbCodeInput to empty when the initial color is not in the catalog', () => {
    const { component } = setup(RED);
    // RED (#ff0000) is not in the Delica catalog
    const code = (component as unknown as Comp).dbCodeInput();
    expect(code).toBe('');
    expect((component as unknown as Comp).dbCodeError()).toBe(false);
  });

  it('onDbCodeInputChange with a known code updates hexValue and clears dbCodeError', () => {
    const { component } = setup(RED);
    (component as unknown as Comp).onDbCodeInputChange('DB0001');
    expect((component as unknown as Comp).hexValue()).toBe('#23242d');
    expect((component as unknown as Comp).dbCodeError()).toBe(false);
  });

  it('onDbCodeInputChange is case-insensitive', () => {
    const { component } = setup(RED);
    (component as unknown as Comp).onDbCodeInputChange('db0001');
    expect((component as unknown as Comp).hexValue()).toBe('#23242d');
    expect((component as unknown as Comp).dbCodeError()).toBe(false);
  });

  it('onDbCodeInputChange with an unknown code sets dbCodeError and does not change hexValue', () => {
    const { component } = setup(RED);
    const hexBefore = (component as unknown as Comp).hexValue();
    (component as unknown as Comp).onDbCodeInputChange('DB9999');
    expect((component as unknown as Comp).dbCodeError()).toBe(true);
    expect((component as unknown as Comp).hexValue()).toBe(hexBefore);
  });

  it('onDbCodeInputChange with empty string clears dbCodeError without changing hexValue', () => {
    const { component } = setup(RED);
    (component as unknown as Comp).onDbCodeInputChange('DB9999');
    expect((component as unknown as Comp).dbCodeError()).toBe(true);
    (component as unknown as Comp).onDbCodeInputChange('');
    expect((component as unknown as Comp).dbCodeError()).toBe(false);
  });

  it('onHexInputChange with a catalog hex updates dbCodeInput', () => {
    const { component } = setup(RED);
    // DB0001 → #23242d
    (component as unknown as Comp).onHexInputChange('#23242d');
    expect((component as unknown as Comp).dbCodeInput()).toBe('DB0001');
  });

  it('color:change event with a catalog hex updates dbCodeInput', async () => {
    const { component, fixture } = setup(RED);
    await fixture.whenStable();
    // DB0001 → #23242d
    capturedCallbacks.get('color:change')?.({ hexString: '#23242d' });
    expect((component as unknown as Comp).dbCodeInput()).toBe('DB0001');
  });
});
