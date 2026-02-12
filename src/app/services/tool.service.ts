import { Injectable, signal } from '@angular/core';
import { Tool, ToolType } from '../models';

@Injectable({ providedIn: 'root' })
export class ToolService {
  private readonly toolRegistry = new Map<ToolType, Tool>();
  readonly activeToolType = signal<ToolType>(ToolType.Pencil);

  get activeTool(): Tool | undefined {
    return this.toolRegistry.get(this.activeToolType());
  }

  registerTool(tool: Tool): void {
    this.toolRegistry.set(tool.type, tool);
  }

  setActiveTool(type: ToolType): void {
    this.activeToolType.set(type);
  }

  getTool(type: ToolType): Tool | undefined {
    return this.toolRegistry.get(type);
  }

  getAllTools(): Tool[] {
    return Array.from(this.toolRegistry.values());
  }
}
