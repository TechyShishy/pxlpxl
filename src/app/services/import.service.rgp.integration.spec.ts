import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { ImportService } from './import.service';
import { LayerService } from './layer.service';
import { CanvasStateService } from './canvas-state.service';
import { ColorService } from './color.service';
import { HistoryService } from './history.service';
import { RgpProject } from '../models';

/** Gzip-compress a string and return an ArrayBuffer */
async function compressToGzip(json: string): Promise<ArrayBuffer> {
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(new TextEncoder().encode(json));
  writer.close();

  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result.buffer;
}

describe('ImportService – RGP import (integration)', () => {
  let service: ImportService;
  let layerService: LayerService;
  let canvasState: CanvasStateService;
  let colorService: ColorService;
  let historyService: HistoryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ImportService);
    layerService = TestBed.inject(LayerService);
    canvasState = TestBed.inject(CanvasStateService);
    colorService = TestBed.inject(ColorService);
    historyService = TestBed.inject(HistoryService);
  });

  function makeMinimalRgpProject(overrides?: Partial<RgpProject>): RgpProject {
    return {
      id: 0,
      name: 'Test RGP',
      rows: [
        { id: 1, steps: [{ id: 1, count: 2, description: 'A' }] },
        { id: 2, steps: [{ id: 1, count: 2, description: 'B' }] },
      ],
      colorMapping: {
        'A': '#000000ff', // black
        'B': '#ffffffff', // white
      },
      ...overrides,
    };
  }

  it('should set the grid type to peyote', async () => {
    const project = makeMinimalRgpProject();
    const buffer = await compressToGzip(JSON.stringify(project));

    await service.importFromBuffer(buffer, 'project.rgp');

    expect(canvasState.gridType()).toBe('peyote');
  });

  it('should set canvas width to the peyote column-pair count (= bufferWidth)', async () => {
    // 1 step of count 2 per row → bufferWidth = 2, canvasWidth = 2 (column-pair count)
    const project = makeMinimalRgpProject();
    const buffer = await compressToGzip(JSON.stringify(project));

    await service.importFromBuffer(buffer, 'project.rgp');

    expect(canvasState.canvasWidth()).toBe(2);
  });

  it('should set canvas height to the number of rows', async () => {
    const project = makeMinimalRgpProject();
    const buffer = await compressToGzip(JSON.stringify(project));

    await service.importFromBuffer(buffer, 'project.rgp');

    expect(canvasState.canvasHeight()).toBe(2);
  });

  it('should create exactly one layer', async () => {
    const project = makeMinimalRgpProject();
    const buffer = await compressToGzip(JSON.stringify(project));

    await service.importFromBuffer(buffer, 'project.rgp');

    expect(layerService.layerCount()).toBe(1);
  });

  it('should write the correct pixel color for the first step', async () => {
    // bufferWidth=2, bufferHeight=2
    // Row 0: 2×A (black = #000000ff)
    const project = makeMinimalRgpProject();
    const buffer = await compressToGzip(JSON.stringify(project));

    await service.importFromBuffer(buffer, 'project.rgp');

    const bufferWidth = canvasState.bufferWidth();
    // Pixel at buffer (bx=0, by=0) should be black
    const offset = (0 * bufferWidth + 0) * 4;
    const layerData = layerService.getLayerData(0)!;
    expect(layerData[offset]).toBe(0);     // r
    expect(layerData[offset + 1]).toBe(0); // g
    expect(layerData[offset + 2]).toBe(0); // b
    expect(layerData[offset + 3]).toBe(255); // a (fully opaque black)
  });

  it('should write the correct pixel color for the second row', async () => {
    // Row 1: 2×B (white = #ffffffff)
    const project = makeMinimalRgpProject();
    const buffer = await compressToGzip(JSON.stringify(project));

    await service.importFromBuffer(buffer, 'project.rgp');

    const bufferWidth = canvasState.bufferWidth();
    // Pixel at buffer (bx=0, by=1) should be white
    const offset = (1 * bufferWidth + 0) * 4;
    const layerData = layerService.getLayerData(0)!;
    expect(layerData[offset]).toBe(255);     // r
    expect(layerData[offset + 1]).toBe(255); // g
    expect(layerData[offset + 2]).toBe(255); // b
    expect(layerData[offset + 3]).toBe(255); // a
  });

  it('should clear history on import', async () => {
    const project = makeMinimalRgpProject();
    const buffer = await compressToGzip(JSON.stringify(project));

    await service.importFromBuffer(buffer, 'project.rgp');

    expect(historyService.canUndo()).toBe(false);
    expect(historyService.canRedo()).toBe(false);
  });

  it('should populate palette from colorMapping', async () => {
    const project = makeMinimalRgpProject();
    const buffer = await compressToGzip(JSON.stringify(project));

    await service.importFromBuffer(buffer, 'project.rgp');

    const palette = colorService.palette();
    expect(palette.length).toBeGreaterThan(0);
  });

  it('should still import a .pxl gzip file after adding RGP support', async () => {
    // Regression: existing PXL import should still work via schema dispatch
    const { PXL_FORMAT_VERSION, uint8ArrayToBase64, BLACK } = await import('../models');
    const pxlData = new Uint8ClampedArray(2 * 2 * 4);
    const pxlFile = {
      version: PXL_FORMAT_VERSION,
      name: 'pxl project',
      width: 2,
      height: 2,
      gridType: 'square',
      palette: [BLACK],
      layers: [
        {
          id: 'l1',
          name: 'Layer 1',
          visible: true,
          opacity: 1,
          data: uint8ArrayToBase64(pxlData),
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const buffer = await compressToGzip(JSON.stringify(pxlFile));

    await service.importFromBuffer(buffer, 'project.pxl');

    expect(canvasState.gridType()).toBe('square');
    expect(canvasState.canvasWidth()).toBe(2);
  });

  it('should throw for a gzip file with an unknown schema', async () => {
    const unknownPayload = { whatever: true, notAKnownSchema: 'yes' };
    const buffer = await compressToGzip(JSON.stringify(unknownPayload));

    await expect(service.importFromBuffer(buffer, 'mystery.bin')).rejects.toThrow(
      'Unrecognised gzip file format',
    );
  });

  it('should reverse even rows (0-indexed) when importing so RGP right-to-left becomes left-to-right buffer order', async () => {
    // Row 0 (by=0, even): RGP encodes right-to-left, so step A is at the right (bx=1)
    // and step B is at the left (bx=0) after reversal.
    const project: RgpProject = {
      id: 0,
      name: 'Even row reversal test',
      rows: [
        { id: 1, steps: [
          { id: 1, count: 1, description: 'A' }, // rightmost bead
          { id: 2, count: 1, description: 'B' }, // leftmost bead (in RGP right-to-left order)
        ]},
      ],
      colorMapping: {
        'A': '#ff0000ff', // red
        'B': '#0000ffff', // blue
      },
    };
    const buffer = await compressToGzip(JSON.stringify(project));

    await service.importFromBuffer(buffer, 'project.rgp');

    const bufferWidth = canvasState.bufferWidth();
    const layerData = layerService.getLayerData(0)!;

    // After reversing, bx=0 should hold the last RGP step (B = blue)
    const offsetBx0 = (0 * bufferWidth + 0) * 4;
    expect(layerData[offsetBx0]).toBe(0);     // r
    expect(layerData[offsetBx0 + 2]).toBe(255); // b (blue)

    // bx=1 should hold the first RGP step (A = red)
    const offsetBx1 = (0 * bufferWidth + 1) * 4;
    expect(layerData[offsetBx1]).toBe(255);   // r (red)
    expect(layerData[offsetBx1 + 2]).toBe(0);  // b
  });

  it('should NOT reverse odd rows (1-indexed) — they are already left-to-right', async () => {
    // Row 1 (by=1, odd): no reversal, step A at bx=0 and step B at bx=1.
    const project: RgpProject = {
      id: 0,
      name: 'Odd row no-reversal test',
      rows: [
        { id: 1, steps: [{ id: 1, count: 2, description: 'X' }] }, // filler even row
        { id: 2, steps: [
          { id: 1, count: 1, description: 'A' }, // bx=0
          { id: 2, count: 1, description: 'B' }, // bx=1
        ]},
      ],
      colorMapping: {
        'X': '#00000000',
        'A': '#ff0000ff', // red
        'B': '#0000ffff', // blue
      },
    };
    const buffer = await compressToGzip(JSON.stringify(project));

    await service.importFromBuffer(buffer, 'project.rgp');

    const bufferWidth = canvasState.bufferWidth();
    const layerData = layerService.getLayerData(0)!;

    // Odd row, no reversal: bx=0 = A (red), bx=1 = B (blue)
    const offsetBx0 = (1 * bufferWidth + 0) * 4;
    expect(layerData[offsetBx0]).toBe(255);    // r (red)
    expect(layerData[offsetBx0 + 2]).toBe(0);  // b

    const offsetBx1 = (1 * bufferWidth + 1) * 4;
    expect(layerData[offsetBx1]).toBe(0);      // r
    expect(layerData[offsetBx1 + 2]).toBe(255); // b (blue)
  });

  it('should resolve a Delica DB code in colorMapping to the catalog hex color', async () => {
    // DB0001 → #424145 (fully opaque)
    const project: RgpProject = {
      id: 0,
      name: 'DB code test',
      rows: [
        { id: 1, steps: [{ id: 1, count: 1, description: 'A' }] },
      ],
      colorMapping: { A: 'DB0001' },
    };
    const buffer = await compressToGzip(JSON.stringify(project));

    await service.importFromBuffer(buffer, 'project.rgp');

    const bufferWidth = canvasState.bufferWidth();
    const offset = (0 * bufferWidth + 0) * 4;
    const layerData = layerService.getLayerData(0)!;
    expect(layerData[offset]).toBe(0x42);      // r
    expect(layerData[offset + 1]).toBe(0x41);  // g
    expect(layerData[offset + 2]).toBe(0x45);  // b
    expect(layerData[offset + 3]).toBe(255);   // a
  });
});
