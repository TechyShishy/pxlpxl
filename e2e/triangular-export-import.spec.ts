import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

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
  await dialog.waitFor({ state: 'detached' });
  await waitForRender(page);
}

/**
 * Compute screen-space center for a triangular-grid pixel (odd-d layout).
 * Mirrors GridService.pixelToScreen for odd-d grids with 2-stride layout.
 */
function triangularPixelCenter(
  bx: number,
  by: number,
  scale: number,
  a: number,
  d: number,
  totalRows: number,
): { x: number; y: number } {
  let left: number;
  let top: number;
  if (d % 2 === 1) {
    const rowWidth = a + d * by;
    const maxRowWidth = a + d * (totalRows - 1);
    const centerOffset = maxRowWidth - rowWidth;
    left = (centerOffset + bx * 2) * scale;
    top = by * Math.ceil(scale / 2);
  } else {
    const rowWidth = a + d * by;
    const maxRowWidth = a + d * (totalRows - 1);
    const leftPad = ((maxRowWidth - rowWidth) / 2) * scale;
    left = leftPad + bx * scale;
    top = by * scale;
  }
  return {
    x: Math.round(left + scale / 2),
    y: Math.round(top + scale / 2),
  };
}

// ---------------------------------------------------------------------------
// Layer-panel helpers
// ---------------------------------------------------------------------------

/**
 * Open the "more options" menu for a layer by panel index (0 = topmost in list).
 */
async function openLayerMenu(page: Page, layerIndex: number): Promise<void> {
  const menuTrigger = page
    .locator('.layer-item')
    .nth(layerIndex)
    .locator('button[aria-label^="Layer options"]');
  await menuTrigger.click();
  await page.locator('.mat-mdc-menu-panel').waitFor({ state: 'visible' });
}

/**
 * Click a menu item by partial, case-insensitive name, then wait for the overlay to close.
 */
