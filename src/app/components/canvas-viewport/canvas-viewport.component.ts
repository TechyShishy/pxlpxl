import {
  Component,
  ChangeDetectionStrategy,
  inject,
  ElementRef,
  viewChild,
  afterNextRender,
  NgZone,
  effect,
} from '@angular/core';
import { CanvasStateService } from '../../services/canvas-state.service';
import { LayerService } from '../../services/layer.service';
import { ToolService } from '../../services/tool.service';
import { ColorService } from '../../services/color.service';
import { HistoryService } from '../../services/history.service';
import { GestureService } from '../../services/gesture.service';
import { RenderService } from '../../services/render.service';
import { LayoutService } from '../../services/layout.service';
import { Color, ToolContext, GestureState, PixelCoord } from '../../models';
import { DrawCommand } from '../../commands/draw.command';
import { FillCommand } from '../../commands/fill.command';
import { LayerCommand } from '../../commands/layer.command';
import { EyedropperTool } from '../../tools/eyedropper.tool';
import { MoveTool } from '../../tools/move.tool';
import { ToolType } from '../../models';

@Component({
  selector: 'app-canvas-viewport',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './canvas-viewport.component.html',
  styleUrl: './canvas-viewport.component.scss',
})
export class CanvasViewportComponent {
  private readonly canvasState = inject(CanvasStateService);
  private readonly layerService = inject(LayerService);
  private readonly toolService = inject(ToolService);
  private readonly colorService = inject(ColorService);
  private readonly historyService = inject(HistoryService);
  private readonly gestureService = inject(GestureService);
  private readonly renderService = inject(RenderService);
  private readonly layoutService = inject(LayoutService);
  private readonly ngZone = inject(NgZone);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  private ctx: CanvasRenderingContext2D | null = null;
  private animFrameId = 0;
  private previewPixels: PixelCoord[] = [];
  private previewColor: Color | undefined;

  constructor() {
    // Set up gesture callbacks
    this.gestureService.onDraw = (x, y, phase) => this.handleDraw(x, y, phase);
    this.gestureService.onPinch = (scaleDelta, cx, cy) => this.handlePinch(scaleDelta);
    this.gestureService.onEdgeSwipe = (dir) => this.handleEdgeSwipe(dir);

    // Set up eyedropper color pick callback
    const eyedropper = this.toolService.getTool('eyedropper' as any) as EyedropperTool | undefined;
    if (eyedropper) {
      eyedropper.onColorPicked = (color, isSecondary) => {
        if (isSecondary) {
          this.colorService.setSecondaryColor(color);
        } else {
          this.colorService.setPrimaryColor(color);
        }
      };
    }

    afterNextRender(() => {
      this.setupCanvas();
      this.startRenderLoop();
    });

    // Re-render when relevant state changes
    effect(() => {
      // Touch these signals to track them
      this.canvasState.transform();
      this.canvasState.showGrid();
      this.canvasState.canvasWidth();
      this.canvasState.canvasHeight();
      this.layerService.layers();
      this.requestRender();
    });
  }

  private setupCanvas(): void {
    const canvas = this.canvasRef().nativeElement;
    this.ctx = canvas.getContext('2d');
    this.resizeCanvas();

    const observer = new ResizeObserver(() => this.resizeCanvas());
    observer.observe(this.elementRef.nativeElement);
  }

  private resizeCanvas(): void {
    const canvas = this.canvasRef().nativeElement;
    const rect = this.elementRef.nativeElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    this.requestRender();
  }

  private startRenderLoop(): void {
    this.requestRender();
  }

  private requestRender(): void {
    if (this.animFrameId) return;
    this.animFrameId = requestAnimationFrame(() => {
      this.animFrameId = 0;
      this.render();
    });
  }

  private render(): void {
    if (!this.ctx) return;
    const canvas = this.canvasRef().nativeElement;
    this.renderService.render(
      this.ctx,
      canvas.width,
      canvas.height,
      this.previewPixels,
      this.previewColor,
    );
  }

  // --- Pointer event handlers ---

