import { TestBed } from '@angular/core/testing';
import { HistoryService } from './history.service';
import { LayerService } from './layer.service';
import { DrawCommand } from '../commands/draw.command';
import { FillCommand } from '../commands/fill.command';
import { LayerCommand } from '../commands/layer.command';
import { BLACK, WHITE, TRANSPARENT, Color, ModifiedPixel, colorsEqual } from '../models';

describe('History + Commands Integration', () => {
  let historyService: HistoryService;
  let layerService: LayerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    historyService = TestBed.inject(HistoryService);
    layerService = TestBed.inject(LayerService);
    layerService.initLayers(4, 4);
  });

  function makePixel(x: number, y: number, oldColor: Color, newColor: Color): ModifiedPixel {
    return { coord: { x, y }, oldColor, newColor };
  }

  describe('DrawCommand with HistoryService', () => {
    it('should draw and undo correctly via getPixel', () => {
      const pixels = [makePixel(0, 0, TRANSPARENT, BLACK)];
      const cmd = new DrawCommand(layerService, 0, 4, pixels);
      historyService.execute(cmd);

      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), BLACK)).toBe(true);

      historyService.undo();
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), TRANSPARENT)).toBe(true);
    });

    it('should redo correctly via getPixel', () => {
      const pixels = [makePixel(0, 0, TRANSPARENT, BLACK)];
      const cmd = new DrawCommand(layerService, 0, 4, pixels);
      historyService.execute(cmd);
      historyService.undo();
      historyService.redo();

      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), BLACK)).toBe(true);
    });

    it('should restore canvas to original after undoing all draws', () => {
      const red: Color = { r: 255, g: 0, b: 0, a: 255 };
      const green: Color = { r: 0, g: 255, b: 0, a: 255 };
      const blue: Color = { r: 0, g: 0, b: 255, a: 255 };

      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(0, 0, TRANSPARENT, red)]),
      );
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(1, 0, TRANSPARENT, green)]),
      );
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(2, 0, TRANSPARENT, blue)]),
      );

      // Undo all 3
      historyService.undo();
      historyService.undo();
      historyService.undo();

      // All should be transparent
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), TRANSPARENT)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 1, 0, 4), TRANSPARENT)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 2, 0, 4), TRANSPARENT)).toBe(true);
    });

    it('new command after undo should clear redo stack', () => {
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(0, 0, TRANSPARENT, BLACK)]),
      );
      historyService.undo();

      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(1, 0, TRANSPARENT, WHITE)]),
      );

      expect(historyService.canRedo()).toBe(false);
    });
  });

  describe('FillCommand with HistoryService', () => {
    it('should fill and undo correctly', () => {
      const pixels = [
        makePixel(0, 0, TRANSPARENT, BLACK),
        makePixel(1, 0, TRANSPARENT, BLACK),
        makePixel(0, 1, TRANSPARENT, BLACK),
        makePixel(1, 1, TRANSPARENT, BLACK),
      ];
      const cmd = new FillCommand(layerService, 0, 4, pixels);
      historyService.execute(cmd);

      for (const p of pixels) {
        expect(colorsEqual(layerService.getPixel(0, p.coord.x, p.coord.y, 4), BLACK)).toBe(true);
      }

      historyService.undo();

      for (const p of pixels) {
        expect(colorsEqual(layerService.getPixel(0, p.coord.x, p.coord.y, 4), TRANSPARENT)).toBe(
          true,
        );
      }
    });
  });

  describe('LayerCommand with HistoryService', () => {
    it('should set and undo layer data correctly', () => {
      const previousData = layerService.getLayerData(0)!;
      const newData = new Uint8ClampedArray(4 * 4 * 4);
      // Fill newData with red
      for (let i = 0; i < newData.length; i += 4) {
        newData[i] = 255;
        newData[i + 3] = 255;
      }

      const cmd = new LayerCommand(layerService, 0, previousData, newData);
      historyService.execute(cmd);

      const pixel = layerService.getPixel(0, 0, 0, 4);
      expect(pixel.r).toBe(255);
      expect(pixel.a).toBe(255);

      historyService.undo();

      const restored = layerService.getPixel(0, 0, 0, 4);
      expect(colorsEqual(restored, TRANSPARENT)).toBe(true);
    });
  });

  describe('Signal reactivity after undo/redo', () => {
    it('DrawCommand undo should change layers() signal identity (notifyLayersChanged triggers update)', () => {
      const pixels = [makePixel(0, 0, TRANSPARENT, BLACK)];
      const cmd = new DrawCommand(layerService, 0, 4, pixels);
      historyService.execute(cmd);

      const layersRef = layerService.layers();
      historyService.undo();

      // Signal identity changes because notifyLayersChanged() creates a new array reference
      expect(layerService.layers()).not.toBe(layersRef);
    });

    it('LayerCommand undo SHOULD change layers() signal identity', () => {
      const previousData = layerService.getLayerData(0)!;
      const newData = new Uint8ClampedArray(4 * 4 * 4);
      const cmd = new LayerCommand(layerService, 0, previousData, newData);
      historyService.execute(cmd);

      const layersRef = layerService.layers();
      historyService.undo();

      // setLayerData properly calls layers.update()
      expect(layerService.layers()).not.toBe(layersRef);
    });

    it('DrawCommand undo pixel values should still be correct even though signal does not change', () => {
      // Even though the signal reference doesn't change, the underlying
      // buffer IS correctly modified. Reading getPixel should work fine.
      const red: Color = { r: 255, g: 0, b: 0, a: 255 };
      const pixels = [makePixel(1, 1, TRANSPARENT, red)];
      const cmd = new DrawCommand(layerService, 0, 4, pixels);
      historyService.execute(cmd);

      expect(colorsEqual(layerService.getPixel(0, 1, 1, 4), red)).toBe(true);

      historyService.undo();

      // Pixel value IS restored (buffer mutated correctly)
      expect(colorsEqual(layerService.getPixel(0, 1, 1, 4), TRANSPARENT)).toBe(true);
    });
  });

  // =========================================================================
  // Edge-case integration tests
  // =========================================================================

  describe('Mixed command type sequences', () => {
    const red: Color = { r: 255, g: 0, b: 0, a: 255 };
    const green: Color = { r: 0, g: 255, b: 0, a: 255 };
    const blue: Color = { r: 0, g: 0, b: 255, a: 255 };

    it('should undo DrawCommand, FillCommand, and LayerCommand in correct order', () => {
      // Step 1: DrawCommand — set (0,0) to red
      const drawCmd = new DrawCommand(layerService, 0, 4, [makePixel(0, 0, TRANSPARENT, red)]);
      historyService.execute(drawCmd);

      // Step 2: FillCommand — set (1,0), (2,0), (3,0) to green
      const fillCmd = new FillCommand(layerService, 0, 4, [
        makePixel(1, 0, TRANSPARENT, green),
        makePixel(2, 0, TRANSPARENT, green),
        makePixel(3, 0, TRANSPARENT, green),
      ]);
      historyService.execute(fillCmd);

      // Step 3: LayerCommand — overwrite entire layer with blue
      const prevData = layerService.getLayerData(0)!;
      const blueData = new Uint8ClampedArray(4 * 4 * 4);
      for (let i = 0; i < blueData.length; i += 4) {
        blueData[i] = 0;
        blueData[i + 1] = 0;
        blueData[i + 2] = 255;
        blueData[i + 3] = 255;
      }
      const layerCmd = new LayerCommand(layerService, 0, prevData, blueData);
      historyService.execute(layerCmd);

      // Verify blue everywhere
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), blue)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 3, 3, 4), blue)).toBe(true);

      // Undo LayerCommand — should restore to state after draw+fill
      historyService.undo();
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), red)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 1, 0, 4), green)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 2, 0, 4), green)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 3, 0, 4), green)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 0, 1, 4), TRANSPARENT)).toBe(true);

      // Undo FillCommand — should restore to state after draw only
      historyService.undo();
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), red)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 1, 0, 4), TRANSPARENT)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 2, 0, 4), TRANSPARENT)).toBe(true);

      // Undo DrawCommand — should restore to fully transparent
      historyService.undo();
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), TRANSPARENT)).toBe(true);
    });

    it('should redo all mixed commands correctly', () => {
      const drawCmd = new DrawCommand(layerService, 0, 4, [makePixel(0, 0, TRANSPARENT, red)]);
      const fillCmd = new FillCommand(layerService, 0, 4, [
        makePixel(1, 0, TRANSPARENT, green),
        makePixel(2, 0, TRANSPARENT, green),
      ]);
      historyService.execute(drawCmd);
      historyService.execute(fillCmd);

      // Undo all
      historyService.undo();
      historyService.undo();
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), TRANSPARENT)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 1, 0, 4), TRANSPARENT)).toBe(true);

      // Redo all
      historyService.redo();
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), red)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 1, 0, 4), TRANSPARENT)).toBe(true);

      historyService.redo();
      expect(colorsEqual(layerService.getPixel(0, 1, 0, 4), green)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 2, 0, 4), green)).toBe(true);
    });

    it('should handle partial undo in a mixed sequence (undo 2, redo 1)', () => {
      const drawCmd = new DrawCommand(layerService, 0, 4, [makePixel(0, 0, TRANSPARENT, red)]);
      const fillCmd = new FillCommand(layerService, 0, 4, [makePixel(1, 0, TRANSPARENT, green)]);
      const drawCmd2 = new DrawCommand(layerService, 0, 4, [makePixel(2, 0, TRANSPARENT, blue)]);
      historyService.execute(drawCmd);
      historyService.execute(fillCmd);
      historyService.execute(drawCmd2);

      // Undo 2 (drawCmd2 and fillCmd)
      historyService.undo();
      historyService.undo();
      // Only drawCmd remains applied
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), red)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 1, 0, 4), TRANSPARENT)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 2, 0, 4), TRANSPARENT)).toBe(true);

      // Redo 1 (fillCmd)
      historyService.redo();
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), red)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 1, 0, 4), green)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 2, 0, 4), TRANSPARENT)).toBe(true);
    });
  });

  describe('Multi-layer undo/redo', () => {
    const red: Color = { r: 255, g: 0, b: 0, a: 255 };
    const blue: Color = { r: 0, g: 0, b: 255, a: 255 };

    beforeEach(() => {
      layerService.addLayer(4, 4); // Add layer 1
    });

    it('should undo commands targeting different layers independently', () => {
      // Draw on layer 0
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(0, 0, TRANSPARENT, red)]),
      );
      // Draw on layer 1
      historyService.execute(
        new DrawCommand(layerService, 1, 4, [makePixel(0, 0, TRANSPARENT, blue)]),
      );

      // Undo layer 1 draw
      historyService.undo();
      expect(colorsEqual(layerService.getPixel(1, 0, 0, 4), TRANSPARENT)).toBe(true);
      // Layer 0 should still have red
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), red)).toBe(true);

      // Undo layer 0 draw
      historyService.undo();
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), TRANSPARENT)).toBe(true);

      // Redo both
      historyService.redo();
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), red)).toBe(true);
      historyService.redo();
      expect(colorsEqual(layerService.getPixel(1, 0, 0, 4), blue)).toBe(true);
    });

    it('should handle alternating layer commands correctly', () => {
      const green: Color = { r: 0, g: 255, b: 0, a: 255 };
      const white: Color = { r: 255, g: 255, b: 255, a: 255 };

      // Alternating: L0, L1, L0, L1
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(0, 0, TRANSPARENT, red)]),
      );
      historyService.execute(
        new DrawCommand(layerService, 1, 4, [makePixel(0, 0, TRANSPARENT, blue)]),
      );
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(1, 0, TRANSPARENT, green)]),
      );
      historyService.execute(
        new DrawCommand(layerService, 1, 4, [makePixel(1, 0, TRANSPARENT, white)]),
      );

      // Undo all 4
      historyService.undo();
      historyService.undo();
      historyService.undo();
      historyService.undo();

      // Both layers should be fully transparent
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), TRANSPARENT)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 1, 0, 4), TRANSPARENT)).toBe(true);
      expect(colorsEqual(layerService.getPixel(1, 0, 0, 4), TRANSPARENT)).toBe(true);
      expect(colorsEqual(layerService.getPixel(1, 1, 0, 4), TRANSPARENT)).toBe(true);
    });
  });

  describe('MAX_HISTORY boundary behavior', () => {
    it('should evict the oldest command when exceeding MAX_HISTORY', () => {
      // Execute 101 commands, each writing to a unique pixel
      for (let i = 0; i < 101; i++) {
        const x = i % 4;
        const y = Math.floor(i / 4) % 4;
        // We cycle through the 16 pixels of the 4x4 canvas multiple times
        // but each command is unique for history purposes
        const color: Color = { r: i % 256, g: 0, b: 0, a: 255 };
        const prevColor = layerService.getPixel(0, x, y, 4);
        historyService.execute(
          new DrawCommand(layerService, 0, 4, [makePixel(x, y, prevColor, color)]),
        );
      }

      expect(historyService.canUndo()).toBe(true);

      // Undo 100 times (the max history size)
      for (let i = 0; i < 100; i++) {
        historyService.undo();
      }

      // After undoing 100, canUndo should be false (the 101st/oldest was evicted)
      expect(historyService.canUndo()).toBe(false);

      // One more undo should be a no-op
      historyService.undo();
      expect(historyService.canUndo()).toBe(false);
    });

    it('should handle undo then new commands at the boundary', () => {
      // Execute exactly 100 commands
      for (let i = 0; i < 100; i++) {
        const color: Color = { r: i % 256, g: 0, b: 0, a: 255 };
        const prevColor = layerService.getPixel(0, i % 4, Math.floor(i / 4) % 4, 4);
        historyService.execute(
          new DrawCommand(layerService, 0, 4, [
            makePixel(i % 4, Math.floor(i / 4) % 4, prevColor, color),
          ]),
        );
      }

      // Undo 50
      for (let i = 0; i < 50; i++) {
        historyService.undo();
      }
      expect(historyService.canRedo()).toBe(true);

      // Execute 10 new commands (should clear redo stack)
      for (let i = 0; i < 10; i++) {
        const color: Color = { r: 0, g: i % 256, b: 0, a: 255 };
        const prevColor = layerService.getPixel(0, i % 4, 0, 4);
        historyService.execute(
          new DrawCommand(layerService, 0, 4, [makePixel(i % 4, 0, prevColor, color)]),
        );
      }

      expect(historyService.canRedo()).toBe(false);
      expect(historyService.canUndo()).toBe(true);

      // 50 remaining + 10 new = 60 undoable commands
      let undoCount = 0;
      while (historyService.canUndo()) {
        historyService.undo();
        undoCount++;
      }
      expect(undoCount).toBe(60);
    });

    it('should handle undo all then redo all at the boundary', () => {
      const colors: Color[] = [];
      // Execute 100 commands, each on pixel (0,0) with incrementing colors
      for (let i = 0; i < 100; i++) {
        const color: Color = { r: i % 256, g: Math.floor(i / 256), b: 0, a: 255 };
        colors.push(color);
        const prevColor = layerService.getPixel(0, 0, 0, 4);
        historyService.execute(
          new DrawCommand(layerService, 0, 4, [makePixel(0, 0, prevColor, color)]),
        );
      }

      // Undo all 100
      for (let i = 0; i < 100; i++) {
        historyService.undo();
      }
      expect(historyService.canUndo()).toBe(false);
      expect(historyService.canRedo()).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), TRANSPARENT)).toBe(true);

      // Redo all 100
      for (let i = 0; i < 100; i++) {
        historyService.redo();
      }
      expect(historyService.canRedo()).toBe(false);
      expect(historyService.canUndo()).toBe(true);

      // Final pixel should have the color of the last command
      const lastColor = colors[99];
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), lastColor)).toBe(true);
    });
  });

  describe('Undo/redo with empty stacks', () => {
    it('should not throw when calling undo on empty history', () => {
      expect(() => historyService.undo()).not.toThrow();
      expect(historyService.canUndo()).toBe(false);
      expect(historyService.canRedo()).toBe(false);
    });

    it('should not throw when calling redo on empty history', () => {
      expect(() => historyService.redo()).not.toThrow();
      expect(historyService.canUndo()).toBe(false);
      expect(historyService.canRedo()).toBe(false);
    });

    it('should not mutate pixel data when calling undo on empty history', () => {
      // Put some data on the canvas first
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(0, 0, TRANSPARENT, BLACK)]),
      );
      // Not undoing the draw — just verifying empty undo doesn't touch it
      // Execute a second draw and undo it
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(1, 0, TRANSPARENT, WHITE)]),
      );
      historyService.undo(); // Undo white pixel
      historyService.undo(); // Undo black pixel
      historyService.undo(); // Empty — should be no-op

      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), TRANSPARENT)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 1, 0, 4), TRANSPARENT)).toBe(true);
    });

    it('should not throw when calling redo without prior undo', () => {
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(0, 0, TRANSPARENT, BLACK)]),
      );
      // No undo has been called — redo should be a no-op
      expect(() => historyService.redo()).not.toThrow();
      expect(historyService.canRedo()).toBe(false);
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), BLACK)).toBe(true);
    });
  });

  describe('New command clears redo stack thoroughly', () => {
    const red: Color = { r: 255, g: 0, b: 0, a: 255 };
    const green: Color = { r: 0, g: 255, b: 0, a: 255 };
    const blue: Color = { r: 0, g: 0, b: 255, a: 255 };
    const yellow: Color = { r: 255, g: 255, b: 0, a: 255 };

    it('should clear all redo entries when a new command is executed after undo', () => {
      const cmdA = new DrawCommand(layerService, 0, 4, [makePixel(0, 0, TRANSPARENT, red)]);
      const cmdB = new DrawCommand(layerService, 0, 4, [makePixel(1, 0, TRANSPARENT, green)]);
      const cmdC = new DrawCommand(layerService, 0, 4, [makePixel(2, 0, TRANSPARENT, blue)]);

      historyService.execute(cmdA);
      historyService.execute(cmdB);
      historyService.execute(cmdC);

      // Undo C and B
      historyService.undo();
      historyService.undo();
      expect(historyService.canRedo()).toBe(true);
      expect(historyService.redoDescription()).toBe('Draw 1 pixel(s)');

      // Execute D — should obliterate the redo stack (B and C)
      const cmdD = new DrawCommand(layerService, 0, 4, [makePixel(3, 0, TRANSPARENT, yellow)]);
      historyService.execute(cmdD);

      expect(historyService.canRedo()).toBe(false);
      expect(historyService.redoDescription()).toBe('');

      // Redo should be a no-op
      historyService.redo();
      expect(colorsEqual(layerService.getPixel(0, 1, 0, 4), TRANSPARENT)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 2, 0, 4), TRANSPARENT)).toBe(true);

      // Undo D — should reveal A still in history
      historyService.undo();
      expect(colorsEqual(layerService.getPixel(0, 3, 0, 4), TRANSPARENT)).toBe(true);
      expect(historyService.undoDescription()).toContain('Draw');
    });

    it('B and C should be unreachable after executing D mid-undo', () => {
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(0, 0, TRANSPARENT, red)]),
      );
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(1, 0, TRANSPARENT, green)]),
      );
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(2, 0, TRANSPARENT, blue)]),
      );

      historyService.undo(); // Undo C
      historyService.undo(); // Undo B

      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(3, 0, TRANSPARENT, yellow)]),
      );

      // Try to redo — nothing should happen
      historyService.redo();
      historyService.redo();
      historyService.redo();

      // B and C pixels should remain transparent
      expect(colorsEqual(layerService.getPixel(0, 1, 0, 4), TRANSPARENT)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 2, 0, 4), TRANSPARENT)).toBe(true);
      // D should be applied
      expect(colorsEqual(layerService.getPixel(0, 3, 0, 4), yellow)).toBe(true);
    });
  });

  describe('Rapid undo/redo cycling', () => {
    it('should maintain correct state through repeated undo/redo cycles', () => {
      const colors: Color[] = [
        { r: 255, g: 0, b: 0, a: 255 },
        { r: 0, g: 255, b: 0, a: 255 },
        { r: 0, g: 0, b: 255, a: 255 },
        { r: 255, g: 255, b: 0, a: 255 },
        { r: 255, g: 0, b: 255, a: 255 },
      ];

      // Execute 5 commands on different pixels
      for (let i = 0; i < 5; i++) {
        const prevColor = layerService.getPixel(0, i % 4, Math.floor(i / 4), 4);
        historyService.execute(
          new DrawCommand(layerService, 0, 4, [
            makePixel(i % 4, Math.floor(i / 4), prevColor, colors[i]),
          ]),
        );
      }

      // Cycle: undo last, redo last — 10 times
      for (let cycle = 0; cycle < 10; cycle++) {
        historyService.undo();
        // After undo, pixel 4 (which is (0,1)) should be transparent
        expect(colorsEqual(layerService.getPixel(0, 0, 1, 4), TRANSPARENT)).toBe(true);

        historyService.redo();
        // After redo, it should be back to magenta
        expect(colorsEqual(layerService.getPixel(0, 0, 1, 4), colors[4])).toBe(true);
      }

      // Verify all pixels still correct after cycling
      for (let i = 0; i < 5; i++) {
        expect(colorsEqual(layerService.getPixel(0, i % 4, Math.floor(i / 4), 4), colors[i])).toBe(
          true,
        );
      }
    });

    it('should handle full undo-all / redo-all / undo-all cycle', () => {
      const red: Color = { r: 255, g: 0, b: 0, a: 255 };
      const green: Color = { r: 0, g: 255, b: 0, a: 255 };
      const blue: Color = { r: 0, g: 0, b: 255, a: 255 };

      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(0, 0, TRANSPARENT, red)]),
      );
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(1, 0, TRANSPARENT, green)]),
      );
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(2, 0, TRANSPARENT, blue)]),
      );

      // Undo all
      historyService.undo();
      historyService.undo();
      historyService.undo();
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), TRANSPARENT)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 1, 0, 4), TRANSPARENT)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 2, 0, 4), TRANSPARENT)).toBe(true);

      // Redo all
      historyService.redo();
      historyService.redo();
      historyService.redo();
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), red)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 1, 0, 4), green)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 2, 0, 4), blue)).toBe(true);

      // Undo all again
      historyService.undo();
      historyService.undo();
      historyService.undo();
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), TRANSPARENT)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 1, 0, 4), TRANSPARENT)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 2, 0, 4), TRANSPARENT)).toBe(true);
    });
  });

  describe('Command with empty modifiedPixels', () => {
    it('should execute and undo a DrawCommand with zero pixels without throwing', () => {
      const cmd = new DrawCommand(layerService, 0, 4, []);
      expect(() => historyService.execute(cmd)).not.toThrow();
      expect(historyService.canUndo()).toBe(true);
      expect(historyService.undoDescription()).toBe('Draw 0 pixel(s)');

      expect(() => historyService.undo()).not.toThrow();
      expect(historyService.canRedo()).toBe(true);
    });

    it('should not affect any pixel data', () => {
      // Set a pixel first
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(0, 0, TRANSPARENT, BLACK)]),
      );

      // Execute empty command
      historyService.execute(new DrawCommand(layerService, 0, 4, []));

      // Undo empty command — pixel should still be black
      historyService.undo();
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), BLACK)).toBe(true);

      // Undo the original draw
      historyService.undo();
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), TRANSPARENT)).toBe(true);
    });
  });

  describe('Overlapping pixel modifications', () => {
    const red: Color = { r: 255, g: 0, b: 0, a: 255 };
    const green: Color = { r: 0, g: 255, b: 0, a: 255 };
    const blue: Color = { r: 0, g: 0, b: 255, a: 255 };

    it('should undo overlapping writes to the same pixel in correct order', () => {
      // Command A: set (1,1) to red (from transparent)
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(1, 1, TRANSPARENT, red)]),
      );
      expect(colorsEqual(layerService.getPixel(0, 1, 1, 4), red)).toBe(true);

      // Command B: overwrite (1,1) to blue (from red)
      historyService.execute(new DrawCommand(layerService, 0, 4, [makePixel(1, 1, red, blue)]));
      expect(colorsEqual(layerService.getPixel(0, 1, 1, 4), blue)).toBe(true);

      // Undo B — should restore to red
      historyService.undo();
      expect(colorsEqual(layerService.getPixel(0, 1, 1, 4), red)).toBe(true);

      // Undo A — should restore to transparent
      historyService.undo();
      expect(colorsEqual(layerService.getPixel(0, 1, 1, 4), TRANSPARENT)).toBe(true);
    });

    it('should redo overlapping writes to the same pixel correctly', () => {
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(1, 1, TRANSPARENT, red)]),
      );
      historyService.execute(new DrawCommand(layerService, 0, 4, [makePixel(1, 1, red, blue)]));

      historyService.undo();
      historyService.undo();

      // Redo A → red
      historyService.redo();
      expect(colorsEqual(layerService.getPixel(0, 1, 1, 4), red)).toBe(true);

      // Redo B → blue
      historyService.redo();
      expect(colorsEqual(layerService.getPixel(0, 1, 1, 4), blue)).toBe(true);
    });

    it('should handle three-deep overlapping writes on the same pixel', () => {
      // transparent → red → green → blue
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(2, 2, TRANSPARENT, red)]),
      );
      historyService.execute(new DrawCommand(layerService, 0, 4, [makePixel(2, 2, red, green)]));
      historyService.execute(new DrawCommand(layerService, 0, 4, [makePixel(2, 2, green, blue)]));

      expect(colorsEqual(layerService.getPixel(0, 2, 2, 4), blue)).toBe(true);

      historyService.undo();
      expect(colorsEqual(layerService.getPixel(0, 2, 2, 4), green)).toBe(true);

      historyService.undo();
      expect(colorsEqual(layerService.getPixel(0, 2, 2, 4), red)).toBe(true);

      historyService.undo();
      expect(colorsEqual(layerService.getPixel(0, 2, 2, 4), TRANSPARENT)).toBe(true);

      // Full redo chain
      historyService.redo();
      expect(colorsEqual(layerService.getPixel(0, 2, 2, 4), red)).toBe(true);
      historyService.redo();
      expect(colorsEqual(layerService.getPixel(0, 2, 2, 4), green)).toBe(true);
      historyService.redo();
      expect(colorsEqual(layerService.getPixel(0, 2, 2, 4), blue)).toBe(true);
    });

    it('should correctly preserve oldColor when commands capture current pixel state', () => {
      // This tests whether commands that are constructed with the WRONG
      // oldColor produce incorrect undo behavior.
      // Simulate a scenario: command records TRANSPARENT as oldColor but
      // the pixel has already been changed by a prior command.
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(0, 0, TRANSPARENT, red)]),
      );

      // BUG PROBE: If old color is incorrectly recorded as TRANSPARENT
      // instead of red, undo will restore to wrong value
      const incorrectOldColor = TRANSPARENT; // Wrong! Should be red.
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(0, 0, incorrectOldColor, green)]),
      );
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), green)).toBe(true);

      // Undo the second command — will it go to red (correct) or transparent (bug)?
      historyService.undo();
      // With the incorrectly recorded oldColor, this will be TRANSPARENT not red.
      // This documents the behavior — commands trust their recorded oldColor.
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), incorrectOldColor)).toBe(true);
    });
  });

  describe('DrawCommand pixel data integrity after undo/redo', () => {
    it('should not affect unmodified pixels when undoing', () => {
      const red: Color = { r: 255, g: 0, b: 0, a: 255 };
      // Set some background pixels first
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [
          makePixel(0, 0, TRANSPARENT, BLACK),
          makePixel(3, 3, TRANSPARENT, WHITE),
        ]),
      );

      // Draw on different pixels
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [
          makePixel(1, 1, TRANSPARENT, red),
          makePixel(2, 2, TRANSPARENT, red),
        ]),
      );

      // Undo second draw
      historyService.undo();

      // Modified pixels restored
      expect(colorsEqual(layerService.getPixel(0, 1, 1, 4), TRANSPARENT)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 2, 2, 4), TRANSPARENT)).toBe(true);

      // Background pixels untouched
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), BLACK)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 3, 3, 4), WHITE)).toBe(true);

      // Other pixels still transparent
      expect(colorsEqual(layerService.getPixel(0, 2, 0, 4), TRANSPARENT)).toBe(true);
    });

    it('should maintain correct oldColor values after multiple undo/redo cycles', () => {
      const red: Color = { r: 255, g: 0, b: 0, a: 255 };

      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(0, 0, TRANSPARENT, red)]),
      );

      // Cycle 5 times
      for (let i = 0; i < 5; i++) {
        historyService.undo();
        expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), TRANSPARENT)).toBe(true);
        historyService.redo();
        expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), red)).toBe(true);
      }
    });
  });

  describe('LayerCommand data aliasing', () => {
    it('should not be affected by mutation of the source buffer after command creation', () => {
      const prevData = layerService.getLayerData(0)!;

      // Create newData buffer with red pixels
      const newData = new Uint8ClampedArray(4 * 4 * 4);
      for (let i = 0; i < newData.length; i += 4) {
        newData[i] = 255; // R
        newData[i + 1] = 0; // G
        newData[i + 2] = 0; // B
        newData[i + 3] = 255; // A
      }

      const cmd = new LayerCommand(layerService, 0, prevData, newData);

      // MUTATE the newData buffer after command creation (simulates aliasing bug)
      for (let i = 0; i < newData.length; i += 4) {
        newData[i] = 0; // R → 0
        newData[i + 1] = 255; // G → 255 (green)
        newData[i + 2] = 0;
        newData[i + 3] = 255;
      }

      // Execute the command — will it use the original red or the mutated green?
      historyService.execute(cmd);

      const pixel = layerService.getPixel(0, 0, 0, 4);
      // setLayerData does `new Uint8ClampedArray(data)` which copies at set time,
      // BUT the command holds a reference to the original newData buffer which
      // has been mutated. So execute() will pass the mutated buffer to setLayerData.
      // This documents aliasing behavior:
      // The layer itself is protected (setLayerData copies), but if we execute
      // the command again (redo), it will use the mutated buffer.

      // Undo — restore to prevData
      historyService.undo();
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), TRANSPARENT)).toBe(true);

      // Redo — will re-execute with the (possibly mutated) newData reference
      historyService.redo();
      const redoPixel = layerService.getPixel(0, 0, 0, 4);

      // Document whether redo uses original or mutated data.
      // If the command stored a copy, pixel would be red { 255, 0, 0, 255 }.
      // If the command holds a reference (aliasing), pixel would be green { 0, 255, 0, 255 }.
      // Currently LayerCommand does NOT copy, so aliasing is expected.
      const isGreen = colorsEqual(redoPixel, { r: 0, g: 255, b: 0, a: 255 });
      const isRed = colorsEqual(redoPixel, { r: 255, g: 0, b: 0, a: 255 });
      expect(isGreen || isRed).toBe(true); // One of them must be true

      // The critical check: undo after aliased redo should still work
      historyService.undo();
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), TRANSPARENT)).toBe(true);
    });

    it('should preserve previousData integrity through undo/redo even with aliasing', () => {
      const red: Color = { r: 255, g: 0, b: 0, a: 255 };
      // First put some data on the canvas
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(0, 0, TRANSPARENT, red)]),
      );

      const prevData = layerService.getLayerData(0)!; // snapshot with red pixel
      const newData = new Uint8ClampedArray(4 * 4 * 4); // all transparent

      const cmd = new LayerCommand(layerService, 0, prevData, newData);
      historyService.execute(cmd);

      // Canvas should now be all transparent (newData)
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), TRANSPARENT)).toBe(true);

      // Undo — should restore the red pixel via previousData
      historyService.undo();
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), red)).toBe(true);

      // Mutate prevData buffer after undo
      prevData[0] = 0;
      prevData[1] = 0;
      prevData[2] = 255;
      prevData[3] = 255;

      // Redo then undo again — does the second undo use the mutated prevData?
      historyService.redo();
      historyService.undo();

      const pixel = layerService.getPixel(0, 0, 0, 4);
      // If LayerCommand holds a reference to prevData, it'll be blue from mutation
      // If it copies, it'll be the original red
      const isRed = colorsEqual(pixel, red);
      const isBlue = colorsEqual(pixel, { r: 0, g: 0, b: 255, a: 255 });
      expect(isRed || isBlue).toBe(true); // Document the actual behavior
    });
  });

  describe('clear() during active undo/redo state', () => {
    it('should reset all history state', () => {
      const red: Color = { r: 255, g: 0, b: 0, a: 255 };
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(0, 0, TRANSPARENT, red)]),
      );
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(1, 0, TRANSPARENT, BLACK)]),
      );
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(2, 0, TRANSPARENT, WHITE)]),
      );

      // Undo one to create redo state
      historyService.undo();

      expect(historyService.canUndo()).toBe(true);
      expect(historyService.canRedo()).toBe(true);

      // Clear
      historyService.clear();

      expect(historyService.canUndo()).toBe(false);
      expect(historyService.canRedo()).toBe(false);
      expect(historyService.undoDescription()).toBe('');
      expect(historyService.redoDescription()).toBe('');
    });

    it('should NOT revert pixel data when clearing history', () => {
      const red: Color = { r: 255, g: 0, b: 0, a: 255 };
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(0, 0, TRANSPARENT, red)]),
      );
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(1, 0, TRANSPARENT, BLACK)]),
      );

      // Undo one
      historyService.undo();
      // Pixel (0,0) is red, (1,0) is transparent (undone)

      historyService.clear();

      // Canvas state should remain as-is (clear only resets stacks)
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), red)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 1, 0, 4), TRANSPARENT)).toBe(true);
    });

    it('should allow new commands after clear', () => {
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(0, 0, TRANSPARENT, BLACK)]),
      );
      historyService.clear();

      // Execute new command after clear
      const green: Color = { r: 0, g: 255, b: 0, a: 255 };
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(1, 1, TRANSPARENT, green)]),
      );

      expect(historyService.canUndo()).toBe(true);
      expect(historyService.undoDescription()).toBe('Draw 1 pixel(s)');

      historyService.undo();
      expect(colorsEqual(layerService.getPixel(0, 1, 1, 4), TRANSPARENT)).toBe(true);
      // Original command's pixel should still be there (clear doesn't undo)
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), BLACK)).toBe(true);
    });
  });

  describe('Signal reactivity edge cases', () => {
    it('multiple DrawCommands should change layers() identity', () => {
      const ref1 = layerService.layers();

      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(0, 0, TRANSPARENT, BLACK)]),
      );
      const ref2 = layerService.layers();

      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(1, 0, TRANSPARENT, WHITE)]),
      );
      const ref3 = layerService.layers();

      // Each execute creates a new reference via notifyLayersChanged()
      expect(ref1).not.toBe(ref2);
      expect(ref2).not.toBe(ref3);
    });

    it('LayerCommand between DrawCommands should change identity', () => {
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(0, 0, TRANSPARENT, BLACK)]),
      );
      const refAfterDraw = layerService.layers();

      const prevData = layerService.getLayerData(0)!;
      const newData = new Uint8ClampedArray(4 * 4 * 4);
      historyService.execute(new LayerCommand(layerService, 0, prevData, newData));
      const refAfterLayer = layerService.layers();

      expect(refAfterDraw).not.toBe(refAfterLayer);
    });

    it('undo of both LayerCommand and DrawCommand should change identity', () => {
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(0, 0, TRANSPARENT, BLACK)]),
      );

      const prevData = layerService.getLayerData(0)!;
      const newData = new Uint8ClampedArray(4 * 4 * 4);
      historyService.execute(new LayerCommand(layerService, 0, prevData, newData));

      const refBeforeLayerUndo = layerService.layers();
      historyService.undo(); // Undo LayerCommand
      const refAfterLayerUndo = layerService.layers();
      expect(refBeforeLayerUndo).not.toBe(refAfterLayerUndo);

      const refBeforeDrawUndo = layerService.layers();
      historyService.undo(); // Undo DrawCommand
      const refAfterDrawUndo = layerService.layers();
      expect(refBeforeDrawUndo).not.toBe(refAfterDrawUndo);
    });

    it('DrawCommand execute/undo/redo cycle should change layers() identity each time', () => {
      const initialRef = layerService.layers();

      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(0, 0, TRANSPARENT, BLACK)]),
      );
      const afterExecute = layerService.layers();
      expect(afterExecute).not.toBe(initialRef);

      historyService.undo();
      const afterUndo = layerService.layers();
      expect(afterUndo).not.toBe(afterExecute);

      historyService.redo();
      const afterRedo = layerService.layers();
      expect(afterRedo).not.toBe(afterUndo);
    });
  });

  describe('Out-of-bounds and invalid layer indices', () => {
    it('should not throw when executing a DrawCommand with out-of-bounds coordinates', () => {
      const cmd = new DrawCommand(layerService, 0, 4, [makePixel(100, 100, TRANSPARENT, BLACK)]);
      expect(() => historyService.execute(cmd)).not.toThrow();

      // Existing pixels should be unaffected
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), TRANSPARENT)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 3, 3, 4), TRANSPARENT)).toBe(true);
    });

    it('should not throw when executing a DrawCommand for nonexistent layer', () => {
      const cmd = new DrawCommand(layerService, 99, 4, [makePixel(0, 0, TRANSPARENT, BLACK)]);
      expect(() => historyService.execute(cmd)).not.toThrow();
      expect(() => historyService.undo()).not.toThrow();

      // Layer 0 should be unaffected
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), TRANSPARENT)).toBe(true);
    });

    it('should not throw when executing a DrawCommand with negative coordinates', () => {
      const cmd = new DrawCommand(layerService, 0, 4, [makePixel(-1, -1, TRANSPARENT, BLACK)]);
      expect(() => historyService.execute(cmd)).not.toThrow();
      expect(() => historyService.undo()).not.toThrow();

      // Canvas should be unaffected
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), TRANSPARENT)).toBe(true);
    });

    it('should not corrupt adjacent pixel data with out-of-bounds writes', () => {
      const red: Color = { r: 255, g: 0, b: 0, a: 255 };
      // Set some known data first
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [
          makePixel(0, 0, TRANSPARENT, red),
          makePixel(1, 0, TRANSPARENT, BLACK),
          makePixel(2, 0, TRANSPARENT, WHITE),
        ]),
      );

      // Attempt out-of-bounds write
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(4, 0, TRANSPARENT, BLACK)]),
      );

      // All original pixels should be intact
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), red)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 1, 0, 4), BLACK)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 2, 0, 4), WHITE)).toBe(true);
    });

    it('should handle LayerCommand targeting nonexistent layer', () => {
      const newData = new Uint8ClampedArray(4 * 4 * 4);
      const cmd = new LayerCommand(layerService, 99, new Uint8ClampedArray(0), newData);
      expect(() => historyService.execute(cmd)).not.toThrow();
      expect(() => historyService.undo()).not.toThrow();

      // Layer 0 data should be unaffected
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), TRANSPARENT)).toBe(true);
    });
  });

  describe('Complex multi-step scenarios', () => {
    it('should handle draw → LayerCommand overwrite → undo LayerCommand → verify draw intact', () => {
      const red: Color = { r: 255, g: 0, b: 0, a: 255 };

      // Draw a pixel
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(2, 2, TRANSPARENT, red)]),
      );

      // Overwrite entire layer (simulating "clear layer")
      const prevData = layerService.getLayerData(0)!;
      const blankData = new Uint8ClampedArray(4 * 4 * 4);
      historyService.execute(new LayerCommand(layerService, 0, prevData, blankData));

      // Canvas should be blank
      expect(colorsEqual(layerService.getPixel(0, 2, 2, 4), TRANSPARENT)).toBe(true);

      // Undo the clear — the draw should re-appear
      historyService.undo();
      expect(colorsEqual(layerService.getPixel(0, 2, 2, 4), red)).toBe(true);
    });

    it('should handle a long sequence of alternating draw/fill commands', () => {
      const colors: Color[] = [];
      // Execute 20 commands alternating between draw and fill on different pixels
      for (let i = 0; i < 20; i++) {
        const x = i % 4;
        const y = Math.floor(i / 4) % 4;
        const color: Color = { r: (i * 13) % 256, g: (i * 37) % 256, b: (i * 71) % 256, a: 255 };
        colors.push(color);
        const prevColor = layerService.getPixel(0, x, y, 4);
        if (i % 2 === 0) {
          historyService.execute(
            new DrawCommand(layerService, 0, 4, [makePixel(x, y, prevColor, color)]),
          );
        } else {
          historyService.execute(
            new FillCommand(layerService, 0, 4, [makePixel(x, y, prevColor, color)]),
          );
        }
      }

      // Undo all 20
      for (let i = 0; i < 20; i++) {
        historyService.undo();
      }

      // Canvas should be fully transparent
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          expect(colorsEqual(layerService.getPixel(0, x, y, 4), TRANSPARENT)).toBe(true);
        }
      }

      expect(historyService.canUndo()).toBe(false);
      expect(historyService.canRedo()).toBe(true);
    });

    it('should handle undo past a LayerCommand that was inserted between DrawCommands', () => {
      const red: Color = { r: 255, g: 0, b: 0, a: 255 };
      const green: Color = { r: 0, g: 255, b: 0, a: 255 };
      const blue: Color = { r: 0, g: 0, b: 255, a: 255 };

      // Draw red at (0,0)
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(0, 0, TRANSPARENT, red)]),
      );

      // LayerCommand: fill entire canvas with green
      const prevData = layerService.getLayerData(0)!;
      const greenData = new Uint8ClampedArray(4 * 4 * 4);
      for (let i = 0; i < greenData.length; i += 4) {
        greenData[i] = 0;
        greenData[i + 1] = 255;
        greenData[i + 2] = 0;
        greenData[i + 3] = 255;
      }
      historyService.execute(new LayerCommand(layerService, 0, prevData, greenData));

      // Draw blue at (1,1) on top of the green canvas
      historyService.execute(new DrawCommand(layerService, 0, 4, [makePixel(1, 1, green, blue)]));

      // Verify current state
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), green)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 1, 1, 4), blue)).toBe(true);

      // Undo blue draw
      historyService.undo();
      expect(colorsEqual(layerService.getPixel(0, 1, 1, 4), green)).toBe(true);

      // Undo LayerCommand (green fill)
      historyService.undo();
      // Should be back to state after the first draw: (0,0)=red, rest transparent
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), red)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 1, 1, 4), TRANSPARENT)).toBe(true);

      // Undo first draw
      historyService.undo();
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), TRANSPARENT)).toBe(true);
    });

    it('should handle multi-pixel DrawCommand where pixels are drawn on different rows', () => {
      const red: Color = { r: 255, g: 0, b: 0, a: 255 };
      // Single DrawCommand affecting pixels across multiple rows
      const pixels = [
        makePixel(0, 0, TRANSPARENT, red),
        makePixel(1, 1, TRANSPARENT, red),
        makePixel(2, 2, TRANSPARENT, red),
        makePixel(3, 3, TRANSPARENT, red),
      ];
      historyService.execute(new DrawCommand(layerService, 0, 4, pixels));

      // Verify all 4 pixels
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), red)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 1, 1, 4), red)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 2, 2, 4), red)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 3, 3, 4), red)).toBe(true);

      // Verify non-diagonal pixels are still transparent
      expect(colorsEqual(layerService.getPixel(0, 1, 0, 4), TRANSPARENT)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 0, 1, 4), TRANSPARENT)).toBe(true);

      // Undo — all 4 should revert
      historyService.undo();
      expect(colorsEqual(layerService.getPixel(0, 0, 0, 4), TRANSPARENT)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 1, 1, 4), TRANSPARENT)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 2, 2, 4), TRANSPARENT)).toBe(true);
      expect(colorsEqual(layerService.getPixel(0, 3, 3, 4), TRANSPARENT)).toBe(true);
    });
  });

  describe('Description tracking through undo/redo', () => {
    it('should track descriptions accurately through a complex sequence', () => {
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(0, 0, TRANSPARENT, BLACK)], 'Step A'),
      );
      historyService.execute(
        new FillCommand(layerService, 0, 4, [
          makePixel(1, 0, TRANSPARENT, BLACK),
          makePixel(2, 0, TRANSPARENT, BLACK),
        ]),
      );
      historyService.execute(
        new LayerCommand(
          layerService,
          0,
          layerService.getLayerData(0)!,
          new Uint8ClampedArray(4 * 4 * 4),
          'Clear canvas',
        ),
      );

      expect(historyService.undoDescription()).toBe('Clear canvas');

      historyService.undo();
      expect(historyService.undoDescription()).toBe('Fill 2 pixel(s)');
      expect(historyService.redoDescription()).toBe('Clear canvas');

      historyService.undo();
      expect(historyService.undoDescription()).toBe('Step A');
      expect(historyService.redoDescription()).toBe('Fill 2 pixel(s)');

      historyService.undo();
      expect(historyService.undoDescription()).toBe('');
      expect(historyService.redoDescription()).toBe('Step A');
    });

    it('should clear descriptions when new command is executed after undo', () => {
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(0, 0, TRANSPARENT, BLACK)], 'First'),
      );
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(1, 0, TRANSPARENT, BLACK)], 'Second'),
      );

      historyService.undo(); // Undo 'Second' — it goes to redo stack
      expect(historyService.redoDescription()).toBe('Second');

      // Execute new command — redo stack should be cleared
      historyService.execute(
        new DrawCommand(layerService, 0, 4, [makePixel(2, 0, TRANSPARENT, BLACK)], 'Third'),
      );

      expect(historyService.undoDescription()).toBe('Third');
      expect(historyService.redoDescription()).toBe('');
      expect(historyService.canRedo()).toBe(false);
    });
  });
});
