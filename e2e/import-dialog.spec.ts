import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

/**
 * Generates a valid 64×64 solid-red PNG using only Node.js built-ins.
 */
function make64x64Png(): Buffer {
  const width = 64, height = 64;
  function crc32(buf: Buffer): number {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c;
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function chunk(type: string, data: Buffer): Buffer {
    const typeBytes = Buffer.from(type, 'ascii');
    const len = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length, 0);
    const c = Buffer.allocUnsafe(4); c.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
    return Buffer.concat([len, typeBytes, data, c]);
  }
  const ihdr = Buffer.from([0, 0, 0, 64, 0, 0, 0, 64, 8, 2, 0, 0, 0]);
  const raw = Buffer.alloc((1 + width * 3) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 3);
    raw[row] = 0;
    for (let x = 0; x < width; x++) { raw[row + 1 + x * 3] = 255; raw[row + 2 + x * 3] = 0; raw[row + 3 + x * 3] = 0; }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('import PNG dialog — two-column layout: canvas left, options panel right', async ({ page }) => {
  const tmpPng = path.join(__dirname, '../test-results/tmp-test.png');
  fs.mkdirSync(path.dirname(tmpPng), { recursive: true });
  fs.writeFileSync(tmpPng, make64x64Png());

  await page.goto('/');
  await page.getByRole('button', { name: 'File menu' }).click();

  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: /import file/i }).click(),
  ]);
  await fileChooser.setFiles(tmpPng);

  await page.waitForSelector('.dialog-layout', { timeout: 8000 });
  await page.waitForTimeout(300);

  const [canvasBox, optionsBox] = await Promise.all([
    page.locator('.preview-canvas').boundingBox(),
    page.locator('.options-column').boundingBox(),
  ]);

  // Canvas should be a reasonable size (up to 480px; may be smaller on short viewports
  // since canvas is responsive to 65vh to avoid overflowing mat-dialog-content).
  expect(canvasBox?.width).toBeGreaterThanOrEqual(240);
  expect(canvasBox?.width).toBeLessThanOrEqual(480);

  // Options column should have at least 200px (not squished)
  expect(optionsBox?.width).toBeGreaterThan(200);

  // Canvas and options column should be side-by-side (similar top Y, not stacked)
  expect(Math.abs((canvasBox?.y ?? 0) - (optionsBox?.y ?? 0))).toBeLessThan(50);

  fs.unlinkSync(tmpPng);
});

test('import PNG dialog — Pixel Tablet landscape (1280×800): dialog fits viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const tmpPng = path.join(__dirname, '../test-results/tmp-tablet.png');
  fs.mkdirSync(path.dirname(tmpPng), { recursive: true });
  fs.writeFileSync(tmpPng, make64x64Png());

  await page.goto('/');
  await page.getByRole('button', { name: 'File menu' }).click();

  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: /import file/i }).click(),
  ]);
  await fileChooser.setFiles(tmpPng);
  await page.waitForSelector('.dialog-layout', { timeout: 8000 });
  await page.waitForTimeout(300);

  const dialogBox = await page.locator('mat-dialog-container').boundingBox();
  const canvasBox = await page.locator('.preview-canvas').boundingBox();
  const optionsBox = await page.locator('.options-column').boundingBox();

  await page.screenshot({ path: 'test-results/tablet-landscape.png', fullPage: false });

  // Dialog must fit within viewport width
  expect((dialogBox?.x ?? 0) + (dialogBox?.width ?? 0)).toBeLessThanOrEqual(1280);
  // Canvas visible
  expect(canvasBox?.width).toBeGreaterThan(0);
  // Options visible
  expect(optionsBox?.width).toBeGreaterThan(0);

  fs.unlinkSync(tmpPng);
});

test('import PNG dialog — Pixel Tablet portrait (800×1280): dialog fits viewport', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1280 });
  const tmpPng = path.join(__dirname, '../test-results/tmp-tablet-portrait.png');
  fs.mkdirSync(path.dirname(tmpPng), { recursive: true });
  fs.writeFileSync(tmpPng, make64x64Png());

  await page.goto('/');
  await page.getByRole('button', { name: 'File menu' }).click();

  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: /import file/i }).click(),
  ]);
  await fileChooser.setFiles(tmpPng);
  await page.waitForSelector('.dialog-layout', { timeout: 8000 });
  await page.waitForTimeout(300);

  const dialogBox = await page.locator('mat-dialog-container').boundingBox();
  const canvasBox = await page.locator('.preview-canvas').boundingBox();
  const optionsBox = await page.locator('.options-column').boundingBox();

  await page.screenshot({ path: 'test-results/tablet-portrait.png', fullPage: false });

  // Dialog must fit within viewport width
  expect((dialogBox?.x ?? 0) + (dialogBox?.width ?? 0)).toBeLessThanOrEqual(800);
  // Canvas visible
  expect(canvasBox?.width).toBeGreaterThan(0);
  // Options visible
  expect(optionsBox?.width).toBeGreaterThan(0);

  fs.unlinkSync(tmpPng);
});

test('import PNG dialog — Pixel Tablet landscape realistic (1280×692): canvas fits without overflow', async ({ page }) => {
  // 1280×692 models the real Pixel Tablet in landscape after Chrome toolbar
  // (~56px) + status bar (~28px) + gesture nav (~24px) subtract from 800px.
  // This is the viewport where the canvas previously overflowed mat-dialog-content.
  await page.setViewportSize({ width: 1280, height: 692 });
  const tmpPng = path.join(__dirname, '../test-results/tmp-tablet-realistic.png');
  fs.mkdirSync(path.dirname(tmpPng), { recursive: true });
  fs.writeFileSync(tmpPng, make64x64Png());

  await page.goto('/');
  await page.getByRole('button', { name: 'File menu' }).click();

  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: /import file/i }).click(),
  ]);
  await fileChooser.setFiles(tmpPng);
  await page.waitForSelector('.dialog-layout', { timeout: 8000 });
  await page.waitForTimeout(300);

  const viewport = page.viewportSize();
  const dialogBox = await page.locator('mat-dialog-container').boundingBox();
  const canvasBox = await page.locator('.preview-canvas').boundingBox();
  const contentBox = await page.locator('mat-dialog-content').boundingBox();

  // Canvas must not overflow the mat-dialog-content area (+1px rounding tolerance)
  expect(canvasBox?.height ?? 0).toBeLessThanOrEqual((contentBox?.height ?? 0) + 1);

  // Dialog must fit entirely within the viewport height
  const dialogBottom = (dialogBox?.y ?? 0) + (dialogBox?.height ?? 0);
  expect(dialogBottom).toBeLessThanOrEqual(viewport?.height ?? 692);

  fs.unlinkSync(tmpPng);
});
