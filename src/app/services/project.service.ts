import { Injectable, inject } from '@angular/core';
import { PxlpxlDatabase } from '../db/pxlpxl.database';
import { Project, createDefaultProject, serializeLayer, deserializeLayer } from '../models';
import { CanvasStateService } from './canvas-state.service';
import { LayerService } from './layer.service';
import { ColorService } from './color.service';
import { HistoryService } from './history.service';

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private readonly db = inject(PxlpxlDatabase);
  private readonly canvasState = inject(CanvasStateService);
  private readonly layerService = inject(LayerService);
  private readonly colorService = inject(ColorService);
  private readonly historyService = inject(HistoryService);

  private currentProjectId: number | undefined;

  /** Create a new blank project and load it into the editor */
  newProject(name: string, width: number, height: number): void {
    this.currentProjectId = undefined;
    this.canvasState.setCanvasSize(width, height);
    this.layerService.initLayers(width, height);
    this.colorService.setPalette([...this.colorService.palette()]);
    this.historyService.clear();
    this.canvasState.resetZoom();
  }

  /** Save the current editor state to IndexedDB */
  async saveProject(name?: string): Promise<number> {
    const project: Project = {
      id: this.currentProjectId,
      name: name ?? 'Untitled',
      width: this.canvasState.canvasWidth(),
      height: this.canvasState.canvasHeight(),
      layers: this.layerService.layers().map(serializeLayer),
      palette: this.colorService.palette(),
      createdAt: this.currentProjectId
        ? ((await this.db.getProject(this.currentProjectId))?.createdAt ?? new Date())
        : new Date(),
      updatedAt: new Date(),
    };

    const id = await this.db.saveProject(project);
    this.currentProjectId = id;
    return id;
  }

  /** Load a project from IndexedDB */
  async loadProject(id: number): Promise<boolean> {
    const project = await this.db.getProject(id);
    if (!project) return false;

    this.currentProjectId = project.id;
    this.canvasState.setCanvasSize(project.width, project.height);
    this.layerService.setLayers(project.layers.map(deserializeLayer));
    this.colorService.setPalette(project.palette);
    this.historyService.clear();
    this.canvasState.resetZoom();
    return true;
  }

  /** List all saved projects */
  async listProjects(): Promise<Project[]> {
    return this.db.getAllProjects();
  }

  /** Delete a project from IndexedDB */
  async deleteProject(id: number): Promise<void> {
    await this.db.deleteProject(id);
    if (this.currentProjectId === id) {
      this.currentProjectId = undefined;
    }
  }

  get currentId(): number | undefined {
    return this.currentProjectId;
  }
}
