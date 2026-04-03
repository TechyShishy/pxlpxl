import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { AbsorbColorCommand } from './absorb-color.command';
import { LayerService } from '../services/layer.service';
import { ColorService } from '../services/color.service';
import { Color } from '../models';

function makeColor(r: number, g: number, b: number, a = 255): Color {
  return { r, g, b, a };
}

describe('AbsorbColorCommand', () => {
  let layerService: LayerService;
  let colorService: ColorService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    layerService = TestBed.inject(LayerService);
    colorService = TestBed.inject(ColorService);
  });

  function setup(pixelColors: Color[], palette: Color[]) {
    // Configure a 1×N canvas (pixelCount = N) using the real services
    layerService.initLayers(pixelColors.length, 1, pixelColors.length);
    // Paint pixels directly on the first layer
    const layer = layerService.layers()[0];
    pixelColors.forEach((c, i) => {
      layer.data[i * 4]     = c.r;
      layer.data[i * 4 + 1] = c.g;
      layer.data[i * 4 + 2] = c.b;
      layer.data[i * 4 + 3] = c.a;
    });
    colorService.setPalette(palette);
  }

  it('remaps pixels and removes the palette entry on execute()', () => {
    const red   = makeColor(255, 0, 0);
    const blue  = makeColor(0, 0, 255);
    const green = makeColor(0, 255, 0);
    setup([red, blue, red], [red, blue, green]);

    const cmd = new AbsorbColorCommand(
      layerService,
      colorService,
      0, // paletteIndex for red
      red,
      [
        { layerIndex: 0, byteOffset: 0,  targetColor: blue },
        { layerIndex: 0, byteOffset: 8,  targetColor: green },
      ],
    );

    cmd.execute();

    const data = layerService.layers()[0].data;
    // pixel 0 → blue
    expect(data[0]).toBe(0);
    expect(data[1]).toBe(0);
    expect(data[2]).toBe(255);
    expect(data[3]).toBe(255);
    // pixel 2 → green
    expect(data[8]).toBe(0);
    expect(data[9]).toBe(255);
    expect(data[10]).toBe(0);
    // palette no longer has red
    expect(colorService.palette()).not.toContainEqual(red);
    expect(colorService.palette()).toHaveLength(2);
  });

  it('restores pixels and re-inserts palette entry on undo()', () => {
    const red   = makeColor(255, 0, 0);
    const blue  = makeColor(0, 0, 255);
    setup([red, blue, red], [red, blue]);

    const cmd = new AbsorbColorCommand(
      layerService,
      colorService,
      0,
      red,
      [
        { layerIndex: 0, byteOffset: 0, targetColor: blue },
        { layerIndex: 0, byteOffset: 8, targetColor: blue },
      ],
    );

    cmd.execute();
    cmd.undo();

    const data = layerService.layers()[0].data;
    // pixel 0 → back to red
    expect(data[0]).toBe(255);
    expect(data[1]).toBe(0);
    expect(data[2]).toBe(0);
    // pixel 2 → back to red
    expect(data[8]).toBe(255);
    // palette has red re-inserted at index 0
    expect(colorService.palette()[0]).toEqual(red);
    expect(colorService.palette()).toHaveLength(2);
  });

  it('execute then undo is a full roundtrip, palette index preserved', () => {
    const red   = makeColor(255, 0, 0);
    const blue  = makeColor(0, 0, 255);
    const green = makeColor(0, 255, 0);
    // red is at index 1 (middle)
    setup([red, blue], [green, red, blue]);

    const cmd = new AbsorbColorCommand(
      layerService,
      colorService,
      1, // red at index 1
      red,
      [{ layerIndex: 0, byteOffset: 0, targetColor: blue }],
    );

    cmd.execute();
    expect(colorService.palette()).toHaveLength(2);
    expect(colorService.palette()[0]).toEqual(green);
    expect(colorService.palette()[1]).toEqual(blue);

    cmd.undo();
    expect(colorService.palette()).toHaveLength(3);
    expect(colorService.palette()[0]).toEqual(green);
    expect(colorService.palette()[1]).toEqual(red); // re-inserted at index 1
    expect(colorService.palette()[2]).toEqual(blue);
  });

  it('handles empty pixelAbsorptions gracefully (only removes palette entry)', () => {
    const red  = makeColor(255, 0, 0);
    const blue = makeColor(0, 0, 255);
    setup([], [red, blue]);

    const cmd = new AbsorbColorCommand(layerService, colorService, 0, red, []);
    cmd.execute();
    expect(colorService.palette()).toHaveLength(1);
    expect(colorService.palette()[0]).toEqual(blue);

    cmd.undo();
    expect(colorService.palette()).toHaveLength(2);
    expect(colorService.palette()[0]).toEqual(red);
  });
});
