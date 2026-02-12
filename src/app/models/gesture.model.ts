export enum GestureState {
  Idle = 'idle',
  Drawing = 'drawing',
  Pinching = 'pinching',
  Panning = 'panning',
  LongPress = 'long-press',
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
