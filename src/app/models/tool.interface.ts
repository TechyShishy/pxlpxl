import { Color } from './color.model';

/** Coordinate on the canvas in pixel space */
export interface PixelCoord {
  x: number;
  y: number;
}

/** Context passed to tools on pointer events */
export interface ToolContext {
  /** Pixel coordinate on the canvas */
  coord: PixelCoord;
  /** Active layer index */
  layerIndex: number;
  /** Canvas width in pixels */
  canvasWidth: number;
  /** Canvas height in pixels */
  canvasHeight: number;
  /** Primary selected color */
  primaryColor: Color;
  /** Secondary selected color */
  secondaryColor: Color;
  /** Whether the secondary button was used (right-click or long-press secondary) */
  isSecondary: boolean;
}

export enum ToolType {
  Pencil = 'pencil',
  Eraser = 'eraser',
  Line = 'line',
  Rectangle = 'rectangle',
  Ellipse = 'ellipse',
  Fill = 'fill',
  Eyedropper = 'eyedropper',
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
