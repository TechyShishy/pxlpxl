import { test, expect, Page } from '@playwright/test';

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
 * Dispatch a PointerEvent directly on the `.viewport` element inside
 * `app-canvas-viewport` (the element that listens for pointer events).
 */
async function dispatchTouch(
  page: Page,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  pointerId: number,
  clientX: number,
  clientY: number,
): Promise<void> {
  await page.evaluate(
    ({ type, pointerId, clientX, clientY }) => {
      const viewport = document.querySelector('app-canvas-viewport .viewport') as HTMLElement;
      const event = new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId,
        clientX,
        clientY,
        pointerType: 'touch',
        isPrimary: pointerId === 1,
      });
      viewport.dispatchEvent(event);
    },
    { type, pointerId, clientX, clientY },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Two-finger pan — must not draw pixels', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/editor');
    await page.locator('app-canvas-viewport canvas:not([aria-hidden])').waitFor({ state: 'visible' });
    await waitForRender(page);
  });

  /**
   * Regression test for: two-finger pan draws a pixel at the position of the
   * first finger when the second finger lands.
   *
   * Sequence:
   *   1. pointerdown finger-1 inside canvas
   *   2. pointerdown finger-2 at a different position (pan gesture starts)
   *   3. Both fingers move (pan)
   *   4. Both fingers lift
   *   5. Assert undo button is disabled — no DrawCommand was pushed
   */
  test('two-finger pan does not draw or push a history command', async ({ page }) => {
    const canvas = page.locator('app-canvas-viewport canvas:not([aria-hidden])');
    const box = (await canvas.boundingBox())!;

    // Convert canvas-relative coordinates to page-absolute for PointerEvents.
    // Default zoom is 10px/pixel so logical pixel (5,5) is at screen (50..59, 50..59).
    const abs = (cx: number, cy: number) => ({ x: box.x + cx, y: box.y + cy });

    const f1 = abs(55, 55);           // first finger — where drawing would happen
    const f2 = abs(55 + 80, 55 + 80); // second finger far away

    // 1. First finger touches
    await dispatchTouch(page, 'pointerdown', 1, f1.x, f1.y);
    // 2. Second finger touches — should cancel the draw, NOT commit it
    await dispatchTouch(page, 'pointerdown', 2, f2.x, f2.y);
    // 3. Both fingers move (simulate pan)
    await dispatchTouch(page, 'pointermove', 1, f1.x + 20, f1.y + 10);
    await dispatchTouch(page, 'pointermove', 2, f2.x + 20, f2.y + 10);
    // 4. Both fingers lift
    await dispatchTouch(page, 'pointerup', 1, f1.x + 20, f1.y + 10);
    await dispatchTouch(page, 'pointerup', 2, f2.x + 20, f2.y + 10);

    await waitForRender(page);

    // 5. Undo button must still be disabled — no DrawCommand should have been pushed.
    //    If a pixel was permanently drawn, the undo stack would be non-empty and the button enabled.
    const undoBtn = page.locator('button[aria-label="Undo"]');
    await expect(undoBtn).toBeDisabled();
  });
});
