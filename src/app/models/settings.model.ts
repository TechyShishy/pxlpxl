import type { ColorPoolId } from '../utils/color-pools';
import type { GridType } from './project.model';

export type { ColorPoolId } from '../utils/color-pools';

/** Pixel-sampling strategy for PNG import. */
export type SamplingMode = 'nearest' | 'area';

/** Color-quantization algorithm used during PNG import. */
export type QuantizeAlgorithm = 'median-cut' | 'k-means';

/** LocalStorage key for persisted settings. */
export const SETTINGS_STORAGE_KEY = 'pxlpxl-settings';

/** App-wide user preferences, persisted to localStorage. */
export interface Settings {
  /** UI color scheme. */
  theme: 'dark' | 'light';

  // ── Color ─────────────────────────────────────────────────────────────────
  /** Default color pool for new projects and imports. */
  defaultColorPool: ColorPoolId;

  // ── New-project defaults ──────────────────────────────────────────────────
  defaultGridType: GridType;
  defaultWidth: number;
  defaultHeight: number;
  /** Triangular: first-row pixel count. */
  defaultTriangularA: number;
  /** Triangular: per-row growth numerator. */
  defaultTriangularDNum: number;
  /** Triangular: per-row growth denominator. */
  defaultTriangularDDen: number;
  /** Triangular: phase shift. */
  defaultTriangularShift: number;
  /** Triangular: number of rows. */
  defaultTriangularRows: number;

  // ── Editor defaults ──────────────────────────────────────────────────────
  /** Whether the pixel grid overlay is visible when the editor first opens. */
  defaultShowGrid: boolean;
  /** Whether row/column rulers are visible when the editor first opens. */
  defaultShowRulers: boolean;

  // ── Import defaults ───────────────────────────────────────────────────────
  /** Default pixel-sampling mode for PNG imports. */
  defaultSamplingMode: SamplingMode;
  /** Default maximum number of palette colors after quantization. */
  defaultMaxColors: number;
  /** Default quantization algorithm. */
  defaultQuantizeAlgorithm: QuantizeAlgorithm;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  theme: 'dark',
  defaultColorPool: 'any',
  defaultGridType: 'square',
  defaultWidth: 32,
  defaultHeight: 32,
  defaultTriangularA: 1,
  defaultTriangularDNum: 1,
  defaultTriangularDDen: 2,
  defaultTriangularShift: 0,
  defaultTriangularRows: 10,
  defaultShowGrid: true,
  defaultShowRulers: false,
  defaultSamplingMode: 'nearest',
  defaultMaxColors: 32,
  defaultQuantizeAlgorithm: 'median-cut',
} as const;
