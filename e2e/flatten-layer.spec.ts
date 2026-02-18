import { test, expect, Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

async function waitForRender(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

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

function colorsEqual(a: RGBA, b: RGBA): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}

/** Draw a stroke at the given canvas-relative position. */
async function drawAt(page: Page, canvasX: number, canvasY: number): Promise<void> {
  const canvas = page.locator('app-canvas-viewport canvas');
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
 * Open the "more options" menu for a layer by index (0 = topmost in the panel).
 */
async function openLayerMenu(page: Page, layerIndex: number): Promise<void> {
  const menuTrigger = page
    .locator('.layer-item')
    .nth(layerIndex)
    .locator('button[aria-label^="Layer options"]');
  await menuTrigger.click();
  // Wait for the Material overlay menu panel to be visible before any further interaction.
  await page.locator('.mat-mdc-menu-panel').waitFor({ state: 'visible' });
}

/**
 * Click a menu item by its accessible role name (partial match, case-insensitive).
 * The Material menu renders in an overlay outside the component tree.
 */
async function clickMenuItem(page: Page, label: string): Promise<void> {
  await page.getByRole('menuitem', { name: new RegExp(label, 'i') }).click();
  // Wait for the overlay to close so subsequent interactions aren't intercepted.
  await page.locator('.mat-mdc-menu-panel').waitFor({ state: 'hidden' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Flatten layer to above', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/editor');
    await page.locator('app-canvas-viewport canvas').waitFor({ state: 'visible' });
    await waitForRender(page);
  });

  // -------------------------------------------------------------------------
  // Menu item availability
  // -------------------------------------------------------------------------

  test('"Flatten to above" is disabled for the topmost layer in the panel', async ({ page }) => {
    // With a single layer, index 0 is both the top and bottom — no layer above.
    await openLayerMenu(page, 0);
    const flattenBtn = page.getByRole('menuitem', { name: /Flatten to above/i });
    await expect(flattenBtn).toBeVisible();
    await expect(flattenBtn).toBeDisabled();
  });

  test('"Flatten to above" is enabled for a non-topmost layer', async ({ page }) => {
    // Add a second layer — the panel now shows [Layer 2 (top), Layer 1 (bottom)].
    await page.locator('button[aria-label="Add new layer"]').click();
    await waitForRender(page);

    // The bottom layer in the panel is index 1; it has a layer above it.
    await openLayerMenu(page, 1);
    const flattenBtn = page.getByRole('menuitem', { name: /Flatten to above/i });
    await expect(flattenBtn).toBeVisible();
    await expect(flattenBtn).toBeEnabled();
  });

  // -------------------------------------------------------------------------
  // Core flatten behaviour
  // -------------------------------------------------------------------------

  test('flattening merges the selected layer into the panel-above layer and removes it', async ({
    page,
  }) => {
    // Start: one layer (Layer 1).
    await expect(page.locator('.layer-item')).toHaveCount(1);

    // Add Layer 2 — now panel shows [Layer 2 (index 0), Layer 1 (index 1)].
    await page.locator('button[aria-label="Add new layer"]').click();
    await waitForRender(page);
    await expect(page.locator('.layer-item')).toHaveCount(2);

    // Flatten Layer 1 (panel index 1) up into Layer 2 (panel index 0).
    await openLayerMenu(page, 1);
    await clickMenuItem(page, 'Flatten to above');
    await waitForRender(page);

    // Only one layer should remain.
    await expect(page.locator('.layer-item')).toHaveCount(1);
  });

  test('flattened layer name belongs to the surviving panel-above layer', async ({ page }) => {
    // Add second layer — panel: [Layer 2 (top), Layer 1 (bottom)].
    await page.locator('button[aria-label="Add new layer"]').click();
    await waitForRender(page);

    // The surviving layer must be the panel-top one (Layer 2 = index 0).
    const topLayerName = await page
      .locator('.layer-item')
      .nth(0)
      .locator('.layer-name')
      .textContent();

    await openLayerMenu(page, 1);
    await clickMenuItem(page, 'Flatten to above');
    await waitForRender(page);

    await expect(page.locator('.layer-item')).toHaveCount(1);
    await expect(page.locator('.layer-item').nth(0).locator('.layer-name')).toHaveText(
      topLayerName!.trim(),
    );
  });

  // -------------------------------------------------------------------------
  // Visual compositing
  // -------------------------------------------------------------------------

  test('pixel drawn on bottom layer (visual-top) is visible after flattening', async ({
    page,
  }) => {
    // Layer 1 starts as the only layer — draw a pixel on it.
    // After adding Layer 2, Layer 1 becomes the visual-top (higher canvas index).
    // Flattening the panel-bottom layer (Layer 1) into the panel-top layer (Layer 2)
    // should preserve the drawn pixel.

    // Draw a pixel on Layer 1 (the current active layer).
    const screenX = 55;
    const screenY = 55;
    await drawAt(page, screenX, screenY);
    const drawnColor = await getCanvasPixel(page, screenX, screenY);

    // Add Layer 2 — it becomes the new active layer on top in the panel.
    await page.locator('button[aria-label="Add new layer"]').click();
    await waitForRender(page);

    // Panel is now [Layer 2 (index 0, panel-top), Layer 1 (index 1, panel-bottom)].
    // Flatten Layer 1 (panel index 1) into Layer 2 (panel index 0).
    await openLayerMenu(page, 1);
    await clickMenuItem(page, 'Flatten to above');
    await waitForRender(page);

    // The merged canvas should still show the drawn pixel.
    const afterFlatten = await getCanvasPixel(page, screenX, screenY);
    expect(colorsEqual(afterFlatten, drawnColor)).toBe(true);
  });

  test('pixel drawn on upper canvas layer (visual-top) composites over lower on flatten', async ({
    page,
  }) => {
    // Draw red on Layer 1, then make Layer 2 active and draw at a different spot.
    // Flatten should show both pixels.

    const pos1 = { x: 55, y: 55 };
    const pos2 = { x: 105, y: 105 };

    // Draw on Layer 1.
    await drawAt(page, pos1.x, pos1.y);
    const colorOnLayer1 = await getCanvasPixel(page, pos1.x, pos1.y);

    // Add Layer 2 (becomes active, panel-top).
    await page.locator('button[aria-label="Add new layer"]').click();
    await waitForRender(page);

    // Draw on Layer 2.
    await drawAt(page, pos2.x, pos2.y);
    const colorOnLayer2 = await getCanvasPixel(page, pos2.x, pos2.y);

    // Flatten Layer 1 (panel index 1) into Layer 2 (panel index 0).
    await openLayerMenu(page, 1);
    await clickMenuItem(page, 'Flatten to above');
    await waitForRender(page);

    // Both pixels should still be present on the single remaining layer.
    const merged1 = await getCanvasPixel(page, pos1.x, pos1.y);
    const merged2 = await getCanvasPixel(page, pos2.x, pos2.y);

    expect(colorsEqual(merged1, colorOnLayer1)).toBe(true);
    expect(colorsEqual(merged2, colorOnLayer2)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Undo / redo
  // -------------------------------------------------------------------------

  test('undo after flatten restores both layers', async ({ page }) => {
    // Add a second layer and flatten.
    await page.locator('button[aria-label="Add new layer"]').click();
    await waitForRender(page);
    await expect(page.locator('.layer-item')).toHaveCount(2);

    await openLayerMenu(page, 1);
    await clickMenuItem(page, 'Flatten to above');
    await waitForRender(page);
    await expect(page.locator('.layer-item')).toHaveCount(1);

    // Undo should restore the two layers.
    const undoBtn = page.locator('button[aria-label="Undo"]');
    await expect(undoBtn).toBeEnabled();
    await undoBtn.click();
    await waitForRender(page);

    await expect(page.locator('.layer-item')).toHaveCount(2);
  });

  test('undo restores drawn pixel to correct layer after flatten', async ({ page }) => {
    const screenX = 55;
    const screenY = 55;

    // Draw on Layer 1.
    await drawAt(page, screenX, screenY);
    const drawnColor = await getCanvasPixel(page, screenX, screenY);

    // Add Layer 2 (transparent, panel-top).
    await page.locator('button[aria-label="Add new layer"]').click();
    await waitForRender(page);

    // Flatten Layer 1 into Layer 2.
    await openLayerMenu(page, 1);
    await clickMenuItem(page, 'Flatten to above');
    await waitForRender(page);

    // Undo the flatten — Layer 2 should lose the pixel (it was originally transparent),
    // but the overall canvas still shows the pixel because Layer 1 is restored below it.
    const undoBtn = page.locator('button[aria-label="Undo"]');
    await undoBtn.click();
    await waitForRender(page);

    await expect(page.locator('.layer-item')).toHaveCount(2);

    // The pixel should still be visible on the canvas (Layer 1 has the data).
    const afterUndo = await getCanvasPixel(page, screenX, screenY);
    expect(colorsEqual(afterUndo, drawnColor)).toBe(true);
  });

  test('redo re-applies the flatten after undo', async ({ page }) => {
    // Add second layer and flatten.
    await page.locator('button[aria-label="Add new layer"]').click();
    await waitForRender(page);

    await openLayerMenu(page, 1);
    await clickMenuItem(page, 'Flatten to above');
    await waitForRender(page);
    await expect(page.locator('.layer-item')).toHaveCount(1);

    // Undo.
    await page.locator('button[aria-label="Undo"]').click();
    await waitForRender(page);
    await expect(page.locator('.layer-item')).toHaveCount(2);

    // Redo.
    const redoBtn = page.locator('button[aria-label="Redo"]');
    await expect(redoBtn).toBeEnabled();
    await redoBtn.click();
    await waitForRender(page);

    // Back to one layer.
    await expect(page.locator('.layer-item')).toHaveCount(1);
  });
});
