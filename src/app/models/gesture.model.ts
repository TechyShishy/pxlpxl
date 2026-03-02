export enum GestureState {
  Idle = 'idle',
  Drawing = 'drawing',
  Pinching = 'pinching',
  Panning = 'panning',
  LongPress = 'long-press',
}

/**
 * Screen-space bead dimensions (width and height in pixels).
 * For square/peyote grids both are equal to the zoom scale.
 * For triangular grids the width is narrower than the height to
 * produce the correct wedge opening angle for radial tiling.
 */
export interface BeadSize {
  /** Bead width in screen pixels. */
  width: number;
  /** Bead height in screen pixels. */
  height: number;
}

export interface ViewTransform {
  /** Zoom scale factor (1 = 100%) */
  scale: number;
  /** Pan offset X in screen pixels */
  offsetX: number;
  /** Pan offset Y in screen pixels */
  offsetY: number;
}

export interface GestureEvent {
  /** Current gesture state */
  state: GestureState;
  /** Screen coordinates of the primary pointer */
  screenX: number;
  screenY: number;
  /** For pinch: scale delta since gesture start */
  scaleDelta?: number;
  /** For pan: translation delta since last event */
  panDeltaX?: number;
  panDeltaY?: number;
}
