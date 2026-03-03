import { Injectable, inject, signal } from '@angular/core';
import { PxlpxlDatabase } from '../db/pxlpxl.database';
import {
  Project,
  GridType,
  createDefaultProject,
  serializeLayer,
  deserializeLayer,
  DEFAULT_PALETTE,
  computeBufferPixelCount,
} from '../models';
import type { Color } from '../models';
import { CanvasStateService } from './canvas-state.service';
import { LayerService } from './layer.service';
import { ColorService } from './color.service';
import { HistoryService } from './history.service';
import { serializeCommand, deserializeCommand } from '../commands/command-serialization';

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private readonly db = inject(PxlpxlDatabase);
  private readonly canvasState = inject(CanvasStateService);
  private readonly layerService = inject(LayerService);
  private readonly colorService = inject(ColorService);
  private readonly historyService = inject(HistoryService);

  private currentProjectId: number | undefined;

  /** Reactive name of the current project */
  readonly currentProjectName = signal<string>('Untitled');

  /** Reactive list of all saved projects, sorted by updatedAt descending */
  readonly savedProjects = signal<Project[]>([]);

  /** Last error from an async operation, or null if the last operation succeeded */
  readonly error = signal<string | null>(null);

  /** Create a new blank project and load it into the editor */
  newProject(
    name: string, width: number, height: number,
    gridType: GridType = 'square',
    triangularA?: number, triangularD?: number,
    triangularDNum?: number, triangularDDen?: number,
    triangularShift?: number,
    palette?: Color[],
  ): void {
    this.currentProjectId = undefined;
    this.currentProjectName.set(name);
    this.canvasState.setCanvasSize(width, height);
    this.canvasState.setGridType(gridType);
    if (gridType === 'triangular' && triangularA !== undefined) {
      this.canvasState.setTriangularParams(triangularA, triangularD ?? 1, triangularDNum, triangularDDen, triangularShift);
    }
    const pixelCount = computeBufferPixelCount(
      width, height,
      gridType, triangularA, triangularD, triangularDNum, triangularDDen, triangularShift,
    );
    this.layerService.initLayers(
      this.canvasState.bufferWidth(), this.canvasState.bufferHeight(), pixelCount,
    );
    this.colorService.setPalette(palette ? [...palette] : [...DEFAULT_PALETTE]);
    this.historyService.clear();
    this.canvasState.resetZoom();
  }

  /** Save the current editor state to IndexedDB */
  async saveProject(name?: string): Promise<number | undefined> {
    try {
      const projectName = name ?? this.currentProjectName();
      this.currentProjectName.set(projectName);
      const project: Project = {
        id: this.currentProjectId,
        name: projectName,
        width: this.canvasState.canvasWidth(),
        height: this.canvasState.canvasHeight(),
        gridType: this.canvasState.gridType(),
        triangularA: this.canvasState.gridType() === 'triangular' ? this.canvasState.triangularA() : undefined,
        triangularD: this.canvasState.gridType() === 'triangular' ? this.canvasState.triangularD() : undefined,
        triangularDNum: this.canvasState.gridType() === 'triangular' ? this.canvasState.triangularDNum() : undefined,
        triangularDDen: this.canvasState.gridType() === 'triangular' ? this.canvasState.triangularDDen() : undefined,
        triangularShift: this.canvasState.gridType() === 'triangular' ? this.canvasState.triangularShift() : undefined,
        layers: this.layerService.layers().map(serializeLayer),
        palette: this.colorService.palette(),
        history: {
          undoStack: this.historyService
            .getUndoStack()
            .map(serializeCommand)
            .filter((e): e is NonNullable<typeof e> => e !== null),
          redoStack: this.historyService
            .getRedoStack()
            .map(serializeCommand)
            .filter((e): e is NonNullable<typeof e> => e !== null),
        },
        createdAt: this.currentProjectId
          ? ((await this.db.getProject(this.currentProjectId))?.createdAt ?? new Date())
          : new Date(),
        updatedAt: new Date(),
      };

      const id = await this.db.saveProject(project);
      this.currentProjectId = id;
      await this.refreshSavedProjects();
      this.error.set(null);
      return id;
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
      return undefined;
    }
  }

  /** Load a project from IndexedDB */
  async loadProject(id: number): Promise<boolean> {
    try {
      const project = await this.db.getProject(id);
      if (!project) return false;

      this.currentProjectId = project.id;
      this.currentProjectName.set(project.name);
      this.canvasState.setCanvasSize(project.width, project.height);
      this.canvasState.setGridType(project.gridType ?? 'square');
      if (project.gridType === 'triangular' && project.triangularA !== undefined) {
        this.canvasState.setTriangularParams(project.triangularA, project.triangularD ?? 1, project.triangularDNum, project.triangularDDen, project.triangularShift);
      }
      this.layerService.setLayers(project.layers.map(deserializeLayer));
      this.colorService.setPalette(project.palette);
      if (project.history) {
        const undoStack = project.history.undoStack.map((e) =>
          deserializeCommand(e, this.layerService, this.colorService),
        );
        const redoStack = project.history.redoStack.map((e) =>
          deserializeCommand(e, this.layerService, this.colorService),
        );
        this.historyService.setStacks(undoStack, redoStack);
      } else {
        this.historyService.clear();
      }
      this.canvasState.resetZoom();
      this.error.set(null);
      return true;
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  /** List all saved projects */
  async listProjects(): Promise<Project[]> {
    try {
      const result = await this.db.getAllProjects();
      this.error.set(null);
      return result;
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
      return [];
    }
  }

  /** Delete a project from IndexedDB */
  async deleteProject(id: number): Promise<void> {
    try {
      await this.db.deleteProject(id);
      if (this.currentProjectId === id) {
        this.currentProjectId = undefined;
        this.currentProjectName.set('Untitled');
      }
      await this.refreshSavedProjects();
      this.error.set(null);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    }
  }

  /** Rename a project in IndexedDB */
  async renameProject(id: number, name: string): Promise<void> {
    try {
      await this.db.renameProject(id, name);
      if (this.currentProjectId === id) {
        this.currentProjectName.set(name);
      }
      await this.refreshSavedProjects();
      this.error.set(null);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    }
  }

  get currentId(): number | undefined {
    return this.currentProjectId;
  }

  /** Refresh the savedProjects signal from IndexedDB */
  async refreshSavedProjects(): Promise<void> {
    try {
      const projects = await this.db.getAllProjects();
      this.savedProjects.set(projects);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    }
  }
}