async function clickMenuItem(page: Page, label: string): Promise<void> {
  await page.getByRole('menuitem', { name: new RegExp(label, 'i') }).click();
  await page.locator('.mat-mdc-menu-panel').waitFor({ state: 'hidden' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Triangular project: draw → duplicate layer → move layer → export PXL → import PXL', () => {
  const A = 1;
  const D = 1;
  const ROWS = 25;
  const SCALE = 10; // default zoom scale

  test('layer operations and drawn pixels survive a round-trip export-then-import of a .pxl file', async ({ page }) => {
    // Collect all browser console messages throughout the test.
    const consoleLogs: { type: string; text: string }[] = [];
    page.on('console', (msg) => consoleLogs.push({ type: msg.type(), text: msg.text() }));
    page.on('pageerror', (err) => consoleLogs.push({ type: 'pageerror', text: err.message }));

    const tmpDir = path.join(__dirname, '../test-results');
    const downloadPath = path.join(tmpDir, 'tri-round-trip-test.pxl');
    fs.mkdirSync(tmpDir, { recursive: true });
    // Clean up any leftover file from a previous run
    if (fs.existsSync(downloadPath)) fs.unlinkSync(downloadPath);

    // ── Step 1: Navigate and create the source triangular project ─────
    await page.goto('/editor');
    await page.locator(MAIN_CANVAS).waitFor({ state: 'visible' });
    await waitForRender(page);

    await createTriangularProject(page, 'TriExportSrc', A, D, ROWS);

    // ── Step 2: Draw on the canvas ────────────────────────────────────
    // Pick pixel (2, 4): row 4 has width = 1 + 4 = 5, so bx=2 is valid
    const { x: sampleX, y: sampleY } = triangularPixelCenter(2, 4, SCALE, A, D, ROWS);

    const baseline = await getCanvasPixel(page, sampleX, sampleY);
    await drawAt(page, sampleX, sampleY);
    const afterDraw = await getCanvasPixel(page, sampleX, sampleY);

    expect(
      colorsEqual(afterDraw, baseline),
      `Drawing should change the pixel color from ${JSON.stringify(baseline)}`,
    ).toBe(false);

    // ── Step 3: Duplicate the layer ───────────────────────────────────
    // Panel starts with one item at index 0 ("Layer 1").
    await expect(page.locator('.layer-item')).toHaveCount(1);

    await openLayerMenu(page, 0);
    await clickMenuItem(page, 'Duplicate layer');
    await waitForRender(page);

    // Now two layers: index 0 = "Layer 1", index 1 = "Copy of Layer 1"
    await expect(page.locator('.layer-item')).toHaveCount(2);

    // ── Step 4: Select the copy layer as active ───────────────────────
    // Click the copy (panel index 1) to make it the active layer.
    await page.locator('.layer-item').nth(1).click();
    await waitForRender(page);

    // ── Step 5: Move the copy's pixel content with the Move tool ─────
    // Activate the Move tool.
    await page.locator('button[aria-label="Move"]').click();

    // Drag from the drawn pixel's position to 2 pixels to the right.
    // For odd-d (D=1), pixel (bx=3, by=4): left=(5+6)*10=110, top=4*5=20 → center=(115,25)
    const movedCenter = triangularPixelCenter(3, 4, SCALE, A, D, ROWS);

    const canvas = page.locator(MAIN_CANVAS);
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + sampleX, box.y + sampleY);
    await page.mouse.down();
    await page.mouse.move(box.x + movedCenter.x, box.y + movedCenter.y);
    await page.mouse.up();
    await waitForRender(page);

    // The copy's drawn pixel should now be at the new position.
    const copyPixelAfterMove = await getCanvasPixel(page, movedCenter.x, movedCenter.y);
    expect(
      colorsEqual(copyPixelAfterMove, afterDraw),
      `Copy layer pixel should appear at moved position (${movedCenter.x}, ${movedCenter.y})`,
    ).toBe(true);

    // Switch back to the Pencil tool so the subsequent new-project draw step works.
    await page.locator('button[aria-label="Pencil"]').click();

    // ── Step 6: Export as PXL ─────────────────────────────────────────
    await page.locator('button[aria-label="File menu"]').click();
    await page.getByRole('menuitem', { name: 'Export…' }).click();

    const exportDialog = page.locator('mat-dialog-container');
    await exportDialog.waitFor({ state: 'visible' });

    // Select the PXL format radio button
    await exportDialog.getByRole('radio', { name: /PXL/i }).click();

    // Intercept the browser download triggered when "Export" is clicked
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      exportDialog.getByRole('button', { name: 'Export' }).click(),
    ]);

    await download.saveAs(downloadPath);
    await exportDialog.waitFor({ state: 'detached' });
    await waitForRender(page);

    expect(fs.existsSync(downloadPath), 'Exported .pxl file should exist on disk').toBe(true);
    expect(fs.statSync(downloadPath).size, 'Exported .pxl file should be non-empty').toBeGreaterThan(0);

    // ── Step 6: Decode the .pxl file and verify layer data sizes ────────
    // .pxl files are gzip-compressed JSON. Decompress and parse.
    const compressed = fs.readFileSync(downloadPath);
    const decompressed = zlib.gunzipSync(compressed);
    const pxlJson = JSON.parse(decompressed.toString('utf8')) as {
      version: number;
      gridType: string;
      width: number;
      height: number;
      triangularA?: number;
      triangularDNum?: number;
      triangularDDen?: number;
      layers: Array<{ id: string; name: string; data: string }>;
    };

    // Verify top-level grid metadata
    expect(pxlJson.gridType).toBe('triangular');
    expect(pxlJson.triangularA).toBe(A);
    expect(pxlJson.triangularDNum).toBe(D);
    expect(pxlJson.triangularDDen).toBe(1);

    // Compute expected byte count for this triangular grid.
    // Row r has width = A + (dNum/dDen)*r = 1 + r pixels.
    // Total pixels = Σ_{r=0}^{ROWS-1} (A + r) = Σ_{r=0}^{24}(1+r) = 325.
    // Each pixel = 4 RGBA bytes → 1300 bytes per layer.
    let expectedPixels = 0;
    for (let r = 0; r < ROWS; r++) {
      expectedPixels += A + (D / 1) * r; // dNum=D, dDen=1
    }
    const expectedBytes = expectedPixels * 4;

    expect(pxlJson.layers).toHaveLength(2);
    for (const layer of pxlJson.layers) {
      const decoded = Buffer.from(layer.data, 'base64');
      expect(decoded.byteLength).toBe(expectedBytes);
    }

    // ── Step 8: Create a second (blank) triangular project ────────────
    await createTriangularProject(page, 'TriImportDest', A, D, ROWS);

    // The newly created blank project should have 1 layer and no drawn pixels
    await expect(page.locator('.layer-item')).toHaveCount(1);
    const afterNewProject = await getCanvasPixel(page, sampleX, sampleY);
    expect(
      colorsEqual(afterNewProject, afterDraw),
      'Fresh project pixel should differ from the originally drawn color',
    ).toBe(false);

    // ── Step 9: Import the exported .pxl file ─────────────────────────
    await page.locator('button[aria-label="File menu"]').click();

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('menuitem', { name: 'Import File' }).click(),
    ]);
    await fileChooser.setFiles(downloadPath);
    await waitForRender(page);
    // Allow Angular change detection + re-render to settle
    await page.waitForTimeout(300);
    await waitForRender(page);

    // ── Step 10: Verify the layers and pixel content were restored ────
    // Both layers (original + moved copy) should be present.
    await expect(page.locator('.layer-item')).toHaveCount(2);

    // The original layer's drawn pixel should still be at the original position.
    const afterImport = await getCanvasPixel(page, sampleX, sampleY);
    expect(
      colorsEqual(afterImport, afterDraw),
      `Imported pixel at (${sampleX}, ${sampleY}) should match the originally drawn color ` +
        `(expected ${JSON.stringify(afterDraw)}, got ${JSON.stringify(afterImport)})`,
    ).toBe(true);

    // The copy layer's pixel was moved — it should appear at the shifted position.
    const importedMoved = await getCanvasPixel(page, movedCenter.x, movedCenter.y);
    expect(
      colorsEqual(importedMoved, afterDraw),
      `Moved copy pixel at (${movedCenter.x}, ${movedCenter.y}) should match drawn color after import ` +
        `(expected ${JSON.stringify(afterDraw)}, got ${JSON.stringify(importedMoved)})`,
    ).toBe(true);

    // ── Step 11: Assert no browser errors were logged ─────────────────
    const errors = consoleLogs.filter((m) => m.type === 'error' || m.type === 'pageerror' || m.type === 'warning');
    if (errors.length > 0) {
      const summary = errors.map((e) => `[${e.type}] ${e.text}`).join('\n');
      throw new Error(`Browser console errors detected during test:\n${summary}`);
    }

    // Cleanup
    fs.unlinkSync(downloadPath);
  });
});
