import {
  Component,
  ChangeDetectionStrategy,
  inject,
  ElementRef,
  viewChild,
  afterNextRender,
  NgZone,
  effect,
  OnDestroy,
} from '@angular/core';
import { CanvasStateService } from '../../services/canvas-state.service';
import { LayerService } from '../../services/layer.service';
import { ToolService } from '../../services/tool.service';
import { ColorService } from '../../services/color.service';
import { HistoryService } from '../../services/history.service';
import { GestureService } from '../../services/gesture.service';
import { RenderService } from '../../services/render.service';
import { LayoutService } from '../../services/layout.service';
import { GridService } from '../../services/grid.service';
import { Color, ToolContext, GestureState, PixelCoord, colorInPalette, TriangularParams, pixelOffset } from '../../models';
import { renderColumnRuler, renderRowRuler, RulerParams } from './ruler-renderer';
import { DrawCommand } from '../../commands/draw.command';
import { FillCommand } from '../../commands/fill.command';
import { LayerCommand } from '../../commands/layer.command';
import { EyedropperTool } from '../../tools/eyedropper.tool';
import { MoveTool } from '../../tools/move.tool';
import { RotateTool } from '../../tools/rotate.tool';
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
export class CanvasViewportComponent implements OnDestroy {
  protected readonly canvasState = inject(CanvasStateService);
  private readonly layerService = inject(LayerService);
  private readonly toolService = inject(ToolService);
  private readonly colorService = inject(ColorService);
  private readonly historyService = inject(HistoryService);
  private readonly gestureService = inject(GestureService);
  private readonly renderService = inject(RenderService);
  private readonly layoutService = inject(LayoutService);
  private readonly gridService = inject(GridService);
  private readonly ngZone = inject(NgZone);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  protected get activeCursor(): string {
    const tool = this.toolService.activeTool;
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
  private resizeObserver: ResizeObserver | null = null;
  private cursorX = -1;
  private cursorY = -1;
  private previewPixels: PixelCoord[] = [];
  private previewColor: Color | undefined;
  /** Snapshot of the active layer buffer taken at the start of each draw stroke.
   * Used to revert the buffer cleanly when a two-finger pan cancels the stroke. */
  private strokeSnapshot: Uint8ClampedArray | null = null;
  private strokeLayerIndex = -1;

  /** Previous value of showClones for edge detection in effect. */
  private previousShowClones = this.canvasState.showClones();

  constructor() {
    // Set up gesture callbacks
    this.gestureService.onDraw = (x, y, phase, shiftKey) => this.handleDraw(x, y, phase, shiftKey);
    this.gestureService.onPinch = (scaleDelta, cx, cy) => this.handlePinch(scaleDelta);
    this.gestureService.onPan = (dx, dy) => {
      const rotation = this.canvasState.transform().rotation;
      if (rotation === 0) {
        this.canvasState.pan(dx, dy);
      } else {
        // Pan deltas arrive in screen space. The drawing offset is in pre-rotation
        // drawing space, so we must rotate the deltas into drawing space first.
        const a = (rotation * Math.PI) / 180;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        this.canvasState.pan(dx * cos + dy * sin, -dx * sin + dy * cos);
      }
    };
    this.gestureService.onEdgeSwipe = (dir) => this.handleEdgeSwipe(dir);
    this.gestureService.onDoubleTap = () => this.handleTapRotate('cw');
    this.gestureService.onTripleTap = () => this.handleTapRotate('ccw');

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
      this.canvasState.gridType();
      this.canvasState.triangularA();
      this.canvasState.triangularD();
      this.canvasState.triangularDNum();
      this.canvasState.triangularDDen();
      this.canvasState.triangularShift();
      this.canvasState.showClones();
      this.canvasState.absorptionState();
      this.layerService.layers();
      this.requestRender();
    });

