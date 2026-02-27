import { describe, it, expect, vi } from 'vitest';
import { renderColumnRuler, renderRowRuler, RulerParams } from './ruler-renderer';

/**
 * Creates a minimal mock CanvasRenderingContext2D with a given viewport size.
 * fillText is captured so tests can assert on drawn labels and their positions.
 */
function makeCtx(
  width: number,
  height: number,
): { ctx: CanvasRenderingContext2D; labels: Array<{ text: string; x: number; y: number }> } {
  const labels: Array<{ text: string; x: number; y: number }> = [];
  const canvas = { width, height } as HTMLCanvasElement;
  const ctx = {
    canvas,
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn((text: string, x: number, y: number) => {
      labels.push({ text: String(text), x: Number(x), y: Number(y) });
    }),
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    fillStyle: '#000000',
  } as unknown as CanvasRenderingContext2D;
  return { ctx, labels };
}

const BASE_PARAMS: Omit<RulerParams, 'canvasWidth' | 'canvasHeight' | 'gridType'> = {
  scale: 20,
  offsetX: 0,
  offsetY: 0,
  bgColor: '#ffffff',
  textColor: '#000000',
};

describe('renderColumnRuler', () => {
  describe('square grid', () => {
    it('labels are at c * scale + scale/2', () => {
      const { ctx, labels } = makeCtx(1000, 20);
      renderColumnRuler(ctx, {
        ...BASE_PARAMS,
        canvasWidth: 4,
        canvasHeight: 4,
        gridType: 'square',
      });
      expect(labels.map((l) => l.text)).toEqual(['1', '2', '3', '4']);
      // Column c (0-indexed) → screen X = c * 20 + 10
      expect(labels[0].x).toBeCloseTo(10);
      expect(labels[1].x).toBeCloseTo(30);
      expect(labels[2].x).toBeCloseTo(50);
      expect(labels[3].x).toBeCloseTo(70);
    });

    it('respects columnParity filter', () => {
      const { ctx: ctxOdd, labels: labelsOdd } = makeCtx(1000, 20);
      renderColumnRuler(ctxOdd, {
        ...BASE_PARAMS,
        canvasWidth: 6,
        canvasHeight: 4,
        gridType: 'square',
        columnParity: 'odd',
      });
      expect(labelsOdd.map((l) => l.text)).toEqual(['1', '3', '5']);

      const { ctx: ctxEven, labels: labelsEven } = makeCtx(1000, 20);
      renderColumnRuler(ctxEven, {
        ...BASE_PARAMS,
        canvasWidth: 6,
        canvasHeight: 4,
        gridType: 'square',
        columnParity: 'even',
      });
      expect(labelsEven.map((l) => l.text)).toEqual(['2', '4', '6']);
    });
  });

  describe('triangular even-d grid', () => {
    it('labels use the same square-grid formula (uniform spacing)', () => {
      const { ctx, labels } = makeCtx(1000, 20);
      // a=1 d=2, 3 rows → max row width = 1+2*2 = 5 but canvasWidth conveys the widest row
      renderColumnRuler(ctx, {
        ...BASE_PARAMS,
        canvasWidth: 5,
        canvasHeight: 3,
        gridType: 'triangular',
        triangularA: 1,
        triangularD: 2,
      });
      expect(labels.map((l) => l.text)).toEqual(['1', '2', '3', '4', '5']);
      // Even-d falls through to standard c * scale + scale/2
      expect(labels[0].x).toBeCloseTo(10);
      expect(labels[1].x).toBeCloseTo(30);
    });
  });

  describe('triangular odd-d grid', () => {
    it('labels every visual column at stride-1 spacing', () => {
      // a=1, d=1, canvasHeight=5 → maxWidth = 5, visualColumns = 2*5-1 = 9
      const { ctx, labels } = makeCtx(1000, 20);
      renderColumnRuler(ctx, {
        ...BASE_PARAMS,
        canvasWidth: 5, // canvasWidth is ignored for odd-d triangular; maxWidth drives iteration
        canvasHeight: 5,
        gridType: 'triangular',
        triangularA: 1,
        triangularD: 1,
      });
      // 9 visual column labels expected
      expect(labels.map((l) => l.text)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
      // Column c → screenX = c * 20 + 0 + 10 = c * 20 + 10
      expect(labels[0].x).toBeCloseTo(10);   // c=0: 0*20+10 = 10
      expect(labels[1].x).toBeCloseTo(30);   // c=1: 1*20+10 = 30
      expect(labels[2].x).toBeCloseTo(50);   // c=2: 2*20+10 = 50
      expect(labels[3].x).toBeCloseTo(70);   // c=3: 3*20+10 = 70
      expect(labels[4].x).toBeCloseTo(90);   // c=4: 4*20+10 = 90
      expect(labels[5].x).toBeCloseTo(110);  // c=5: 5*20+10 = 110
      expect(labels[6].x).toBeCloseTo(130);  // c=6: 6*20+10 = 130
      expect(labels[7].x).toBeCloseTo(150);  // c=7: 7*20+10 = 150
      expect(labels[8].x).toBeCloseTo(170);  // c=8: 8*20+10 = 170
    });

    it('limits labels to viewport width', () => {
      // Viewport only 100px wide; at scale=20, stride-1 spacing = 20px per col.
      // visualColumns = 9, cols at x=10,30,50,70,90,110,... → only 0..4 fit
      const { ctx, labels } = makeCtx(100, 20);
      renderColumnRuler(ctx, {
        ...BASE_PARAMS,
        canvasWidth: 5,
        canvasHeight: 5,
        gridType: 'triangular',
        triangularA: 1,
        triangularD: 1,
        columnParity: 'all',
      });
      expect(labels.map((l) => l.text)).toEqual(['1', '2', '3', '4', '5']);
    });

    it('computes column count from triangularA and triangularD, not canvasWidth', () => {
      // a=3, d=3, canvasHeight=3 → maxWidth = 9, visualColumns = 2*9-1 = 17
      const { ctx, labels } = makeCtx(2000, 20);
      renderColumnRuler(ctx, {
        ...BASE_PARAMS,
        canvasWidth: 1, // irrelevant for odd-d triangular
        canvasHeight: 3,
        gridType: 'triangular',
        triangularA: 3,
        triangularD: 3,
        columnParity: 'all',
      });
      expect(labels).toHaveLength(17);
      expect(labels[0].text).toBe('1');
      expect(labels[16].text).toBe('17');
      // Column 0 → 0*20+10 = 10
      expect(labels[0].x).toBeCloseTo(10);
      // Column 16 → 16*20+10 = 330
      expect(labels[16].x).toBeCloseTo(330);
    });

    it('respects columnParity filter', () => {
      const { ctx: ctxOdd, labels: labelsOdd } = makeCtx(1000, 20);
      renderColumnRuler(ctxOdd, {
        ...BASE_PARAMS,
        canvasWidth: 5,
        canvasHeight: 5,
        gridType: 'triangular',
        triangularA: 1,
        triangularD: 1,
        columnParity: 'odd',
      });
      expect(labelsOdd.map((l) => l.text)).toEqual(['1', '3', '5', '7', '9']);

      const { ctx: ctxEven, labels: labelsEven } = makeCtx(1000, 20);
      renderColumnRuler(ctxEven, {
        ...BASE_PARAMS,
        canvasWidth: 5,
        canvasHeight: 5,
        gridType: 'triangular',
        triangularA: 1,
        triangularD: 1,
        columnParity: 'even',
      });
      expect(labelsEven.map((l) => l.text)).toEqual(['2', '4', '6', '8']);
    });
  });
});

describe('renderRowRuler', () => {
  describe('square grid', () => {
    it('labels are at r * scale + scale/2', () => {
      const { ctx, labels } = makeCtx(20, 1000);
      renderRowRuler(ctx, {
        ...BASE_PARAMS,
        canvasWidth: 4,
        canvasHeight: 4,
        gridType: 'square',
      });
      expect(labels.map((l) => l.text)).toEqual(['1', '2', '3', '4']);
      // Row r (0-indexed) → screen Y = r * 20 + 10
      expect(labels[0].y).toBeCloseTo(10);
      expect(labels[1].y).toBeCloseTo(30);
      expect(labels[2].y).toBeCloseTo(50);
      expect(labels[3].y).toBeCloseTo(70);
    });
  });

  describe('triangular odd-d grid', () => {
    it('row centres use scale/2 vertical pitch', () => {
      // a=1, d=1, canvasHeight=5, scale=40 (half-pitch=20 > MIN_LABEL_SPACING=14)
      // Row r centre Y = r * (40/2) + 20 = r * 20 + 20
      const { ctx, labels } = makeCtx(20, 1000);
      renderRowRuler(ctx, {
        ...BASE_PARAMS,
        scale: 40,
        canvasWidth: 5,
        canvasHeight: 5,
        gridType: 'triangular',
        triangularA: 1,
        triangularD: 1,
      });
      expect(labels.map((l) => l.text)).toEqual(['1', '2', '3', '4', '5']);
      expect(labels[0].y).toBeCloseTo(20);   // r=0: 0*20+20 = 20
      expect(labels[1].y).toBeCloseTo(40);   // r=1: 1*20+20 = 40
      expect(labels[2].y).toBeCloseTo(60);   // r=2: 2*20+20 = 60
      expect(labels[3].y).toBeCloseTo(80);   // r=3: 3*20+20 = 80
      expect(labels[4].y).toBeCloseTo(100);  // r=4: 4*20+20 = 100
    });

    it('row centres do NOT use full scale pitch (rejects old square-grid behaviour)', () => {
      // Use scale=40 so all rows are visible (half-pitch 20 > MIN_LABEL_SPACING 14).
      const { ctx, labels } = makeCtx(20, 1000);
      renderRowRuler(ctx, {
        ...BASE_PARAMS,
        scale: 40,
        canvasWidth: 5,
        canvasHeight: 5,
        gridType: 'triangular',
        triangularA: 1,
        triangularD: 1,
      });
      // Old (incorrect) formula would place row 1 at 1*40+20 = 60.
      // Correct formula places row 1 at 1*20+20 = 40.
      expect(labels[1].y).not.toBeCloseTo(60);
      expect(labels[1].y).toBeCloseTo(40);
    });

    it('respects rowParity filter', () => {
      const { ctx: ctxOdd, labels: labelsOdd } = makeCtx(20, 1000);
      renderRowRuler(ctxOdd, {
        ...BASE_PARAMS,
        canvasWidth: 5,
        canvasHeight: 6,
        gridType: 'triangular',
        triangularA: 1,
        triangularD: 1,
        rowParity: 'odd',
      });
      expect(labelsOdd.map((l) => l.text)).toEqual(['1', '3', '5']);

      const { ctx: ctxEven, labels: labelsEven } = makeCtx(20, 1000);
      renderRowRuler(ctxEven, {
        ...BASE_PARAMS,
        canvasWidth: 5,
        canvasHeight: 6,
        gridType: 'triangular',
        triangularA: 1,
        triangularD: 1,
        rowParity: 'even',
      });
      expect(labelsEven.map((l) => l.text)).toEqual(['2', '4', '6']);
    });

    it('limits labels to viewport height', () => {
      // Viewport 60px tall; scale=20 half-pitch = 10px.
      // Row r at Y = r*10+10. Rows 0-4 at Y=10,20,30,40,50 → all fit in 60px.
      // Row 5 at Y=60 → exactly at boundary (sy > vpHeight = 60 fails)
      const { ctx, labels } = makeCtx(20, 60);
      renderRowRuler(ctx, {
        ...BASE_PARAMS,
        canvasWidth: 5,
        canvasHeight: 7,
        gridType: 'triangular',
        triangularA: 1,
        triangularD: 1,
      });
      for (const label of labels) {
        expect(label.y).toBeLessThanOrEqual(60);
      }
    });
  });

  describe('triangular even-d grid', () => {
    it('uses standard scale pitch (same as square grid)', () => {
      // Even-d falls through to square-grid path
      const { ctx, labels } = makeCtx(20, 1000);
      renderRowRuler(ctx, {
        ...BASE_PARAMS,
        canvasWidth: 5,
        canvasHeight: 4,
        gridType: 'triangular',
        triangularA: 1,
        triangularD: 2,
      });
      expect(labels.map((l) => l.text)).toEqual(['1', '2', '3', '4']);
      expect(labels[0].y).toBeCloseTo(10);
      expect(labels[1].y).toBeCloseTo(30);
    });
  });
});
