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
import { renderColumnRuler, renderRowRuler, RulerParams } from './ruler-renderer';
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
  host: {
    '[class.rulers-active]': 'canvasState.showRulers()',
    '[style.cursor]': 'activeCursor',
  },
})
export class CanvasViewportComponent {
  protected readonly canvasState = inject(CanvasStateService);
  private readonly layerService = inject(LayerService);
  private readonly toolService = inject(ToolService);
  private readonly colorService = inject(ColorService);
  private readonly historyService = inject(HistoryService);
  private readonly gestureService = inject(GestureService);
  private readonly renderService = inject(RenderService);
  private readonly layoutService = inject(LayoutService);
  private readonly ngZone = inject(NgZone);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  protected get activeCursor(): string {
    const tool = this.toolService.activeTool;
    if (tool?.type === ToolType.Pan) {
      return this.isPanning ? 'grabbing' : 'grab';
    }
    return tool?.cursor ?? 'crosshair';
  }

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly rulerTopRef = viewChild<ElementRef<HTMLCanvasElement>>('rulerTop');
  private readonly rulerBottomRef = viewChild<ElementRef<HTMLCanvasElement>>('rulerBottom');
  private readonly rulerLeftRef = viewChild<ElementRef<HTMLCanvasElement>>('rulerLeft');
  private readonly rulerRightRef = viewChild<ElementRef<HTMLCanvasElement>>('rulerRight');
  private readonly crosshairRef = viewChild<ElementRef<HTMLCanvasElement>>('crosshair');

  private ctx: CanvasRenderingContext2D | null = null;
  private rulerTopCtx: CanvasRenderingContext2D | null = null;
  private rulerBottomCtx: CanvasRenderingContext2D | null = null;
  private rulerLeftCtx: CanvasRenderingContext2D | null = null;
  private rulerRightCtx: CanvasRenderingContext2D | null = null;
  private crosshairCtx: CanvasRenderingContext2D | null = null;
  private animFrameId = 0;
  private rulerFrameId = 0;
  private crosshairFrameId = 0;
  private cursorX = -1;
  private cursorY = -1;
  private previewPixels: PixelCoord[] = [];
  private previewColor: Color | undefined;

  /** Tracks the last raw screen position during a pan-tool drag. */
  private panLastX = 0;
  private panLastY = 0;
  private isPanning = false;

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

