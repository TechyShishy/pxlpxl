import { test, expect, Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface PixelCoord {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Triangular grid math (mirrors GridService logic for a, d, totalRows)
// ---------------------------------------------------------------------------

/**
 * Compute the screen-space bounding box for a triangular-grid pixel.
 * Replicates `GridService.pixelToScreen` for triangular grids.
 * Odd d uses 2-stride spacing, half-row Y interleaving, and non-square
 * bead width (beadSize.width = scale * xScale) for radial tiling.
 */
function triangularPixelBox(
  bx: number,
  by: number,
  scale: number,
  a: number,
  d: number,
  totalRows: number,
): Box {
  const maxWidth = a + d * Math.max(0, totalRows - 1);
  const rowWidth = a + d * by;
  let beadWidth = scale;
  const beadHeight = scale;

  if (d % 2 !== 0) {
    // Compute bead width from xScale (mirrors CanvasStateService.beadSize)
    const sideCount = Math.round(3 / d); // dNum=d, dDen=1
    if (sideCount >= 3) {
      const halfWidth = maxWidth * scale;
      const rowSpacing = scale / 2;
      const dy = (totalRows - 0.5) * rowSpacing;
      const xScale = (Math.tan(Math.PI / sideCount) * dy) / halfWidth;
      beadWidth = scale * xScale;
    }
    const centerOffset = maxWidth - rowWidth;
    const sx = (centerOffset + bx * 2) * beadWidth;
    const sy = by * (beadHeight / 2);
    return { left: sx, top: sy, right: sx + beadWidth, bottom: sy + beadHeight };
  }
  const centerOffset = (maxWidth - rowWidth) / 2;
  const sx = (centerOffset + bx) * beadWidth;
  const sy = by * beadHeight;
  return { left: sx, top: sy, right: sx + beadWidth, bottom: sy + beadHeight };
}

/**
 * Compute the 6-connected neighbors for a triangular-grid pixel with odd d.
 * With 2-stride layout: ±1 row diagonals (gridCol ± 1) and ±2 rows (same gridCol).
 * No same-row neighbors.
 * Replicates `GridService.getNeighborsTriangular`.
 */
function triangularNeighbors(
  bx: number,
  by: number,
  a: number,
  d: number,
  totalRows: number,
): PixelCoord[] {
  const neighbors: PixelCoord[] = [];

  const isValid = (x: number, y: number): boolean => {
    if (y < 0 || y >= totalRows) return false;
    const rw = a + d * y;
    return x >= 0 && x < rw;
  };

  if (d % 2 !== 0) {
    // Odd d: 2-stride layout
    // ±1 row diagonals
    if (by > 0) {
      const leftAbove = (2 * bx - 1 - d) / 2;
      const rightAbove = (2 * bx + 1 - d) / 2;
      if (isValid(leftAbove, by - 1)) neighbors.push({ x: leftAbove, y: by - 1 });
      if (isValid(rightAbove, by - 1)) neighbors.push({ x: rightAbove, y: by - 1 });
    }
    if (by < totalRows - 1) {
      const leftBelow = (2 * bx - 1 + d) / 2;
      const rightBelow = (2 * bx + 1 + d) / 2;
      if (isValid(leftBelow, by + 1)) neighbors.push({ x: leftBelow, y: by + 1 });
      if (isValid(rightBelow, by + 1)) neighbors.push({ x: rightBelow, y: by + 1 });
    }
    // ±2 rows same gridCol
    if (by >= 2 && isValid(bx - d, by - 2)) neighbors.push({ x: bx - d, y: by - 2 });
    if (by < totalRows - 2 && isValid(bx + d, by + 2)) neighbors.push({ x: bx + d, y: by + 2 });
  } else {
    // Even d: same-row + ±1 row
    const rowWidth = a + d * by;
    if (bx - 1 >= 0) neighbors.push({ x: bx - 1, y: by });
    if (bx + 1 < rowWidth) neighbors.push({ x: bx + 1, y: by });
    if (by > 0) {
      const aboveX = bx - d / 2;
      if (isValid(aboveX, by - 1)) neighbors.push({ x: aboveX, y: by - 1 });
    }
    if (by < totalRows - 1) {
      const belowX = bx + d / 2;
      if (isValid(belowX, by + 1)) neighbors.push({ x: belowX, y: by + 1 });
    }
  }

  return neighbors;
}

/**
 * Two rectangles overlap if they share any interior area (strict overlap)
 * OR share at least one edge (adjacency).
 * We use `<=` to treat edge-touching as overlapping.
 */
function boxesOverlap(a: Box, b: Box): boolean {
  return a.left <= b.right && b.left <= a.right && a.top <= b.bottom && b.top <= a.bottom;
}

/**
 * Compute the minimum axis-aligned gap between two boxes.
 * Returns 0 if overlap or edge-touching, positive otherwise.
 * Uses Chebyshev distance (max of X gap, Y gap).
 */
function boxDistance(a: Box, b: Box): number {
  const dx = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
  const dy = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
  return Math.max(dx, dy);
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
  // Open the File menu and click New Project
  await page.locator('button[aria-label="File menu"]').click();
  await page.getByRole('menuitem', { name: 'New Project' }).click();

  const dialog = page.locator('mat-dialog-container');
  await dialog.waitFor({ state: 'visible' });

  // Fill in the project name
  const nameInput = dialog.locator('input[aria-label="Project name"]');
  await nameInput.fill(name);

  // Select triangular grid type
  const gridSelect = dialog.locator('mat-select[aria-label="Grid type"]');
  await gridSelect.click();
  await page.getByRole('option', { name: 'Triangular' }).click();

  // Wait for the triangular-specific fields to appear
  const aInput = dialog.locator('input[aria-label="First row width (a)"]');
  await aInput.waitFor({ state: 'visible' });

  // Fill in triangular parameters
  await aInput.fill(String(a));

  const dNumInput = dialog.locator('input[aria-label="Number of increases per cycle (dNum)"]');
  await dNumInput.fill(String(d));

  const dDenInput = dialog.locator('input[aria-label="Cycle length in rows (dDen)"]');
  await dDenInput.fill('1');

  const rInput = dialog.locator('input[aria-label="Number of rows (R)"]');
  await rInput.fill(String(rows));

  // Click Create
  await dialog.getByRole('button', { name: 'Create' }).click();
  await waitForRender(page);
}

/** Selector for the main drawing canvas (excludes rulers and crosshair). */
const MAIN_CANVAS = 'app-canvas-viewport canvas:not([aria-hidden])';

/**
 * Draw a single pixel at the given canvas-relative screen coordinates.
 */
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
 * Read the RGBA value of a single pixel on the visible canvas at the given
 * canvas-relative position.
 */
async function getCanvasPixel(
  page: Page,
  x: number,
  y: number,
): Promise<{ r: number; g: number; b: number; a: number }> {
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Triangular grid neighbor bounding-box overlap (a=1, d=1, rows=10)', () => {
  const A = 1;
  const D = 1;
  const ROWS = 10;

  // Pick a center pixel deep enough to have all 6 neighbors.
  // (3, 5) in row 5 (width = 1 + 5 = 6). Row above width = 5, row below width = 7.
  // Neighbors: left (2,5), right (4,5), above-floor (2,4), above-ceil (3,4),
  //            below-floor (3,6), below-ceil (4,6).
  const CENTER: PixelCoord = { x: 3, y: 5 };

  test.beforeEach(async ({ page }) => {
    await page.goto('/editor');
    await page.locator(MAIN_CANVAS).waitFor({ state: 'visible' });
    await waitForRender(page);

    // Create a triangular project
    await createTriangularProject(page, 'TriOverlapTest', A, D, ROWS);
  });

  test('center pixel at (3,5) has exactly 6 neighbors', async () => {
    const neighbors = triangularNeighbors(CENTER.x, CENTER.y, A, D, ROWS);
    expect(neighbors.length).toBe(6);
  });

  test('each neighbor is adjacent to center (within one cell gap)', async () => {
    // With 2-stride layout: cross-row neighbors edge-touch (distance=0),
    // same-row neighbors have exactly scale gap (distance=scale).
    const scale = 10;
    const centerBox = triangularPixelBox(CENTER.x, CENTER.y, scale, A, D, ROWS);
    const neighbors = triangularNeighbors(CENTER.x, CENTER.y, A, D, ROWS);

    expect(neighbors.length).toBe(6);

    for (const neighbor of neighbors) {
      const nBox = triangularPixelBox(neighbor.x, neighbor.y, scale, A, D, ROWS);
      const dist = boxDistance(centerBox, nBox);
      expect(
        dist,
        `Neighbor (${neighbor.x},${neighbor.y}) box {L:${nBox.left},T:${nBox.top},R:${nBox.right},B:${nBox.bottom}} ` +
          `distance to center should be <= ${scale}, got ${dist}`,
      ).toBeLessThanOrEqual(scale);
    }
  });

  test('non-neighbors are farther than one cell gap from center', async () => {
    const scale = 10;
    const centerBox = triangularPixelBox(CENTER.x, CENTER.y, scale, A, D, ROWS);
    const neighbors = triangularNeighbors(CENTER.x, CENTER.y, A, D, ROWS);
    const neighborSet = new Set(neighbors.map((n) => `${n.x},${n.y}`));

    // Non-neighbors should have distance > scale (farther than one cell gap)
    const nonNeighbors: PixelCoord[] = [
      { x: 0, y: 5 }, // far left on same row
      { x: 5, y: 5 }, // far right on same row
      { x: 0, y: 3 }, // two rows above, far left
      { x: 3, y: 8 }, // three rows below
      { x: 0, y: 0 }, // top-left corner of grid
    ];

    for (const pixel of nonNeighbors) {
      if (neighborSet.has(`${pixel.x},${pixel.y}`)) continue;
      if (pixel.x === CENTER.x && pixel.y === CENTER.y) continue;

      const pBox = triangularPixelBox(pixel.x, pixel.y, scale, A, D, ROWS);
      const dist = boxDistance(centerBox, pBox);
      expect(
        dist,
        `Non-neighbor (${pixel.x},${pixel.y}) distance ${dist} should be > ${scale}`,
      ).toBeGreaterThan(scale);
    }
  });

  test('drawing on center pixel renders to the expected screen location', async ({ page }) => {
    const scale = 10;
    const centerBox = triangularPixelBox(CENTER.x, CENTER.y, scale, A, D, ROWS);

    // Read baseline color at the center of the pixel's screen box
    const sampleX = Math.round((centerBox.left + centerBox.right) / 2);
    const sampleY = Math.round((centerBox.top + centerBox.bottom) / 2);
    const baseline = await getCanvasPixel(page, sampleX, sampleY);

    // Draw (pencil is the default tool) at the center of the pixel
    await drawAt(page, sampleX, sampleY);

    // The pixel color should have changed
    const afterDraw = await getCanvasPixel(page, sampleX, sampleY);
    expect(
      afterDraw.r !== baseline.r ||
        afterDraw.g !== baseline.g ||
        afterDraw.b !== baseline.b ||
        afterDraw.a !== baseline.a,
      'Drawing should change the pixel color at the center of the triangular cell',
    ).toBe(true);
  });

  test('drawing on a neighbor renders adjacent to the center pixel', async ({ page }) => {
    const scale = 10;
    const neighbors = triangularNeighbors(CENTER.x, CENTER.y, A, D, ROWS);
    const centerBox = triangularPixelBox(CENTER.x, CENTER.y, scale, A, D, ROWS);

    // Draw on the center pixel first
    const centerSampleX = Math.round((centerBox.left + centerBox.right) / 2);
    const centerSampleY = Math.round((centerBox.top + centerBox.bottom) / 2);
    await drawAt(page, centerSampleX, centerSampleY);

    // Now draw on the first neighbor (left: (2, 5))
    const neighbor = neighbors[0];
    const nBox = triangularPixelBox(neighbor.x, neighbor.y, scale, A, D, ROWS);
    const nSampleX = Math.round((nBox.left + nBox.right) / 2);
    const nSampleY = Math.round((nBox.top + nBox.bottom) / 2);

    const baselineNeighbor = await getCanvasPixel(page, nSampleX, nSampleY);
    await drawAt(page, nSampleX, nSampleY);
    const afterDrawNeighbor = await getCanvasPixel(page, nSampleX, nSampleY);

    // The neighbor pixel color should have changed
    expect(
      afterDrawNeighbor.r !== baselineNeighbor.r ||
        afterDrawNeighbor.g !== baselineNeighbor.g ||
        afterDrawNeighbor.b !== baselineNeighbor.b ||
        afterDrawNeighbor.a !== baselineNeighbor.a,
      `Drawing on neighbor (${neighbor.x},${neighbor.y}) should change the pixel color`,
    ).toBe(true);

    // Verify the boxes are adjacent (within one cell gap)
    expect(boxDistance(centerBox, nBox)).toBeLessThanOrEqual(scale);
  });
});
