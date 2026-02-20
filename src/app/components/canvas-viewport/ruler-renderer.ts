/**
 * Pure rendering utilities for row and column ruler labels.
 * No Angular DI — these are plain functions, fully unit-testable.
 */
import { GridType } from '../../models';

/** Minimum screen-pixel gap between the centres of two adjacent labels. */
const MIN_LABEL_SPACING = 14;

const FONT = '9px monospace';

export interface RulerParams {
  /** Current zoom scale (screen pixels per canvas pixel). */
  scale: number;
  /** Viewport pan X offset in screen pixels. */
  offsetX: number;
  /** Viewport pan Y offset in screen pixels. */
  offsetY: number;
  /** Canvas width in pixels (number of columns). */
  canvasWidth: number;
  /** Canvas height in pixels (number of rows). */
  canvasHeight: number;
  /** CSS colour string for the ruler background (e.g. a theme surface colour). */
  bgColor: string;
  /** CSS colour string for the ruler label text. */
  textColor: string;
  /** Grid type — used to add peyote half-offset row marks. */
  gridType: GridType;
  /**
   * Which row numbers to display on this ruler strip.
   * 'odd'  → left ruler  (1, 3, 5 …)
   * 'even' → right ruler (2, 4, 6 …)
   * 'all'  → show every label (default)
   */
  rowParity?: 'all' | 'odd' | 'even';
  /**
   * First-row pixel count for triangular grids (triangularA parameter).
   * Required for correct ruler rendering on triangular grids.
   */
  triangularA?: number;
  /**
   * Per-row growth parameter for triangular grids (triangularD parameter).
   * Required for correct ruler rendering on triangular grids.
   */
  triangularD?: number;
}

/**
 * Render 1-indexed column numbers onto a horizontal ruler canvas
 * (used for both the top and bottom rulers).
 */
export function renderColumnRuler(
  ctx: CanvasRenderingContext2D,
  params: RulerParams,
): void {
  const { canvas } = ctx;
  if (canvas.width === 0 || canvas.height === 0) return;

  const { scale, offsetX, canvasWidth, canvasHeight, bgColor, textColor, gridType, triangularA, triangularD } = params;
  const vpWidth = canvas.width;
  const rulerHeight = canvas.height;

  ctx.clearRect(0, 0, vpWidth, rulerHeight);
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, vpWidth, rulerHeight);

  ctx.font = FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = textColor;

  const midY = rulerHeight / 2;
  let lastDrawnX = -Infinity;

  // Triangular odd-d: stride-2 horizontal pixel spacing and labels anchored to
  // the widest row (last row for positive d), where centerOffset = 0.
  if (gridType === 'triangular' && triangularA !== undefined && triangularD !== undefined && triangularD % 2 !== 0) {
    const maxWidth = triangularA + triangularD * Math.max(0, canvasHeight - 1);
    for (let c = 0; c < maxWidth; c++) {
      const screenX = c * 2 * scale + offsetX + scale / 2;
      if (screenX < 0 || screenX > vpWidth) continue;
      if (screenX - lastDrawnX < MIN_LABEL_SPACING) continue;
      ctx.fillText(String(c + 1), screenX, midY);
      lastDrawnX = screenX;
    }
    return;
  }

  for (let c = 0; c < canvasWidth; c++) {
    const screenX = c * scale + offsetX + scale / 2;
    if (screenX < 0 || screenX > vpWidth) continue;
    if (screenX - lastDrawnX < MIN_LABEL_SPACING) continue;

    ctx.fillText(String(c + 1), screenX, midY);
    lastDrawnX = screenX;
  }
}

/**
 * Render 1-indexed row numbers onto a vertical ruler canvas
 * (used for both the left and right rulers).
 *
 * For peyote grids, bead rows in odd columns are shifted down by half a bead,
 * so a second set of marks is produced at those offsets. Both sets carry the
 * same 1-based row number (they share the canvas row index). Marks are drawn
 * in ascending screen-Y order; the MIN_LABEL_SPACING guard prevents crowding
 * at low zoom levels.
 */
export function renderRowRuler(
  ctx: CanvasRenderingContext2D,
  params: RulerParams,
): void {
  const { canvas } = ctx;
  if (canvas.width === 0 || canvas.height === 0) return;

  const { scale, offsetY, canvasHeight, bgColor, textColor, gridType, triangularD } = params;
  const rulerWidth = canvas.width;
  const vpHeight = canvas.height;

  ctx.clearRect(0, 0, rulerWidth, vpHeight);
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, rulerWidth, vpHeight);

  ctx.font = FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = textColor;

  const midX = rulerWidth / 2;
  const isPeyote = gridType === 'peyote';

  // Collect all unique vertical bead-centre positions, then assign sequential
  // 1-based row numbers in screen-Y order.
  const positions: number[] = [];

  // Triangular odd-d: rows are spaced at scale/2 vertically (peyote-style row
  // pitch). Each row has a single bead centre at r*(scale/2) + scale/2.
  if (gridType === 'triangular' && triangularD !== undefined && triangularD % 2 !== 0) {
    for (let r = 0; r < canvasHeight; r++) {
      positions.push(r * (scale / 2) + offsetY + scale / 2);
    }
  } else {
    // For peyote, canvasHeight = visual rows.  beadsPerColumn = ceil(canvasHeight/2)
    // for even columns, floor(canvasHeight/2) for odd columns.
    const beadsEven = isPeyote ? Math.ceil(canvasHeight / 2) : canvasHeight;
    const beadsOdd = isPeyote ? Math.floor(canvasHeight / 2) : canvasHeight;

    for (let r = 0; r < beadsEven; r++) {
      // Even-column bead centre (all grid types).
      positions.push(r * scale + offsetY + scale / 2);
    }

    if (isPeyote) {
      for (let r = 0; r < beadsOdd; r++) {
        // Odd-column bead centre: shifted down by scale/2 relative to even columns.
        positions.push(r * scale + offsetY + scale);
      }
    }

    positions.sort((a, b) => a - b);
  }

  const parity = params.rowParity ?? 'all';
  let lastDrawnY = -Infinity;
  for (let i = 0; i < positions.length; i++) {
    const rowNumber = i + 1;
    if (parity === 'odd' && rowNumber % 2 === 0) continue;
    if (parity === 'even' && rowNumber % 2 === 1) continue;
    const sy = positions[i];
    if (sy < 0 || sy > vpHeight) continue;
    if (sy - lastDrawnY < MIN_LABEL_SPACING) continue;
    ctx.fillText(String(rowNumber), midX, sy);
    lastDrawnY = sy;
  }
}