    // Re-render rulers when ruler-relevant state changes
    effect(() => {
      this.canvasState.showRulers();
      this.canvasState.transform();
      this.canvasState.canvasWidth();
      this.canvasState.canvasHeight();
      this.canvasState.gridType();
      this.canvasState.triangularA();
      this.canvasState.triangularD();
      this.requestRulerRender();
      this.requestCrosshairRender();
    });
  }

  private setupCanvas(): void {
    const canvas = this.canvasRef().nativeElement;
    this.ctx = canvas.getContext('2d');

    const getCtx = (ref: ElementRef<HTMLCanvasElement> | undefined) =>
      ref?.nativeElement.getContext('2d') ?? null;
    this.rulerTopCtx = getCtx(this.rulerTopRef());
    this.rulerBottomCtx = getCtx(this.rulerBottomRef());
    this.rulerLeftCtx = getCtx(this.rulerLeftRef());
    this.rulerRightCtx = getCtx(this.rulerRightRef());
    this.crosshairCtx = getCtx(this.crosshairRef());

    this.resizeCanvas();

    const observer = new ResizeObserver(() => this.resizeCanvas());
    observer.observe(this.elementRef.nativeElement);
  }

  private resizeCanvas(): void {
    const canvas = this.canvasRef().nativeElement;
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    this.resizeRulerCanvases();
    this.resizeCrosshairCanvas();
    this.requestRender();
    this.requestRulerRender();
    this.requestCrosshairRender();
  }

  private resizeRulerCanvases(): void {
    for (const ref of [
      this.rulerTopRef(),
      this.rulerBottomRef(),
      this.rulerLeftRef(),
      this.rulerRightRef(),
    ]) {
      if (!ref) continue;
      const c = ref.nativeElement;
      c.width = c.clientWidth;
      c.height = c.clientHeight;
    }
  }

  private resizeCrosshairCanvas(): void {
    const ref = this.crosshairRef();
    if (!ref) return;
    const host = this.elementRef.nativeElement;
    ref.nativeElement.width = host.clientWidth;
    ref.nativeElement.height = host.clientHeight;
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

  private requestRulerRender(): void {
    if (this.rulerFrameId) return;
    this.rulerFrameId = requestAnimationFrame(() => {
      this.rulerFrameId = 0;
      this.renderRulers();
    });
  }

  private renderRulers(): void {
    // Always sync canvas resolution attributes to current layout before drawing.
    // This is necessary because ruler canvases start at 0×0 (gutter is 0px when
    // rulers are hidden) and must be resized once the CSS reflows to 20px.
    this.resizeRulerCanvases();

    if (!this.canvasState.showRulers()) {
      // Clear all ruler canvases when hidden
      for (const ctx of [this.rulerTopCtx, this.rulerBottomCtx, this.rulerLeftCtx, this.rulerRightCtx]) {
        if (ctx) ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      }
      return;
    }

    const { scale, offsetX, offsetY } = this.canvasState.transform();
    const style = getComputedStyle(this.elementRef.nativeElement);
    const bgColor = style.getPropertyValue('--mat-sys-surface-variant').trim() || '#e0e0e0';
    const textColor = style.getPropertyValue('--mat-sys-on-surface-variant').trim() || '#555555';

    const params: RulerParams = {
      scale,
      offsetX,
      offsetY,
      canvasWidth: this.canvasState.canvasWidth(),
      canvasHeight: this.canvasState.canvasHeight(),
      bgColor,
      textColor,
      gridType: this.canvasState.gridType(),
      triangularA: this.canvasState.triangularA(),
      triangularD: this.canvasState.triangularD(),
    };

    if (this.rulerTopCtx) renderColumnRuler(this.rulerTopCtx, params);
    if (this.rulerBottomCtx) renderColumnRuler(this.rulerBottomCtx, params);
    if (this.rulerLeftCtx) renderRowRuler(this.rulerLeftCtx, { ...params, rowParity: 'odd' });
    if (this.rulerRightCtx) renderRowRuler(this.rulerRightCtx, { ...params, rowParity: 'even' });
  }

  private requestCrosshairRender(): void {
    if (this.crosshairFrameId) return;
    this.crosshairFrameId = requestAnimationFrame(() => {
      this.crosshairFrameId = 0;
      this.renderCrosshair();
    });
  }

  private renderCrosshair(): void {
    const ctx = this.crosshairCtx;
    if (!ctx) return;
    const { width, height } = ctx.canvas;
    ctx.clearRect(0, 0, width, height);
    if (!this.canvasState.showRulers()) return;
    if (this.cursorX < 0 || this.cursorY < 0) return;

    ctx.save();
    ctx.strokeStyle = '#8b0000';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.85;
    // Align to pixel boundary to avoid sub-pixel blur.
    const x = Math.floor(this.cursorX) + 0.5;
    const y = Math.floor(this.cursorY) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
    ctx.restore();
  }

  // --- Pointer event handlers ---

  onPointerDown(e: PointerEvent): void {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const rect = this.canvasRef().nativeElement.getBoundingClientRect();
    this.gestureService.handlePointerDown(e, rect);
  }

  onPointerMove(e: PointerEvent): void {
    this.gestureService.handlePointerMove(e);
    const rect = this.elementRef.nativeElement.getBoundingClientRect();
    this.cursorX = e.clientX - rect.left;
    this.cursorY = e.clientY - rect.top;
    this.requestCrosshairRender();
  }

  onPointerUp(e: PointerEvent): void {
    this.gestureService.handlePointerUp(e);
  }

  onPointerCancel(e: PointerEvent): void {
    this.gestureService.handlePointerCancel(e);
  }

  onPointerLeave(_e: PointerEvent): void {
    this.cursorX = -1;
    this.cursorY = -1;
    this.requestCrosshairRender();
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
    const tool = this.toolService.activeTool;
    if (!tool) return;

    // Pan tool operates entirely in screen space — bypass pixel mapping.
    if (tool.type === ToolType.Pan) {
      this.handlePanDraw(screenX, screenY, phase);
      return;
    }

    const canvas = this.canvasRef().nativeElement;
    const rect = canvas.getBoundingClientRect();
    const pixel = this.canvasState.screenToPixel(screenX, screenY, rect);

    // For 'end' phase we must always call onPointerUp to finalise the
    // command, even when the pointer is over a gap or outside the grid.
    // For 'start'/'move' we need a valid pixel coordinate.
    if (!pixel && phase !== 'end') return;

    const activeLayer = this.layerService.activeLayer();
    if (!activeLayer) return;

    const ctx: ToolContext = {
      coord: pixel ?? { x: 0, y: 0 },
      layerIndex: this.layerService.activeLayerIndex(),
      canvasWidth: this.canvasState.bufferWidth(),
      canvasHeight: this.canvasState.bufferHeight(),
      visualColumns: this.canvasState.canvasWidth(),
      primaryColor: this.colorService.primaryColor(),
      secondaryColor: this.colorService.secondaryColor(),
      isSecondary: false,
      gridType: this.canvasState.gridType(),
      triangularA: this.canvasState.gridType() === 'triangular' ? this.canvasState.triangularA() : undefined,
      triangularD: this.canvasState.gridType() === 'triangular' ? this.canvasState.triangularD() : undefined,
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
                  ctx.gridType,
                  ctx.triangularA,
                  ctx.triangularD,
                )
              : new DrawCommand(
                  this.layerService,
                  ctx.layerIndex,
                  ctx.canvasWidth,
                  result.modifiedPixels,
                  undefined,
                  ctx.gridType,
                  ctx.triangularA,
                  ctx.triangularD,
                );
          // Don't execute — pixels already applied by the tool
          this.historyService['undoStack'].update((s) => [...s, command]);
          this.historyService['redoStack'].set([]);
        }
        break;
    }

    this.requestRender();
  }

  private handlePanDraw(screenX: number, screenY: number, phase: 'start' | 'move' | 'end'): void {
    switch (phase) {
      case 'start':
        this.panLastX = screenX;
        this.panLastY = screenY;
        this.isPanning = true;
        break;
      case 'move': {
        const dx = screenX - this.panLastX;
        const dy = screenY - this.panLastY;
        this.canvasState.pan(dx, dy);
        this.panLastX = screenX;
        this.panLastY = screenY;
        break;
      }
      case 'end':
        this.isPanning = false;
        break;
    }
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
