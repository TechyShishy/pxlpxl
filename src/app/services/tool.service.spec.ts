import { TestBed } from '@angular/core/testing';
import { ToolService } from './tool.service';
import { Tool, ToolType, ToolContext, ToolResult } from '../models';

function createMockTool(type: ToolType, label?: string): Tool {
  return {
    type,
    icon: 'icon',
    label: label ?? `Tool ${type}`,
    cursor: 'crosshair',
    onPointerDown: () => null,
    onPointerMove: () => null,
    onPointerUp: () => null,
  };
}

describe('ToolService', () => {
  let service: ToolService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ToolService);
  });

  describe('registerTool / getTool', () => {
    it('should register and retrieve a tool', () => {
      const tool = createMockTool(ToolType.Pencil);
      service.registerTool(tool);
      expect(service.getTool(ToolType.Pencil)).toBe(tool);
    });

    it('should return undefined for unregistered tool type', () => {
      expect(service.getTool(ToolType.Fill)).toBeUndefined();
    });

    it('should overwrite a previously registered tool of the same type', () => {
      const tool1 = createMockTool(ToolType.Pencil);
      const tool2 = createMockTool(ToolType.Pencil, 'Pencil v2');
      service.registerTool(tool1);
      service.registerTool(tool2);
      expect(service.getTool(ToolType.Pencil)!.label).toBe('Pencil v2');
    });
  });

  describe('activeToolType', () => {
    it('should default to Pencil', () => {
      expect(service.activeToolType()).toBe(ToolType.Pencil);
    });

    it('should update when setActiveTool is called', () => {
      service.setActiveTool(ToolType.Eraser);
      expect(service.activeToolType()).toBe(ToolType.Eraser);
    });
  });

  describe('activeTool', () => {
    it('should return the tool matching activeToolType', () => {
      const pencil = createMockTool(ToolType.Pencil);
      service.registerTool(pencil);
      expect(service.activeTool).toBe(pencil);
    });

    it('should return undefined when no tool is registered for active type', () => {
      service.setActiveTool(ToolType.Fill);
      expect(service.activeTool).toBeUndefined();
    });

    it('should return different tool after switching active type', () => {
      const pencil = createMockTool(ToolType.Pencil);
      const eraser = createMockTool(ToolType.Eraser);
      service.registerTool(pencil);
      service.registerTool(eraser);
      service.setActiveTool(ToolType.Eraser);
      expect(service.activeTool).toBe(eraser);
    });
  });

  describe('getAllTools', () => {
    it('should return empty iterator when no tools registered', () => {
      const tools = Array.from(service.getAllTools());
      expect(tools.length).toBe(0);
    });

    it('should return all registered tools', () => {
      service.registerTool(createMockTool(ToolType.Pencil));
      service.registerTool(createMockTool(ToolType.Eraser));
      service.registerTool(createMockTool(ToolType.Fill));
      const tools = Array.from(service.getAllTools());
      expect(tools.length).toBe(3);
    });
  });
});
