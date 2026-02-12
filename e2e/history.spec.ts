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

/**
 * Wait for the canvas render loop (requestAnimationFrame) to complete.
 * We request two frames to be safe – one to schedule the render, one to
 * ensure it has flushed.
 */
async function waitForRender(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

/**
 * Read the RGBA value of a single pixel on the visible `<canvas>` element at
 * the given *screen-relative* position (relative to the canvas bounding box).
 */
async function getCanvasPixel(page: Page, x: number, y: number): Promise<RGBA> {
  return page.evaluate(
    ({ px, py }) => {
      const canvas = document.querySelector('app-canvas-viewport canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const [r, g, b, a] = ctx.getImageData(px, py, 1, 1).data;
      return { r, g, b, a };
    },
    { px: x, py: y },
  );
}

/** Returns true when two RGBA values are identical. */
function colorsEqual(a: RGBA, b: RGBA): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}

/**
 * Simulate a single-pixel draw stroke on the canvas at a given screen
 * position (relative to the **canvas element**, not the page).
 */
async function drawAt(page: Page, canvasX: number, canvasY: number): Promise<void> {
  const canvas = page.locator('app-canvas-viewport canvas');
  const box = (await canvas.boundingBox())!;

  // Convert canvas-relative to page-absolute coordinates
  const absX = box.x + canvasX;
  const absY = box.y + canvasY;

  await page.mouse.move(absX, absY);
  await page.mouse.down();
  // Small move to ensure the gesture service classifies this as a draw
  await page.mouse.move(absX + 1, absY + 1);
  await page.mouse.up();

  // Allow the render loop to paint
  await waitForRender(page);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('History – undo / redo', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the editor – this auto-creates a blank 32×32 project
    await page.goto('/editor');

    // Wait for the canvas to be visible and rendered
    await page.locator('app-canvas-viewport canvas').waitFor({ state: 'visible' });
    await waitForRender(page);
  });

  // -- Undo / Redo button state on fresh project -------------------------

  test('undo and redo buttons are disabled on a fresh project', async ({ page }) => {
    const undoBtn = page.locator('button[aria-label="Undo"]');
    const redoBtn = page.locator('button[aria-label="Redo"]');

    await expect(undoBtn).toBeDisabled();
    await expect(redoBtn).toBeDisabled();
  });

  // -- Single draw → undo ------------------------------------------------

  test('undo reverts a drawn pixel to its original color', async ({ page }) => {
    // The default scale is 10 and offset is (0,0), so logical pixel (5,5)
    // maps to screen position ~(50–59, 50–59) on the canvas. We pick the
    // centre of that cell: (55, 55).
    const screenX = 55;
    const screenY = 55;

    // 1. Capture the baseline pixel (includes the checkerboard background)
    const baseline = await getCanvasPixel(page, screenX, screenY);

    // 2. Draw at that position (pencil is the default active tool)
    await drawAt(page, screenX, screenY);

    // 3. Pixel should differ from the baseline (drawn colour overlaid)
    const afterDraw = await getCanvasPixel(page, screenX, screenY);
    expect(colorsEqual(afterDraw, baseline)).toBe(false);

    // 4. Undo
    const undoBtn = page.locator('button[aria-label="Undo"]');
    await expect(undoBtn).toBeEnabled();
    await undoBtn.click();
    await waitForRender(page);

    // 5. Pixel should match the baseline again
    const afterUndo = await getCanvasPixel(page, screenX, screenY);
    expect(colorsEqual(afterUndo, baseline)).toBe(true);

    // 6. Undo button should be disabled (only one action was performed)
    await expect(undoBtn).toBeDisabled();
  });

  // -- Undo → Redo --------------------------------------------------------

  test('redo restores an undone pixel', async ({ page }) => {
    const screenX = 55;
    const screenY = 55;

    // Capture baseline
    const baseline = await getCanvasPixel(page, screenX, screenY);

    // Draw
    await drawAt(page, screenX, screenY);
    const drawnColor = await getCanvasPixel(page, screenX, screenY);
    expect(colorsEqual(drawnColor, baseline)).toBe(false);

    // Undo
    const undoBtn = page.locator('button[aria-label="Undo"]');
    await undoBtn.click();
    await waitForRender(page);

    const afterUndo = await getCanvasPixel(page, screenX, screenY);
    expect(colorsEqual(afterUndo, baseline)).toBe(true);

    // Redo
    const redoBtn = page.locator('button[aria-label="Redo"]');
    await expect(redoBtn).toBeEnabled();
    await redoBtn.click();
    await waitForRender(page);

    // Pixel should match the original drawn colour
    const afterRedo = await getCanvasPixel(page, screenX, screenY);
    expect(afterRedo.r).toBe(drawnColor.r);
    expect(afterRedo.g).toBe(drawnColor.g);
    expect(afterRedo.b).toBe(drawnColor.b);
    expect(afterRedo.a).toBe(drawnColor.a);

    // Redo should now be disabled, undo should be enabled
    await expect(redoBtn).toBeDisabled();
    await expect(undoBtn).toBeEnabled();
  });

  // -- New draw after undo clears redo ------------------------------------

  test('drawing after undo clears the redo stack', async ({ page }) => {
    const screenX = 55;
    const screenY = 55;

    // Capture baseline
    const baseline = await getCanvasPixel(page, screenX, screenY);

    // Draw and then undo
    await drawAt(page, screenX, screenY);
    expect(colorsEqual(await getCanvasPixel(page, screenX, screenY), baseline)).toBe(false);

    const undoBtn = page.locator('button[aria-label="Undo"]');
    await undoBtn.click();
    await waitForRender(page);

    // Now draw at a different position
    const screenX2 = 105;
    const screenY2 = 105;
    const baseline2 = await getCanvasPixel(page, screenX2, screenY2);
    await drawAt(page, screenX2, screenY2);

    // Redo should be disabled because the new draw cleared the redo stack
    const redoBtn = page.locator('button[aria-label="Redo"]');
    await expect(redoBtn).toBeDisabled();

    // The new pixel should differ from its baseline
    const newPixel = await getCanvasPixel(page, screenX2, screenY2);
    expect(colorsEqual(newPixel, baseline2)).toBe(false);
  });

  // -- Multiple undo / redo -----------------------------------------------

  test('multiple draws can be undone and redone sequentially', async ({ page }) => {
    // Draw at two distinct positions
    const pos1 = { x: 55, y: 55 };
    const pos2 = { x: 105, y: 105 };

    // Capture baselines before drawing
    const baseline1 = await getCanvasPixel(page, pos1.x, pos1.y);
    const baseline2 = await getCanvasPixel(page, pos2.x, pos2.y);

    await drawAt(page, pos1.x, pos1.y);
    await drawAt(page, pos2.x, pos2.y);

    // Both pixels should differ from their baselines
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

    await expect(undoBtn).toBeDisabled();

    // Redo first draw
    await redoBtn.click();
    await waitForRender(page);
    expect(colorsEqual(await getCanvasPixel(page, pos1.x, pos1.y), baseline1)).toBe(false);
    expect(colorsEqual(await getCanvasPixel(page, pos2.x, pos2.y), baseline2)).toBe(true);

    // Redo second draw
    await redoBtn.click();
    await waitForRender(page);
    expect(colorsEqual(await getCanvasPixel(page, pos2.x, pos2.y), baseline2)).toBe(false);

    await expect(redoBtn).toBeDisabled();
  });
});
