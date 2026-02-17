import { test, expect, Page } from '@playwright/test';

/**
 * Wait for the canvas render loop (requestAnimationFrame) to complete.
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
 * Perform a long-press on an element by holding the pointer down for a
 * given duration, then releasing.
 */
async function longPress(
  page: Page,
  locator: ReturnType<Page['locator']>,
  durationMs = 600,
): Promise<void> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Element not visible for long-press');

  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(durationMs);
  await page.mouse.up();
  await waitForRender(page);
}

test.describe('Layer rename – long-press to edit', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/editor');
    await page.locator('app-canvas-viewport canvas').waitFor({ state: 'visible' });
    await waitForRender(page);
  });

  test('long-press on layer name shows an edit input', async ({ page }) => {
    const layerItem = page.locator('.layer-item').first();
    const layerName = layerItem.locator('.layer-name');

    // Verify layer name is visible before long-press
    await expect(layerName).toHaveText('Layer 1');

    // Long-press to enter edit mode
    await longPress(page, layerName);

    // An edit input should appear with the current name
    const editInput = layerItem.locator('.edit-input');
    await expect(editInput).toBeVisible();
    await expect(editInput).toHaveValue('Layer 1');

    // The layer name span should no longer be visible
    await expect(layerName).toHaveCount(0);
  });

  test('renaming a layer via Enter commits the new name', async ({ page }) => {
    const layerItem = page.locator('.layer-item').first();
    const layerName = layerItem.locator('.layer-name');

    await longPress(page, layerName);

    const editInput = layerItem.locator('.edit-input');
    await expect(editInput).toBeVisible();

    // Clear and type a new name
    await editInput.fill('Background');
    await editInput.press('Enter');
    await waitForRender(page);

    // The span should reappear with the new name
    const updatedName = layerItem.locator('.layer-name');
    await expect(updatedName).toHaveText('Background');
  });

  test('pressing Escape cancels the rename', async ({ page }) => {
    const layerItem = page.locator('.layer-item').first();
    const layerName = layerItem.locator('.layer-name');

    await longPress(page, layerName);

    const editInput = layerItem.locator('.edit-input');
    await expect(editInput).toBeVisible();

    // Type a different name but cancel
    await editInput.fill('Should Not Persist');
    await editInput.press('Escape');
    await waitForRender(page);

    // The original name should be restored
    const restoredName = layerItem.locator('.layer-name');
    await expect(restoredName).toHaveText('Layer 1');
  });

  test('blurring the edit input commits the new name', async ({ page }) => {
    const layerItem = page.locator('.layer-item').first();
    const layerName = layerItem.locator('.layer-name');

    await longPress(page, layerName);

    const editInput = layerItem.locator('.edit-input');
    await expect(editInput).toBeVisible();

    // Type a new name and blur by clicking elsewhere
    await editInput.fill('Foreground');
    await page.locator('.layers-header').click();
    await waitForRender(page);

    const updatedName = layerItem.locator('.layer-name');
    await expect(updatedName).toHaveText('Foreground');
  });

  test('short click does not enter edit mode', async ({ page }) => {
    const layerItem = page.locator('.layer-item').first();

    // Quick click on the layer item
    await layerItem.click();
    await waitForRender(page);

    // No edit input should be visible
    const editInput = layerItem.locator('.edit-input');
    await expect(editInput).toHaveCount(0);

    // Layer name span should still be present
    const layerName = layerItem.locator('.layer-name');
    await expect(layerName).toBeVisible();
  });

  test('submitting an empty name does not rename the layer', async ({ page }) => {
    const layerItem = page.locator('.layer-item').first();
    const layerName = layerItem.locator('.layer-name');

    await longPress(page, layerName);

    const editInput = layerItem.locator('.edit-input');
    await editInput.fill('');
    await editInput.press('Enter');
    await waitForRender(page);

    // Original name should persist
    const restoredName = layerItem.locator('.layer-name');
    await expect(restoredName).toHaveText('Layer 1');
  });
});
