import { Injectable, signal } from '@angular/core';
import { Tool, ToolType } from '../models';

@Injectable({ providedIn: 'root' })
export class ToolService {
  private readonly toolRegistry = new Map<ToolType, Tool>();
  private readonly _activeToolType = signal<ToolType>(ToolType.Pencil);
  readonly activeToolType = this._activeToolType.asReadonly();

  get activeTool(): Tool | undefined {
    return this.toolRegistry.get(this.activeToolType());
  }

  registerTool(tool: Tool): void {
    this.toolRegistry.set(tool.type, tool);
  }

  setActiveTool(type: ToolType): void {
    this._activeToolType.set(type);
  }

  getTool(type: ToolType): Tool | undefined {
    return this.toolRegistry.get(type);
  }

  getAllTools(): Tool[] {
    return Array.from(this.toolRegistry.values());
  }
}