    // Center the view when shadow clones are turned on
    effect(() => {
      const showClones = this.canvasState.showClones();
      const wasFalse = !this.previousShowClones;
      this.previousShowClones = showClones;
      if (showClones && wasFalse) {
        const canvas = this.canvasRef()?.nativeElement;
        if (canvas) {
          this.canvasState.centerOnClones(canvas.width, canvas.height);
        }
      }
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
      this.canvasState.triangularDNum();
      this.canvasState.triangularDDen();
      this.canvasState.triangularShift();
      this.requestRulerRender();
      this.requestCrosshairRender();
    });
  }

  ngOnDestroy(): void {
    // Cancel pending animation frames
    cancelAnimationFrame(this.animFrameId);
    cancelAnimationFrame(this.rulerFrameId);
    cancelAnimationFrame(this.crosshairFrameId);

    // Disconnect ResizeObserver
    this.resizeObserver?.disconnect();

    // Null out gesture callbacks to release component reference
    this.gestureService.onDraw = null;
    this.gestureService.onPinch = null;
    this.gestureService.onPan = null;
    this.gestureService.onEdgeSwipe = null;
    this.gestureService.onDoubleTap = null;
    this.gestureService.onTripleTap = null;
  }

  private setupCanvas(): void {
    const canvas = this.canvasRef().nativeElement;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });

    const getCtx = (ref: ElementRef<HTMLCanvasElement> | undefined) =>
      ref?.nativeElement.getContext('2d') ?? null;
    this.rulerTopCtx = getCtx(this.rulerTopRef());
    this.rulerBottomCtx = getCtx(this.rulerBottomRef());
    this.rulerLeftCtx = getCtx(this.rulerLeftRef());
    this.rulerRightCtx = getCtx(this.rulerRightRef());
    this.crosshairCtx = getCtx(this.crosshairRef());

    this.resizeCanvas();

    // Observe the main canvas element (not just the host) so that internal
    // grid-track changes (e.g. toggling rulers) trigger a buffer resize even
    // when the host element's outer dimensions haven't changed.
    const observer = new ResizeObserver(() => this.resizeCanvas());
    observer.observe(canvas);
    this.resizeObserver = observer;
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

    // Build per-candidate overlay groups from the current absorption state.
    let overlays: { pixels: PixelCoord[]; color: Color }[] | undefined;
    const absorption = this.canvasState.absorptionState();
    if (absorption) {
      const grouped = new Map<string, { pixels: PixelCoord[]; color: Color }>();
      for (const a of absorption.assignments) {
        const candidate = absorption.candidates[a.candidateIndex];
        const key = `${candidate.r},${candidate.g},${candidate.b},${candidate.a}`;
        if (!grouped.has(key)) grouped.set(key, { pixels: [], color: candidate });
        grouped.get(key)!.pixels.push({ x: a.bufX, y: a.bufY });
      }
      overlays = Array.from(grouped.values());
    }

    this.renderService.render(
      this.ctx,
      canvas.width,
      canvas.height,
      this.previewPixels,
      this.previewColor,
      overlays,
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

    if (!this.canvasState.showRulers() || this.canvasState.transform().rotation !== 0) {
      // Clear all ruler canvases when hidden or when the viewport is rotated
      // (rulers display drawing-space axis labels that become misleading when
      // the canvas orientation no longer matches the screen axes).
      for (const ctx of [
        this.rulerTopCtx,
        this.rulerBottomCtx,
        this.rulerLeftCtx,
        this.rulerRightCtx,
      ]) {
        if (ctx) ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      }
      return;
    }

    const { offsetX, offsetY } = this.canvasState.transform();
    const style = getComputedStyle(this.elementRef.nativeElement);
    const bgColor = style.getPropertyValue('--mat-sys-surface-variant').trim() || '#e0e0e0';
    const textColor = style.getPropertyValue('--mat-sys-on-surface-variant').trim() || '#555555';

    const params: RulerParams = {
      beadSize: this.canvasState.beadSize(),
      offsetX,
      offsetY,
      canvasWidth: this.canvasState.canvasWidth(),
      canvasHeight: this.canvasState.canvasHeight(),
      bgColor,
      textColor,
      gridType: this.canvasState.gridType(),
      triangularA: this.canvasState.triangularA(),
      triangularD: this.canvasState.triangularD(),
      triangularDNum: this.canvasState.triangularDNum(),
      triangularDDen: this.canvasState.triangularDDen(),
      triangularShift: this.canvasState.triangularShift(),
    };

    if (this.rulerTopCtx) renderColumnRuler(this.rulerTopCtx, { ...params, columnParity: 'odd' });
    if (this.rulerBottomCtx)
      renderColumnRuler(this.rulerBottomCtx, { ...params, columnParity: 'even' });
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
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Synthetic events (e.g. in tests) may not be in the active pointer list;
      // swallow the error so gesture handling still proceeds.
    }
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

  /**
   * Rotate the active layer by 90° CW (double-tap) or CCW (triple-tap).
   * Only fires when the Rotate tool is active.
   */
  private handleTapRotate(direction: 'cw' | 'ccw'): void {
    const tool = this.toolService.activeTool;
    if (tool?.type !== ToolType.Rotate) return;
    const rotateTool = tool as RotateTool;
    const activeLayer = this.layerService.activeLayer();
    if (!activeLayer) return;

    const isTriangular = this.gridService.isAnyTriangular(this.canvasState.gridType());
    const ctx: ToolContext = {
      coord: { x: 0, y: 0 },
      layerIndex: this.layerService.activeLayerIndex(),
      canvasWidth: this.canvasState.bufferWidth(),
      canvasHeight: this.canvasState.bufferHeight(),
      primaryColor: this.colorService.primaryColor(),
      secondaryColor: this.colorService.secondaryColor(),
      isSecondary: false,
      gridType: this.canvasState.gridType(),
      shiftKey: false,
      triangularA: isTriangular ? this.canvasState.triangularA() : undefined,
      triangularD: isTriangular ? this.canvasState.triangularD() : undefined,
      triangularDNum: isTriangular ? this.canvasState.triangularDNum() : undefined,
      triangularDDen: isTriangular ? this.canvasState.triangularDDen() : undefined,
      triangularShift: isTriangular ? this.canvasState.triangularShift() : undefined,
      beadAspectRatio: this.canvasState.beadSize().width / this.canvasState.beadSize().height,
    };

    const previousData = rotateTool.rotate90(direction, ctx, activeLayer.data);
    const nextData = new Uint8ClampedArray(activeLayer.data);
    // Skip if rotate90 bailed out (e.g. drag-rotate was mid-flight).
    const changed = nextData.some((v, i) => v !== previousData[i]);
    if (changed) {
      const label = direction === 'cw' ? 'Rotate layer 90° CW' : 'Rotate layer 90° CCW';
      const command = new LayerCommand(
        this.layerService,
        ctx.layerIndex,
        previousData,
        nextData,
        label,
      );
      this.historyService.pushExecuted(command);
    }
    this.requestRender();
  }

  private handleDraw(screenX: number, screenY: number, phase: 'start' | 'move' | 'end' | 'cancel', shiftKey = false): void {
    // When an absorption preview is active, taps cycle the pixel's candidate
    // assignment rather than dispatching to the active draw tool.
    const absorption = this.canvasState.absorptionState();
    if (absorption !== null) {
      if (phase === 'start') {
        const canvas = this.canvasRef().nativeElement;
        const rect = canvas.getBoundingClientRect();
        const pixel = this.canvasState.screenToPixel(screenX, screenY, rect);
        if (pixel) {
          const gridType = this.canvasState.gridType();
          const isTriangular = this.gridService.isAnyTriangular(gridType);
          const byteOff = pixelOffset(
            pixel.x,
            pixel.y,
            this.canvasState.bufferWidth(),
            gridType,
            isTriangular ? this.canvasState.triangularA() : undefined,
            isTriangular ? this.canvasState.triangularD() : undefined,
            isTriangular ? this.canvasState.triangularDNum() : undefined,
            isTriangular ? this.canvasState.triangularDDen() : undefined,
            isTriangular ? this.canvasState.triangularShift() : undefined,
          );
          this.canvasState.cycleAssignment(byteOff);
          this.requestRender();
        }
      }
      return; // swallow all draw events while absorption preview is active
    }

    const tool = this.toolService.activeTool;
    if (!tool) return;

    const canvas = this.canvasRef().nativeElement;
    const rect = canvas.getBoundingClientRect();
    const pixel = this.canvasState.screenToPixel(screenX, screenY, rect);

    // For 'end'/'cancel' we must always call onPointerUp to finalise the
    // command (or revert it), even when the pointer is over a gap or outside
    // the grid. For 'start'/'move' we need a valid pixel coordinate.
    if (!pixel && phase !== 'end' && phase !== 'cancel') return;

    const activeLayer = this.layerService.activeLayer();
    if (!activeLayer) return;

    const ctx: ToolContext = {
      coord: pixel ?? { x: 0, y: 0 },
      layerIndex: this.layerService.activeLayerIndex(),
      canvasWidth: this.canvasState.bufferWidth(),
      canvasHeight: this.canvasState.bufferHeight(),
      primaryColor: this.colorService.primaryColor(),
      secondaryColor: this.colorService.secondaryColor(),
      isSecondary: false,
      gridType: this.canvasState.gridType(),
      shiftKey,
      triangularA: this.gridService.isAnyTriangular(this.canvasState.gridType())
        ? this.canvasState.triangularA()
        : undefined,
      triangularD: this.gridService.isAnyTriangular(this.canvasState.gridType())
        ? this.canvasState.triangularD()
        : undefined,
      triangularDNum: this.gridService.isAnyTriangular(this.canvasState.gridType())
        ? this.canvasState.triangularDNum()
        : undefined,
      triangularDDen: this.gridService.isAnyTriangular(this.canvasState.gridType())
        ? this.canvasState.triangularDDen()
        : undefined,
      triangularShift: this.gridService.isAnyTriangular(this.canvasState.gridType())
        ? this.canvasState.triangularShift()
        : undefined,
      beadAspectRatio: this.canvasState.beadSize().width / this.canvasState.beadSize().height,
    };

    let result;
    switch (phase) {
      case 'start':
        // Snapshot the layer buffer BEFORE any mutations so we can restore it
        // cleanly if a two-finger pan cancels this stroke.
        this.strokeSnapshot = new Uint8ClampedArray(activeLayer.data);
        this.strokeLayerIndex = ctx.layerIndex;
        result = tool.onPointerDown(ctx, activeLayer.data);
        this.previewPixels = tool.getPreview?.() ?? [];
        this.previewColor = ctx.isSecondary ? ctx.secondaryColor : ctx.primaryColor;
        break;
      case 'move':
        result = tool.onPointerMove(ctx, activeLayer.data);
        this.previewPixels = tool.getPreview?.() ?? [];
        this.previewColor = ctx.isSecondary ? ctx.secondaryColor : ctx.primaryColor;
        break;
      case 'cancel': {
        // Two-finger gesture started mid-stroke: revert ALL buffer mutations
        // made since 'start' by restoring the pre-stroke snapshot.
        // Drain the tool's internal state without committing anything to history.
        tool.onPointerUp(ctx, activeLayer.data);
        if (this.strokeSnapshot && this.strokeLayerIndex === ctx.layerIndex) {
          activeLayer.data.set(this.strokeSnapshot);
        }
        this.strokeSnapshot = null;
        this.strokeLayerIndex = -1;
        this.previewPixels = [];
        this.previewColor = undefined;
        this.requestRender();
        return;
      }
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
            this.historyService.pushExecuted(command);
          }
          moveTool.resetSnapshot();
        } else if (tool.type === ToolType.Rotate) {
          const rotateTool = tool as RotateTool;
          const previousData = rotateTool.getOriginalData();
          if (previousData) {
            const nextData = new Uint8ClampedArray(activeLayer.data);
            // Skip identity rotations (e.g. zero-delta drag, immediate pointer-up)
            const changed = nextData.some((v, i) => v !== previousData[i]);
            if (changed) {
              const command = new LayerCommand(
                this.layerService,
                ctx.layerIndex,
                previousData,
                nextData,
                'Rotate layer',
              );
              // Don't execute — pixels already applied by the tool
              this.historyService.pushExecuted(command);
            }
          }
          rotateTool.resetSnapshot();
        } else if (result && result.modifiedPixels.length > 0) {
          const tri: TriangularParams | undefined = ctx.gridType === 'triangular'
            ? { a: ctx.triangularA, d: ctx.triangularD, dNum: ctx.triangularDNum, dDen: ctx.triangularDDen, shift: ctx.triangularShift }
            : undefined;
          const command =
            tool.type === 'fill'
              ? new FillCommand(
                  this.layerService,
                  ctx.layerIndex,
                  ctx.canvasWidth,
                  result.modifiedPixels,
                  ctx.gridType,
                  tri,
                )
              : new DrawCommand(
                  this.layerService,
                  ctx.layerIndex,
                  ctx.canvasWidth,
                  result.modifiedPixels,
                  undefined,
                  ctx.gridType,
                  tri,
                );
          // Don't execute — pixels already applied by the tool
          this.historyService.pushExecuted(command);

          // Auto-add any new colors painted in this stroke to the palette.
          const palette = this.colorService.palette();
          const seen = new Set<string>();
          for (const pixel of result.modifiedPixels) {
            const c = pixel.newColor;
            const key = `${c.r},${c.g},${c.b},${c.a}`;
            if (!seen.has(key)) {
              seen.add(key);
              if (!colorInPalette(c, palette)) {
                this.colorService.addToPalette(c);
              }
            }
          }
        }
        break;
    }

    // Clear stroke snapshot after every committed phase (start, move, end).
    // The 'cancel' path returns early and clears it there.
    if (phase === 'end') {
      this.strokeSnapshot = null;
      this.strokeLayerIndex = -1;
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
