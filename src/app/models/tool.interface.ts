import { Color } from './color.model';
import { GridType } from './project.model';

/** Coordinate on the canvas in pixel space */
export interface PixelCoord {
  x: number;
  y: number;
}

/** Context passed to tools on pointer events */
export interface ToolContext {
  /** Pixel coordinate on the canvas (in buffer space) */
  coord: PixelCoord;
  /** Active layer index */
  layerIndex: number;
  /** Buffer width (for offset calculation: (y * canvasWidth + x) * 4) */
  canvasWidth: number;
  /** Buffer height */
  canvasHeight: number;
  /** Number of visual columns (for peyote: the actual visual column count) */
  visualColumns: number;
  /** Primary selected color */
  primaryColor: Color;
  /** Secondary selected color */
  secondaryColor: Color;
  /** Whether the secondary button was used (right-click or long-press secondary) */
  isSecondary: boolean;
  /** Grid type for coordinate mapping */
  gridType: GridType;
  /** Whether the Shift key was held during this pointer event */
  shiftKey?: boolean;
  /** First-row width for triangular grids */
  triangularA?: number;
  /** Per-row growth for triangular grids */
  triangularD?: number;
  /** Fractional growth numerator for triangular grids */
  triangularDNum?: number;
  /** Fractional growth denominator for triangular grids */
  triangularDDen?: number;
  /** Phase shift (0..dDen-1) for triangular grids */
  triangularShift?: number;
  /**
   * Bead width-to-height aspect ratio at the current zoom level.
   * For square/peyote grids this is 1. For triangular grids the width
   * is narrower than the height to produce the correct wedge angle.
   * Use this in shape tools to map buffer coords to a physically correct
   * intermediate space before computing ellipses or rectangles.
   */
  beadAspectRatio?: number;
}

export enum ToolType {
  Pencil = 'pencil',
  Eraser = 'eraser',
  Line = 'line',
  Rectangle = 'rectangle',
  Ellipse = 'ellipse',
  Fill = 'fill',
  Eyedropper = 'eyedropper',
  Move = 'move',
  Pan = 'pan',
  Rotate = 'rotate',
}

export interface Tool {
  readonly type: ToolType;
  readonly icon: string;
  readonly label: string;
  readonly cursor: string;

  onPointerDown(ctx: ToolContext, layerData: Uint8ClampedArray): ToolResult | null;
  onPointerMove(ctx: ToolContext, layerData: Uint8ClampedArray): ToolResult | null;
  onPointerUp(ctx: ToolContext, layerData: Uint8ClampedArray): ToolResult | null;

  /** Optional: preview overlay while drawing (e.g., line/rect preview) */
  getPreview?(): PixelCoord[];
}

export interface ToolResult {
  /** Pixels that were modified: position + old and new color */
  modifiedPixels: ModifiedPixel[];
}

export interface ModifiedPixel {
  coord: PixelCoord;
  oldColor: Color;
  newColor: Color;
}
