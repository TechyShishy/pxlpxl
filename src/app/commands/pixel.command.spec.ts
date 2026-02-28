import { TestBed } from '@angular/core/testing';
import { PixelCommand } from './pixel.command';
import { DrawCommand } from './draw.command';
import { FillCommand } from './fill.command';
import { LayerService } from '../services/layer.service';
import { Color, ModifiedPixel, BLACK, TRANSPARENT, colorsEqual } from '../models';

describe('PixelCommand', () => {
  let layerService: LayerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    layerService = TestBed.inject(LayerService);
    layerService.initLayers(4, 4);
  });

  function makePixel(x: number, y: number, oldColor: Color, newColor: Color): ModifiedPixel {
    return { coord: { x, y }, oldColor, newColor };
  }

  it('DrawCommand should be an instance of PixelCommand', () => {
    const cmd = new DrawCommand(layerService, 0, 4, []);
    expect(cmd).toBeInstanceOf(PixelCommand);
  });

  it('FillCommand should be an instance of PixelCommand', () => {
    const cmd = new FillCommand(layerService, 0, 4, []);
    expect(cmd).toBeInstanceOf(PixelCommand);
  });

  it('execute should apply pixels via inherited base class', () => {
    const pixels = [makePixel(0, 0, TRANSPARENT, BLACK)];
    const cmd = new DrawCommand(layerService, 0, 4, pixels);
    cmd.execute();
    expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), BLACK)).toBe(true);
  });

  it('undo should restore pixels via inherited base class', () => {
    const pixels = [makePixel(0, 0, TRANSPARENT, BLACK)];
    const cmd = new DrawCommand(layerService, 0, 4, pixels);
    cmd.execute();
    cmd.undo();
    expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), TRANSPARENT)).toBe(true);
  });

  it('FillCommand execute should apply pixels via inherited base class', () => {
    const pixels = [makePixel(1, 1, TRANSPARENT, BLACK)];
    const cmd = new FillCommand(layerService, 0, 4, pixels);
    cmd.execute();
    expect(colorsEqual(layerService.getPixel(0, 1, 1, 4), BLACK)).toBe(true);
  });
});
