import { test, expect, Page, Locator } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wait for the canvas render loop (requestAnimationFrame) to complete.
 * Two frames ensures the render has flushed.
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
  locator: Locator,
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

/** Save the current project via File menu → Save. */
async function saveProject(page: Page): Promise<void> {
  await page.locator('button[aria-label="File menu"]').click();
  await page.getByRole('menuitem', { name: 'Save' }).click();
  await waitForRender(page);
}

/** Open the load-project panel via File menu → Open Project. */
async function openLoadPanel(page: Page): Promise<void> {
  await page.locator('button[aria-label="File menu"]').click();
  await page.getByRole('menuitem', { name: 'Open Project' }).click();
  // Wait for the slideIn animation (250ms) to finish
  await page.waitForTimeout(300);
  await waitForRender(page);
}

/** Close the load-project panel via its close button. */
async function closeLoadPanel(page: Page): Promise<void> {
  await page.locator('button[aria-label="Close projects panel"]').click();
  await waitForRender(page);
}

/**
 * Create a new project via File menu → New Project dialog.
 * Fills in the name and accepts the default 32×32 size.
 */
async function createNewProject(page: Page, name: string): Promise<void> {
  await page.locator('button[aria-label="File menu"]').click();
  await page.getByRole('menuitem', { name: 'New Project' }).click();

  // Wait for the dialog
  const dialog = page.locator('mat-dialog-container');
  await dialog.waitFor({ state: 'visible' });

  // Fill in the name
  const nameInput = dialog.locator('input[aria-label="Project name"]');
  await nameInput.fill(name);

  // Click Create
  await dialog.getByRole('button', { name: 'Create' }).click();
  await waitForRender(page);
}

/**
 * Locate a project list item by its visible display name.
 *
 * IMPORTANT: This uses `hasText` which matches element *text content*, NOT
 * input values. Do not use this to locate a project that is currently in
 * edit mode (the name is in an <input> value then, which `hasText` ignores).
 */
function projectItemByName(page: Page, name: string) {
  return page.locator('.project-item', { hasText: name });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Project rename – long-press to edit', () => {
  test.beforeEach(async ({ page }) => {
    // Clear IndexedDB for test isolation – prevents project accumulation
    await page.goto('/editor');
    await page.evaluate(() => {
      const req = indexedDB.deleteDatabase('pxlpxl');
      return new Promise<void>((resolve, reject) => {
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    });

    // Re-navigate so the app starts fresh with a clean DB
    await page.goto('/editor');
    await page.locator('app-canvas-viewport canvas').waitFor({ state: 'visible' });
    await waitForRender(page);

    // Save the auto-created project so it appears in the load panel
    await saveProject(page);

    // Open the load-project panel
    await openLoadPanel(page);
  });

  test('long-press on project name shows an edit input', async ({ page }) => {
    // Only one project after clean DB + save
    const projectItem = page.locator('.project-item');
    const projectName = projectItem.locator('.project-name');

    // Verify the name is visible
    await expect(projectName).toHaveText('Untitled');

    // Long-press to enter edit mode
    await longPress(page, projectName);

    // An edit input should appear with the current name
    const editInput = projectItem.locator('.edit-input');
    await expect(editInput).toBeVisible();
    await expect(editInput).toHaveValue('Untitled');

    // The project name span should no longer be visible
    await expect(projectName).toHaveCount(0);
  });

  test('renaming a project via Enter commits the new name', async ({ page }) => {
    const projectItem = page.locator('.project-item');
    const projectName = projectItem.locator('.project-name');

    await longPress(page, projectName);

    const editInput = projectItem.locator('.edit-input');
    await expect(editInput).toBeVisible();

    // Clear and type a new name
    await editInput.fill('My Project');
    await editInput.press('Enter');
    await waitForRender(page);

    // After rename the list refreshes — wait for the updated name to appear
    await expect(page.locator('.project-item .project-name')).toHaveText('My Project');
  });

  test('pressing Escape cancels the rename', async ({ page }) => {
    const projectItem = page.locator('.project-item');
    const projectName = projectItem.locator('.project-name');

    await longPress(page, projectName);

    const editInput = projectItem.locator('.edit-input');
    await expect(editInput).toBeVisible();

    // Type a different name but cancel
    await editInput.fill('Should Not Persist');
    await editInput.press('Escape');
    await waitForRender(page);

    // The original name should be restored
    const restoredItem = projectItemByName(page, 'Untitled');
    await expect(restoredItem.locator('.project-name')).toHaveText('Untitled');
  });

  test('blurring the edit input commits the new name', async ({ page }) => {
    const projectItem = page.locator('.project-item');
    const projectName = projectItem.locator('.project-name');

    await longPress(page, projectName);

    const editInput = projectItem.locator('.edit-input');
    await expect(editInput).toBeVisible();

    // Type a new name and blur by clicking elsewhere
    await editInput.fill('Blurred Name');
    await page.locator('.panel-header').click();
    await waitForRender(page);

    // After rename the list refreshes — re-locate by the new name
    const renamedItem = projectItemByName(page, 'Blurred Name');
    await expect(renamedItem.locator('.project-name')).toHaveText('Blurred Name');
  });

  test('short click does not enter edit mode', async ({ page }) => {
    const projectItem = page.locator('.project-item');

    // A short click on the project item will load the project and close the panel.
    // We verify by re-opening the panel: the name is unchanged and no edit input is active.
    await projectItem.click();
    await waitForRender(page);

    // Re-open the panel to verify no edit state leaked
    await openLoadPanel(page);

    const editInput = page.locator('.project-item .edit-input');
    await expect(editInput).toHaveCount(0);

    // The project name should still be intact
    const projectName = projectItemByName(page, 'Untitled').locator('.project-name');
    await expect(projectName).toBeVisible();
  });

  test('submitting an empty name does not rename the project', async ({ page }) => {
    const projectItem = page.locator('.project-item');
    const projectName = projectItem.locator('.project-name');

    await longPress(page, projectName);

    const editInput = projectItem.locator('.edit-input');
    await editInput.fill('');
    await editInput.press('Enter');
    await waitForRender(page);

    // Original name should persist
    await expect(page.locator('.project-item .project-name')).toHaveText('Untitled');
  });

  test('loading a renamed project sets the active project name in the toolbar', async ({
    page,
  }) => {
    const projectItem = page.locator('.project-item');
    const projectName = projectItem.locator('.project-name');

    // Step 1: Rename the project
    await longPress(page, projectName);
    const editInput = projectItem.locator('.edit-input');
    await editInput.fill('Renamed Project');
    await editInput.press('Enter');
    await waitForRender(page);

    // Verify rename took effect — wait for the updated name to appear
    await expect(page.locator('.project-item .project-name')).toHaveText('Renamed Project');

    // Step 2: Close the load panel
    await closeLoadPanel(page);

    // Step 3: Create a new project to switch away from the renamed one
    await createNewProject(page, 'Temporary');

    // The toolbar should now show the new project's name
    await expect(page.locator('.toolbar .project-name')).toHaveText('Temporary');

    // Step 4: Save the temp project so both projects are in the list
    await saveProject(page);

    // Step 5: Open the load panel and click the renamed project to load it
    await openLoadPanel(page);

    const renamedEntry = projectItemByName(page, 'Renamed Project');
    await expect(renamedEntry).toBeVisible();
    await renamedEntry.click();
    await waitForRender(page);

    // Step 6: Verify the toolbar shows the renamed project's name
    await expect(page.locator('.toolbar .project-name')).toHaveText('Renamed Project');
  });
});
