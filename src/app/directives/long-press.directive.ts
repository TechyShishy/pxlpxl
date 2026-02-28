import { Directive, OnDestroy, output } from '@angular/core';

const LONG_PRESS_DELAY = 500;
const MOVE_THRESHOLD = 5;

/**
 * Attribute directive that detects long-press gestures.
 * Emits `longPress` after 500ms of pointer-down without significant movement.
 * Automatically cancels on pointerup, pointercancel, or movement > 5px.
 * Cleans up its timer on destroy.
 *
 * Usage:
 * ```html
 * <div appLongPress (longPress)="onLongPress()">
 * ```
 *
 * To programmatically cancel (e.g., on cdkDragStarted):
 * ```html
 * <div appLongPress #lp="appLongPress" (cdkDragStarted)="lp.cancel()">
 * ```
 */
@Directive({
  selector: '[appLongPress]',
  exportAs: 'appLongPress',
  host: {
    '(pointerdown)': 'onPointerDown($event)',
    '(pointermove)': 'onPointerMove($event)',
    '(pointerup)': 'onPointerEnd()',
    '(pointercancel)': 'onPointerEnd()',
  },
})
export class LongPressDirective implements OnDestroy {
  /** Emitted when a long-press is detected (after 500ms without move). */
  readonly longPress = output<void>();

  /**
   * Whether the most recent pointer interaction ended with a long-press.
   * Components can check this in their click handlers to suppress the click.
   * Reset to `false` on the next pointerdown.
   */
  fired = false;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private startPos: { x: number; y: number } | null = null;

  onPointerDown(event: PointerEvent): void {
    this.fired = false;
    this.startPos = { x: event.clientX, y: event.clientY };
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.fired = true;
      this.timer = null;
      this.startPos = null;
      this.longPress.emit();
    }, LONG_PRESS_DELAY);
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.startPos) return;
    const dx = event.clientX - this.startPos.x;
    const dy = event.clientY - this.startPos.y;
    if (Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD) {
      this.cancel();
    }
  }

  onPointerEnd(): void {
    this.clearTimer();
  }

  /** Programmatically cancel a pending long-press (e.g., when CDK drag starts). */
  cancel(): void {
    this.clearTimer();
    this.startPos = null;
  }

  ngOnDestroy(): void {
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
