import { test, expect, Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function waitForRender(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

const MAIN_CANVAS = 'app-canvas-viewport canvas:not([aria-hidden])';

async function getCanvasPixel(page: Page, x: number, y: number): Promise<RGBA> {
  return page.evaluate(
    ({ px, py }) => {
      const canvas = document.querySelector(
        'app-canvas-viewport canvas:not([aria-hidden])',
      ) as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const [r, g, b, a] = ctx.getImageData(px, py, 1, 1).data;
      return { r, g, b, a };
    },
    { px: x, py: y },
  );
}

function colorsEqual(a: RGBA, b: RGBA): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}

async function drawAt(page: Page, canvasX: number, canvasY: number): Promise<void> {
  const canvas = page.locator(MAIN_CANVAS);
  const box = (await canvas.boundingBox())!;
  const absX = box.x + canvasX;
  const absY = box.y + canvasY;

  await page.mouse.move(absX, absY);
  await page.mouse.down();
  await page.mouse.move(absX + 1, absY + 1);
  await page.mouse.up();
  await waitForRender(page);
}

/**
 * Create a triangular project via File menu → New Project dialog.
 */
async function createTriangularProject(
  page: Page,
  name: string,
  a: number,
  d: number,
  rows: number,
): Promise<void> {
  await page.locator('button[aria-label="File menu"]').click();
  await page.getByRole('menuitem', { name: 'New Project' }).click();

  const dialog = page.locator('mat-dialog-container');
  await dialog.waitFor({ state: 'visible' });

  const nameInput = dialog.locator('input[aria-label="Project name"]');
  await nameInput.fill(name);

  const gridSelect = dialog.locator('mat-select[aria-label="Grid type"]');
  await gridSelect.click();
  await page.getByRole('option', { name: 'Triangular' }).click();

  const aInput = dialog.locator('input[aria-label="First row width (a)"]');
  await aInput.waitFor({ state: 'visible' });
  await aInput.fill(String(a));

  const dNumInput = dialog.locator('input[aria-label="Number of increases per cycle (dNum)"]');
  await dNumInput.fill(String(d));

  const dDenInput = dialog.locator('input[aria-label="Cycle length in rows (dDen)"]');
  await dDenInput.fill('1');

  const rInput = dialog.locator('input[aria-label="Number of rows (R)"]');
  await rInput.fill(String(rows));

  await dialog.getByRole('button', { name: 'Create' }).click();
  // Wait for dialog to fully close (animation + afterClosed subscription)
  await dialog.waitFor({ state: 'detached' });
  await waitForRender(page);
}

/**
 * Compute screen-space bounding box for a triangular-grid pixel.
 * Mirrors GridService.pixelToScreen for odd-d grids with 2-stride layout.
 * Accounts for non-square bead dimensions (beadSize) via the xScale factor
 * that makes wedge beads the correct width for radial tiling.
 */
function triangularPixelBox(
  bx: number,
  by: number,
  scale: number,
  a: number,
  d: number,
  totalRows: number,
): { left: number; top: number; right: number; bottom: number } {
  const maxWidth = a + d * (totalRows - 1);
  let beadWidth = scale;
  const beadHeight = scale;

  if (d % 2 === 1) {
    // Odd-d: 2-stride horizontal, half-row vertical interleaving
    // Compute bead width from xScale (mirrors CanvasStateService.beadSize)
    const sideCount = Math.round(3 / d); // dNum=d, dDen=1
    if (sideCount >= 3) {
      const halfWidth = maxWidth * scale;
      const rowSpacing = scale / 2;
      const dy = (totalRows - 0.5) * rowSpacing;
      const xScale = (Math.tan(Math.PI / sideCount) * dy) / halfWidth;
      beadWidth = scale * xScale;
    }
    const rowWidth = a + d * by;
    const centerOffset = maxWidth - rowWidth;
    const sx = (centerOffset + bx * 2) * beadWidth;
    const sy = by * Math.ceil(beadHeight / 2);
    return { left: sx, top: sy, right: sx + beadWidth, bottom: sy + beadHeight };
  }
  // Even-d: standard row-major layout (sideCount < 3, beadWidth = scale)
  const rowWidth = a + d * by;
  const leftPad = ((maxWidth - rowWidth) / 2) * beadWidth;
  const sx = leftPad + bx * beadWidth;
  const sy = by * beadHeight;
  return { left: sx, top: sy, right: sx + beadWidth, bottom: sy + beadHeight };
}

/**
 * Draw a multi-pixel stroke: pointer down at start, moves through each
 * waypoint, then pointer up at the given end position (which may be a
 * gap between pixels).
 */
async function drawStroke(
  page: Page,
  waypoints: { canvasX: number; canvasY: number }[],
  endCanvasX: number,
  endCanvasY: number,
): Promise<void> {
  const canvas = page.locator(MAIN_CANVAS);
  const box = (await canvas.boundingBox())!;

  const first = waypoints[0];
  await page.mouse.move(box.x + first.canvasX, box.y + first.canvasY);
  await page.mouse.down();

  for (let i = 1; i < waypoints.length; i++) {
    await page.mouse.move(box.x + waypoints[i].canvasX, box.y + waypoints[i].canvasY);
  }

  // Lift at the specified end position (may be a gap)
  await page.mouse.move(box.x + endCanvasX, box.y + endCanvasY);
  await page.mouse.up();
  await waitForRender(page);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('History (undo/redo) – triangular grid', () => {
  const A = 1;
  const D = 1;
  const ROWS = 10;

  test.beforeEach(async ({ page }) => {
    await page.goto('/editor');
    await page.locator(MAIN_CANVAS).waitFor({ state: 'visible' });
    await waitForRender(page);

    await createTriangularProject(page, 'TriHistoryTest', A, D, ROWS);
  });

  test('undo reverts a drawn pixel on a triangular grid', async ({ page }) => {
    const scale = 10;
    // Pick pixel (2, 4) — row 4 has width = 1 + 4 = 5, so x=2 is valid
    const box = triangularPixelBox(2, 4, scale, A, D, ROWS);
    const sampleX = Math.round((box.left + box.right) / 2);
    const sampleY = Math.round((box.top + box.bottom) / 2);

    // Capture baseline
    const baseline = await getCanvasPixel(page, sampleX, sampleY);

    // Draw
    await drawAt(page, sampleX, sampleY);
    const afterDraw = await getCanvasPixel(page, sampleX, sampleY);
    expect(
      colorsEqual(afterDraw, baseline),
      'Drawing should change the pixel color',
    ).toBe(false);

    // Undo
    const undoBtn = page.locator('button[aria-label="Undo"]');
    await expect(undoBtn).toBeEnabled();
    await undoBtn.click();
    await waitForRender(page);

    // Pixel should match the baseline again
    const afterUndo = await getCanvasPixel(page, sampleX, sampleY);
    expect(
      colorsEqual(afterUndo, baseline),
      `After undo, pixel should match baseline. Got r=${afterUndo.r},g=${afterUndo.g},b=${afterUndo.b},a=${afterUndo.a} vs baseline r=${baseline.r},g=${baseline.g},b=${baseline.b},a=${baseline.a}`,
    ).toBe(true);
  });

  test('redo restores an undone pixel on a triangular grid', async ({ page }) => {
    const scale = 10;
    const box = triangularPixelBox(2, 4, scale, A, D, ROWS);
    const sampleX = Math.round((box.left + box.right) / 2);
    const sampleY = Math.round((box.top + box.bottom) / 2);

    const baseline = await getCanvasPixel(page, sampleX, sampleY);

    // Draw
    await drawAt(page, sampleX, sampleY);
    const drawnColor = await getCanvasPixel(page, sampleX, sampleY);
    expect(colorsEqual(drawnColor, baseline)).toBe(false);

    // Undo
    const undoBtn = page.locator('button[aria-label="Undo"]');
    await undoBtn.click();
    await waitForRender(page);
    expect(colorsEqual(await getCanvasPixel(page, sampleX, sampleY), baseline)).toBe(true);

    // Redo
    const redoBtn = page.locator('button[aria-label="Redo"]');
    await expect(redoBtn).toBeEnabled();
    await redoBtn.click();
    await waitForRender(page);

    const afterRedo = await getCanvasPixel(page, sampleX, sampleY);
    expect(afterRedo.r).toBe(drawnColor.r);
    expect(afterRedo.g).toBe(drawnColor.g);
    expect(afterRedo.b).toBe(drawnColor.b);
    expect(afterRedo.a).toBe(drawnColor.a);
  });

  test('undo on a deeper row pixel restores correctly', async ({ page }) => {
    const scale = 10;
    // Pixel (4, 7) — row 7 has width = 1 + 7 = 8, so x=4 is valid
    const box = triangularPixelBox(4, 7, scale, A, D, ROWS);
    const sampleX = Math.round((box.left + box.right) / 2);
    const sampleY = Math.round((box.top + box.bottom) / 2);

    const baseline = await getCanvasPixel(page, sampleX, sampleY);

    await drawAt(page, sampleX, sampleY);
    const afterDraw = await getCanvasPixel(page, sampleX, sampleY);
    expect(
      colorsEqual(afterDraw, baseline),
      'Drawing should change the pixel color on a deeper row',
    ).toBe(false);

    const undoBtn = page.locator('button[aria-label="Undo"]');
    await undoBtn.click();
    await waitForRender(page);

    const afterUndo = await getCanvasPixel(page, sampleX, sampleY);
    expect(
      colorsEqual(afterUndo, baseline),
      `After undo on deeper row, pixel should match baseline. Got r=${afterUndo.r},g=${afterUndo.g},b=${afterUndo.b},a=${afterUndo.a} vs baseline r=${baseline.r},g=${baseline.g},b=${baseline.b},a=${baseline.a}`,
    ).toBe(true);
  });

  test('multiple draws can be undone and redone on a triangular grid', async ({ page }) => {
    const scale = 10;
    // Two distinct pixels on different rows
    const box1 = triangularPixelBox(1, 3, scale, A, D, ROWS);
    const box2 = triangularPixelBox(3, 6, scale, A, D, ROWS);

    const pos1 = {
      x: Math.round((box1.left + box1.right) / 2),
      y: Math.round((box1.top + box1.bottom) / 2),
    };
    const pos2 = {
      x: Math.round((box2.left + box2.right) / 2),
      y: Math.round((box2.top + box2.bottom) / 2),
    };

    const baseline1 = await getCanvasPixel(page, pos1.x, pos1.y);
    const baseline2 = await getCanvasPixel(page, pos2.x, pos2.y);

    await drawAt(page, pos1.x, pos1.y);
    await drawAt(page, pos2.x, pos2.y);

    expect(colorsEqual(await getCanvasPixel(page, pos1.x, pos1.y), baseline1)).toBe(false);
    expect(colorsEqual(await getCanvasPixel(page, pos2.x, pos2.y), baseline2)).toBe(false);

    const undoBtn = page.locator('button[aria-label="Undo"]');
    const redoBtn = page.locator('button[aria-label="Redo"]');

    // Undo second draw
    await undoBtn.click();
    await waitForRender(page);
    expect(colorsEqual(await getCanvasPixel(page, pos2.x, pos2.y), baseline2)).toBe(true);
    expect(colorsEqual(await getCanvasPixel(page, pos1.x, pos1.y), baseline1)).toBe(false);

    // Undo first draw
    await undoBtn.click();
    await waitForRender(page);
    expect(colorsEqual(await getCanvasPixel(page, pos1.x, pos1.y), baseline1)).toBe(true);

    // Redo first draw
    await redoBtn.click();
    await waitForRender(page);
    expect(colorsEqual(await getCanvasPixel(page, pos1.x, pos1.y), baseline1)).toBe(false);
    expect(colorsEqual(await getCanvasPixel(page, pos2.x, pos2.y), baseline2)).toBe(true);

    // Redo second draw
    await redoBtn.click();
    await waitForRender(page);
    expect(colorsEqual(await getCanvasPixel(page, pos2.x, pos2.y), baseline2)).toBe(false);
  });

  test('three strokes ending in gaps undo in correct LIFO order', async ({ page }) => {
    const scale = 10;

    // Pick 3 pixels on separate rows so their screen areas don't overlap.
    const pix1 = triangularPixelBox(0, 2, scale, A, D, ROWS); // row 2
    const pix2 = triangularPixelBox(1, 5, scale, A, D, ROWS); // row 5
    const pix3 = triangularPixelBox(2, 8, scale, A, D, ROWS); // row 8

    const sample1 = {
      x: Math.round((pix1.left + pix1.right) / 2),
      y: Math.round((pix1.top + pix1.bottom) / 2),
    };
    const sample2 = {
      x: Math.round((pix2.left + pix2.right) / 2),
      y: Math.round((pix2.top + pix2.bottom) / 2),
    };
    const sample3 = {
      x: Math.round((pix3.left + pix3.right) / 2),
      y: Math.round((pix3.top + pix3.bottom) / 2),
    };

    // For odd-d triangular grids, there's a gap column between every pixel.
    // Compute a gap X position (one scale-width to the right of the pixel).
    const gap1x = pix1.right + Math.round(scale / 2);
    const gap2x = pix2.right + Math.round(scale / 2);
    const gap3x = pix3.right + Math.round(scale / 2);

    // Capture baselines
    const baseline1 = await getCanvasPixel(page, sample1.x, sample1.y);
    const baseline2 = await getCanvasPixel(page, sample2.x, sample2.y);
    const baseline3 = await getCanvasPixel(page, sample3.x, sample3.y);

    // Stroke 1: draw on pixel 1, lift in a gap
    await drawStroke(page, [{ canvasX: sample1.x, canvasY: sample1.y }], gap1x, sample1.y);
    expect(colorsEqual(await getCanvasPixel(page, sample1.x, sample1.y), baseline1)).toBe(false);

    // Stroke 2: draw on pixel 2, lift in a gap
    await drawStroke(page, [{ canvasX: sample2.x, canvasY: sample2.y }], gap2x, sample2.y);
    expect(colorsEqual(await getCanvasPixel(page, sample2.x, sample2.y), baseline2)).toBe(false);

    // Stroke 3: draw on pixel 3, lift in a gap
    await drawStroke(page, [{ canvasX: sample3.x, canvasY: sample3.y }], gap3x, sample3.y);
    expect(colorsEqual(await getCanvasPixel(page, sample3.x, sample3.y), baseline3)).toBe(false);

    const undoBtn = page.locator('button[aria-label="Undo"]');

    // Undo 1: should revert stroke 3 (LIFO — last drawn, first undone)
    await expect(undoBtn).toBeEnabled();
    await undoBtn.click();
    await waitForRender(page);
    expect(
      colorsEqual(await getCanvasPixel(page, sample3.x, sample3.y), baseline3),
      'First undo should revert the LAST stroke (pixel 3)',
    ).toBe(true);
    expect(
      colorsEqual(await getCanvasPixel(page, sample2.x, sample2.y), baseline2),
      'First undo should NOT revert stroke 2',
    ).toBe(false);
    expect(
      colorsEqual(await getCanvasPixel(page, sample1.x, sample1.y), baseline1),
      'First undo should NOT revert stroke 1',
    ).toBe(false);

    // Undo 2: should revert stroke 2
    await expect(undoBtn).toBeEnabled();
    await undoBtn.click();
    await waitForRender(page);
    expect(
      colorsEqual(await getCanvasPixel(page, sample2.x, sample2.y), baseline2),
      'Second undo should revert stroke 2',
    ).toBe(true);
    expect(
      colorsEqual(await getCanvasPixel(page, sample1.x, sample1.y), baseline1),
      'Second undo should NOT revert stroke 1',
    ).toBe(false);

    // Undo 3: should revert stroke 1
    await expect(undoBtn).toBeEnabled();
    await undoBtn.click();
    await waitForRender(page);
    expect(
      colorsEqual(await getCanvasPixel(page, sample1.x, sample1.y), baseline1),
      'Third undo should revert stroke 1',
    ).toBe(true);

    await expect(undoBtn).toBeDisabled();
  });
});
