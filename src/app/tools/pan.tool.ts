import { Tool, ToolType, ToolContext, ToolResult } from '../models';

/**
 * Pan tool — moves the viewport by dragging.
 *
 * This tool makes no pixel mutations; it delegates all viewport movement to
 * `CanvasStateService.pan()`, which is called from `CanvasViewportComponent`
 * using raw screen-space deltas tracked there independently. The three pointer
 * methods always return null.
 *
 * The cursor is 'grab' at rest. The canvas-viewport component switches it to
 * 'grabbing' while a drag is active via a host style binding.
 */
export class PanTool implements Tool {
  readonly type = ToolType.Pan;
  readonly icon = 'pan_tool';
  readonly label = 'Pan';
  readonly cursor = 'grab';

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onPointerDown(_ctx: ToolContext, _layerData: Uint8ClampedArray): ToolResult | null {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onPointerMove(_ctx: ToolContext, _layerData: Uint8ClampedArray): ToolResult | null {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onPointerUp(_ctx: ToolContext, _layerData: Uint8ClampedArray): ToolResult | null {
    return null;
  }
}