  onPointerDown(e: PointerEvent): void {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const rect = this.canvasRef().nativeElement.getBoundingClientRect();
    this.gestureService.handlePointerDown(e, rect);
  }

  onPointerMove(e: PointerEvent): void {
    this.gestureService.handlePointerMove(e);
  }

  onPointerUp(e: PointerEvent): void {
    this.gestureService.handlePointerUp(e);
  }

  onPointerCancel(e: PointerEvent): void {
    this.gestureService.handlePointerCancel(e);
  }

  onWheel(e: WheelEvent): void {
    e.preventDefault();
    if (e.deltaY < 0) {
      this.canvasState.zoomIn();
    } else {
      this.canvasState.zoomOut();
    }
  }

  // --- Drawing logic ---

  private handleDraw(screenX: number, screenY: number, phase: 'start' | 'move' | 'end'): void {
    const canvas = this.canvasRef().nativeElement;
    const rect = canvas.getBoundingClientRect();
    const pixel = this.canvasState.screenToPixel(screenX, screenY, rect);

    if (!pixel) return;

    const tool = this.toolService.activeTool;
    if (!tool) return;

    const activeLayer = this.layerService.activeLayer();
    if (!activeLayer) return;

    const ctx: ToolContext = {
      coord: pixel,
      layerIndex: this.layerService.activeLayerIndex(),
      canvasWidth: this.canvasState.canvasWidth(),
      canvasHeight: this.canvasState.canvasHeight(),
      primaryColor: this.colorService.primaryColor(),
      secondaryColor: this.colorService.secondaryColor(),
      isSecondary: false,
      gridType: this.canvasState.gridType(),
    };

    let result;
    switch (phase) {
      case 'start':
        result = tool.onPointerDown(ctx, activeLayer.data);
        this.previewPixels = tool.getPreview?.() ?? [];
        this.previewColor = ctx.isSecondary ? ctx.secondaryColor : ctx.primaryColor;
        break;
      case 'move':
        result = tool.onPointerMove(ctx, activeLayer.data);
        this.previewPixels = tool.getPreview?.() ?? [];
        this.previewColor = ctx.isSecondary ? ctx.secondaryColor : ctx.primaryColor;
        break;
      case 'end':
        result = tool.onPointerUp(ctx, activeLayer.data);
        this.previewPixels = [];
        this.previewColor = undefined;
        // On end, create a command for undo/redo
        if (tool.type === ToolType.Move) {
          const moveTool = tool as MoveTool;
          const previousData = moveTool.getOriginalData();
          if (previousData) {
            const nextData = new Uint8ClampedArray(activeLayer.data);
            const command = new LayerCommand(
              this.layerService,
              ctx.layerIndex,
              previousData,
              nextData,
              'Move layer',
            );
            // Don't execute — pixels already applied by the tool
            this.historyService['undoStack'].update((s) => [...s, command]);
            this.historyService['redoStack'].set([]);
          }
          moveTool.resetSnapshot();
        } else if (result && result.modifiedPixels.length > 0) {
          const command =
            tool.type === 'fill'
              ? new FillCommand(
                  this.layerService,
                  ctx.layerIndex,
                  ctx.canvasWidth,
                  result.modifiedPixels,
                )
              : new DrawCommand(
                  this.layerService,
                  ctx.layerIndex,
                  ctx.canvasWidth,
                  result.modifiedPixels,
                );
          // Don't execute — pixels already applied by the tool
          this.historyService['undoStack'].update((s) => [...s, command]);
          this.historyService['redoStack'].set([]);
        }
        break;
    }

    this.requestRender();
  }

  private handlePinch(scaleDelta: number): void {
    const currentScale = this.canvasState.transform().scale;
    this.canvasState.setZoom(currentScale * scaleDelta);
  }

  private handleEdgeSwipe(direction: 'left' | 'right'): void {
    if (direction === 'right') {
      this.layoutService.toggleLeftSidebar();
    } else {
      this.layoutService.toggleRightSidebar();
    }
  }
}
