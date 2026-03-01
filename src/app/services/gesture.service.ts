import { Injectable, signal, computed } from '@angular/core';
import { GestureState, PixelCoord } from '../models';

/** Threshold in pixels before a pointer-down is classified as a drag vs. long-press */
const MOVE_THRESHOLD = 5;
/** Duration in ms to trigger a long-press */
const LONG_PRESS_DELAY = 500;
/** Maximum touch duration (ms) to count as a tap (not a hold) */
const TAP_MAX_DURATION = 250;
/** Window (ms) within which consecutive taps are counted for multi-tap */
const TAP_WINDOW = 350;

interface PointerInfo {
  id: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  downTime: number;
}

@Injectable({ providedIn: 'root' })
export class GestureService {
  readonly gestureState = signal<GestureState>(GestureState.Idle);
  readonly longPressPosition = signal<PixelCoord | null>(null);

  private pointers = new Map<number, PointerInfo>();
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private initialPinchDistance = 0;
  private lastPinchDistance = 0;

  /** Callbacks set by the canvas viewport */
  onDraw: ((x: number, y: number, phase: 'start' | 'move' | 'end', shiftKey: boolean) => void) | null = null;
  onPinch: ((scaleDelta: number, centerX: number, centerY: number) => void) | null = null;
  onPan: ((deltaX: number, deltaY: number) => void) | null = null;
  onLongPress: ((screenX: number, screenY: number) => void) | null = null;
  onEdgeSwipe: ((direction: 'left' | 'right') => void) | null = null;
  /** Fired when a touch double-tap is detected (no significant movement, within TAP_WINDOW) */
  onDoubleTap: (() => void) | null = null;
  /** Fired when a touch triple-tap is detected */
  onTripleTap: (() => void) | null = null;

  private tapCount = 0;
  private tapWindowTimer: ReturnType<typeof setTimeout> | null = null;
  private tapX = 0;
  private tapY = 0;

  handlePointerDown(e: PointerEvent, canvasRect: DOMRect): void {
    const info: PointerInfo = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      downTime: Date.now(),
    };
    this.pointers.set(e.pointerId, info);

