import { TestBed } from '@angular/core/testing';
import { ProjectService } from './project.service';
import { PxlpxlDatabase } from '../db/pxlpxl.database';
import { CanvasStateService } from './canvas-state.service';
import { LayerService } from './layer.service';
import { ColorService } from './color.service';
import { HistoryService } from './history.service';
import {
  DEFAULT_PALETTE,
  serializeLayer,
  deserializeLayer,
  createDefaultProject,
  Project,
  GridType,
} from '../models';
import { describe, it, expect, beforeEach, vi } from 'vitest';

/* ---------- mock database ---------- */
class MockDatabase {
  private store = new Map<number, Project>();
  private nextId = 1;

  async saveProject(project: Project): Promise<number> {
    if (project.id) {
      this.store.set(project.id, { ...project });
      return project.id;
    }
    const id = this.nextId++;
    this.store.set(id, { ...project, id });
    return id;
  }

  async getProject(id: number): Promise<Project | undefined> {
    return this.store.get(id);
  }

  async getAllProjects(): Promise<Project[]> {
    return [...this.store.values()];
  }

  async deleteProject(id: number): Promise<void> {
    this.store.delete(id);
  }
}

describe('ProjectService', () => {
  let service: ProjectService;
  let canvasState: CanvasStateService;
  let layerService: LayerService;
  let colorService: ColorService;
  let historyService: HistoryService;
  let db: MockDatabase;

  beforeEach(() => {
    db = new MockDatabase();

    TestBed.configureTestingModule({
      providers: [{ provide: PxlpxlDatabase, useValue: db }],
    });

    service = TestBed.inject(ProjectService);
    canvasState = TestBed.inject(CanvasStateService);
    layerService = TestBed.inject(LayerService);
    colorService = TestBed.inject(ColorService);
    historyService = TestBed.inject(HistoryService);
  });

  /* ====== newProject ====== */

  describe('newProject', () => {
    it('should set canvas dimensions and grid type', () => {
      service.newProject('Test', 32, 24, 'peyote-even');

      expect(canvasState.canvasWidth()).toBe(32);
      expect(canvasState.canvasHeight()).toBe(24);
      expect(canvasState.gridType()).toBe('peyote-even');
    });

    it('should default grid type to square', () => {
      service.newProject('Test', 16, 16);
      expect(canvasState.gridType()).toBe('square');
    });

    it('should initialise a single blank layer', () => {
      service.newProject('Test', 8, 8);
      const layers = layerService.layers();
      expect(layers.length).toBe(1);
      // Layer stores flat RGBA data — 8*8*4 bytes
      expect(layers[0].data.length).toBe(8 * 8 * 4);
    });

    it('should clear undo/redo history', () => {
      // Push something into history first
      historyService.execute({
        description: 'dummy',
        execute: () => {},
        undo: () => {},
      });
      expect(historyService.canUndo()).toBe(true);

      service.newProject('Test', 16, 16);

      expect(historyService.canUndo()).toBe(false);
      expect(historyService.canRedo()).toBe(false);
    });

    it('should reset currentId to undefined', () => {
      // Simulate having a loaded project
      service.newProject('First', 8, 8);
      // currentId should be undefined for a fresh project
      expect(service.currentId).toBeUndefined();
    });

    /**
     * BUG: newProject() calls `setPalette([...this.colorService.palette()])`
     * which copies the current palette onto itself instead of resetting to
     * DEFAULT_PALETTE. After the user modifies the palette, newProject should
     * restore the default palette, but it doesn't.
     *
     * This test is EXPECTED TO FAIL until the bug is fixed.
     */
    it('should reset palette to DEFAULT_PALETTE (BUG: copies current palette instead)', () => {
      // Modify the palette — add a custom colour
      const customColor = { r: 1, g: 2, b: 3, a: 255 };
      colorService.addToPalette(customColor);
      expect(colorService.palette().length).toBe(DEFAULT_PALETTE.length + 1);

      // Now create a new project — palette should reset
      service.newProject('Fresh', 16, 16);

      // The palette should be the default 16 colours
      expect(colorService.palette().length).toBe(DEFAULT_PALETTE.length);
      expect(colorService.palette()).toEqual(DEFAULT_PALETTE);
    });
  });

  /* ====== saveProject ====== */

  describe('saveProject', () => {
    it('should persist project and return an id', async () => {
      service.newProject('Save-Test', 8, 8);
      const id = await service.saveProject('Save-Test');
      expect(id).toBeGreaterThan(0);
      expect(service.currentId).toBe(id);
    });

    it('should use "Untitled" when no name is given', async () => {
      service.newProject('X', 8, 8);
      const id = await service.saveProject();
      const saved = await db.getProject(id);
      expect(saved?.name).toBe('Untitled');
    });

    it('should preserve createdAt on subsequent saves', async () => {
      service.newProject('SaveTwice', 4, 4);
      const id = await service.saveProject('SaveTwice');
      const first = await db.getProject(id);
      const createdAt = first!.createdAt;

      // Save again
      const id2 = await service.saveProject('SaveTwice-v2');
      expect(id2).toBe(id);
      const second = await db.getProject(id);
      expect(second!.createdAt).toEqual(createdAt);
    });

    it('should save current layers and palette', async () => {
      service.newProject('WithData', 4, 4);

      // Draw a pixel so data isn't blank
      layerService.setPixel(0, 0, 0, 4, { r: 255, g: 0, b: 0, a: 255 });

      const id = await service.saveProject('WithData');
      const saved = await db.getProject(id);

      expect(saved?.layers.length).toBe(1);
      expect(saved?.width).toBe(4);
      expect(saved?.height).toBe(4);
      expect(saved?.palette).toBeDefined();
    });

    it('should save grid type', async () => {
      service.newProject('Peyote', 8, 8, 'peyote-odd');
      const id = await service.saveProject('Peyote');
      const saved = await db.getProject(id);
      expect(saved?.gridType).toBe('peyote-odd');
    });
  });

  /* ====== loadProject ====== */

  describe('loadProject', () => {
    it('should load a previously saved project', async () => {
      service.newProject('LoadMe', 12, 10, 'peyote-even');
      const id = await service.saveProject('LoadMe');

      // Start a different project
      service.newProject('Other', 4, 4);
      expect(canvasState.canvasWidth()).toBe(4);

      // Load the first one back
      const loaded = await service.loadProject(id);
      expect(loaded).toBe(true);
      expect(canvasState.canvasWidth()).toBe(12);
      expect(canvasState.canvasHeight()).toBe(10);
      expect(canvasState.gridType()).toBe('peyote-even');
      expect(service.currentId).toBe(id);
    });

    it('should return false for non-existent id', async () => {
      const loaded = await service.loadProject(9999);
      expect(loaded).toBe(false);
    });

    it('should clear history on load', async () => {
      service.newProject('H', 4, 4);
      historyService.execute({
        description: 'x',
        execute: () => {},
        undo: () => {},
      });
      expect(historyService.canUndo()).toBe(true);

      const id = await service.saveProject('H');
      const loaded = await service.loadProject(id);
      expect(loaded).toBe(true);
      expect(historyService.canUndo()).toBe(false);
    });

    it('should restore palette from saved project', async () => {
      service.newProject('Pal', 4, 4);
      const customPalette = [
        { r: 10, g: 20, b: 30, a: 255 },
        { r: 40, g: 50, b: 60, a: 255 },
      ];
      colorService.setPalette(customPalette);
      const id = await service.saveProject('Pal');

      // Change palette
      colorService.setPalette(DEFAULT_PALETTE);

      await service.loadProject(id);
      expect(colorService.palette().length).toBe(2);
    });
  });

  /* ====== deleteProject ====== */

  describe('deleteProject', () => {
    it('should remove the project from the database', async () => {
      service.newProject('Del', 4, 4);
      const id = await service.saveProject('Del');

      await service.deleteProject(id);
      const gone = await db.getProject(id);
      expect(gone).toBeUndefined();
    });

    it('should clear currentId if deleting the active project', async () => {
      service.newProject('Del', 4, 4);
      const id = await service.saveProject('Del');
      expect(service.currentId).toBe(id);

      await service.deleteProject(id);
      expect(service.currentId).toBeUndefined();
    });

    it('should not clear currentId when deleting a different project', async () => {
      service.newProject('A', 4, 4);
      const idA = await service.saveProject('A');

      service.newProject('B', 4, 4);
      const idB = await service.saveProject('B');

      await service.deleteProject(idA);
      expect(service.currentId).toBe(idB);
    });
  });

  /* ====== listProjects ====== */

  describe('listProjects', () => {
    it('should list all saved projects', async () => {
      service.newProject('P1', 4, 4);
      await service.saveProject('P1');
      service.newProject('P2', 8, 8);
      await service.saveProject('P2');

      const all = await service.listProjects();
      expect(all.length).toBe(2);
    });
  });
});
