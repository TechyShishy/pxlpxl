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
  /** First-row width for triangular grids */
  triangularA?: number;
  /** Per-row growth for triangular grids */
  triangularD?: number;
  /** Fractional growth numerator for triangular grids */
  triangularDNum?: number;
  /** Fractional growth denominator for triangular grids */
  triangularDDen?: number;
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
