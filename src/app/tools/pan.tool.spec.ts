import { describe, it, expect } from 'vitest';
import { PanTool } from './pan.tool';
import { ToolType } from '../models';

const EMPTY_LAYER = new Uint8ClampedArray(0);

function makeContext() {
  return {
    coord: { x: 0, y: 0 },
    layerIndex: 0,
    canvasWidth: 32,
    canvasHeight: 32,
    visualColumns: 32,
    primaryColor: { r: 0, g: 0, b: 0, a: 255 },
    secondaryColor: { r: 255, g: 255, b: 255, a: 255 },
    isSecondary: false,
    gridType: 'square' as const,
  };
}

describe('PanTool', () => {
  it('has the correct type', () => {
    expect(new PanTool().type).toBe(ToolType.Pan);
  });

  it('has an icon', () => {
    expect(new PanTool().icon).toBeTruthy();
  });

  it('has a label', () => {
    expect(new PanTool().label).toBeTruthy();
  });

  it('has a cursor', () => {
    expect(new PanTool().cursor).toBeTruthy();
  });

  it('returns null from onPointerDown (no pixel mutations)', () => {
    const tool = new PanTool();
    expect(tool.onPointerDown(makeContext(), EMPTY_LAYER)).toBeNull();
  });

  it('returns null from onPointerMove (no pixel mutations)', () => {
    const tool = new PanTool();
    expect(tool.onPointerMove(makeContext(), EMPTY_LAYER)).toBeNull();
  });

  it('returns null from onPointerUp (no pixel mutations)', () => {
    const tool = new PanTool();
    expect(tool.onPointerUp(makeContext(), EMPTY_LAYER)).toBeNull();
  });
});