    if (this.pointers.size === 1) {
      // Single pointer — could be draw or long-press
      this.startLongPressTimer(e.clientX, e.clientY);
      this.gestureState.set(GestureState.Drawing);
      this.onDraw?.(e.clientX, e.clientY, 'start', e.shiftKey);
    } else if (this.pointers.size === 2) {
      // Two pointers — transition to pinch/pan
      this.cancelLongPress();
      this.gestureState.set(GestureState.Pinching);
      this.initialPinchDistance = this.getPointerDistance();
      this.lastPinchDistance = this.initialPinchDistance;
    }
  }

  handlePointerMove(e: PointerEvent): void {
    const info = this.pointers.get(e.pointerId);
    if (!info) return;

    info.currentX = e.clientX;
    info.currentY = e.clientY;

    const state = this.gestureState();

    // Check if moved enough to cancel long-press
    const dx = e.clientX - info.startX;
    const dy = e.clientY - info.startY;
    if (Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD) {
      this.cancelLongPress();
    }

    if (state === GestureState.Drawing && this.pointers.size === 1) {
      this.onDraw?.(e.clientX, e.clientY, 'move', e.shiftKey);
    } else if (
      (state === GestureState.Pinching || state === GestureState.Panning) &&
      this.pointers.size === 2
    ) {
      // Pinch zoom
      const dist = this.getPointerDistance();
      if (this.lastPinchDistance > 0) {
        const scaleDelta = dist / this.lastPinchDistance;
        const center = this.getPointerCenter();
        this.onPinch?.(scaleDelta, center.x, center.y);
      }
      this.lastPinchDistance = dist;

      // Pan (track midpoint movement)
      const center = this.getPointerCenter();
      // Pan is handled implicitly through pinch center tracking
    }
  }

  handlePointerUp(e: PointerEvent): void {
    this.cancelLongPress();

    const info = this.pointers.get(e.pointerId);
    const state = this.gestureState();
    if (state === GestureState.Drawing && this.pointers.size === 1) {
      this.onDraw?.(e.clientX, e.clientY, 'end', e.shiftKey);
    }

    // Detect touch taps for multi-tap gestures (double/triple tap)
    if (
      e.pointerType === 'touch' &&
      info &&
      this.pointers.size === 1 // still 1 pointer before delete means this was a solo touch
    ) {
      const dx = info.currentX - info.startX;
      const dy = info.currentY - info.startY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const duration = Date.now() - info.downTime;
      if (dist <= MOVE_THRESHOLD && duration < TAP_MAX_DURATION) {
        this.recordTap(info.startX, info.startY);
      }
    }

    this.pointers.delete(e.pointerId);

    if (this.pointers.size === 0) {
      this.gestureState.set(GestureState.Idle);
      this.initialPinchDistance = 0;
      this.lastPinchDistance = 0;
    } else if (this.pointers.size === 1) {
      // Went from 2 pointers to 1 — don't restart drawing
      this.gestureState.set(GestureState.Panning);
    }
  }

  handlePointerCancel(e: PointerEvent): void {
    this.handlePointerUp(e);
  }

  /** Check for edge swipes (called on pointerup for single-pointer gestures) */
  checkEdgeSwipe(startX: number, endX: number, canvasWidth: number): void {
    const edgeThreshold = 20;
    const swipeMinDistance = 50;

    if (startX < edgeThreshold && endX - startX > swipeMinDistance) {
      this.onEdgeSwipe?.('right'); // Swipe from left edge → open left sidebar
    } else if (startX > canvasWidth - edgeThreshold && startX - endX > swipeMinDistance) {
      this.onEdgeSwipe?.('left'); // Swipe from right edge → open right sidebar
    }
  }

  reset(): void {
    this.cancelLongPress();
    this.resetTapState();
    this.pointers.clear();
    this.gestureState.set(GestureState.Idle);
    this.initialPinchDistance = 0;
    this.lastPinchDistance = 0;
  }

  private recordTap(x: number, y: number): void {
    this.tapX = x;
    this.tapY = y;
    this.tapCount++;
    if (this.tapWindowTimer !== null) {
      clearTimeout(this.tapWindowTimer);
    }
    this.tapWindowTimer = setTimeout(() => {
      const count = this.tapCount;
      this.tapCount = 0;
      this.tapWindowTimer = null;
      if (count === 2) {
        this.onDoubleTap?.();
      } else if (count >= 3) {
        this.onTripleTap?.();
      }
    }, TAP_WINDOW);
  }

  private resetTapState(): void {
    this.tapCount = 0;
    if (this.tapWindowTimer !== null) {
      clearTimeout(this.tapWindowTimer);
      this.tapWindowTimer = null;
    }
  }

  private startLongPressTimer(x: number, y: number): void {
    this.cancelLongPress();
    this.longPressTimer = setTimeout(() => {
      this.gestureState.set(GestureState.LongPress);
      this.longPressPosition.set({ x, y });
      this.onLongPress?.(x, y);
    }, LONG_PRESS_DELAY);
  }

  private cancelLongPress(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  private getPointerDistance(): number {
    const pts = Array.from(this.pointers.values());
    if (pts.length < 2) return 0;
    const dx = pts[0].currentX - pts[1].currentX;
    const dy = pts[0].currentY - pts[1].currentY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private getPointerCenter(): { x: number; y: number } {
    const pts = Array.from(this.pointers.values());
    if (pts.length < 2) return { x: pts[0]?.currentX ?? 0, y: pts[0]?.currentY ?? 0 };
    return {
      x: (pts[0].currentX + pts[1].currentX) / 2,
      y: (pts[0].currentY + pts[1].currentY) / 2,
    };
  }
}
