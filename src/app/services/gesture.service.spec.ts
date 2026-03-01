import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { GestureService } from './gesture.service';
import { GestureState } from '../models';

function makePointerEvent(type: string, overrides: Partial<PointerEvent> = {}): PointerEvent {
  return {
    pointerId: 1,
    clientX: 0,
    clientY: 0,
    shiftKey: false,
    ...overrides,
  } as PointerEvent;
}

const CANVAS_RECT = { left: 0, top: 0, width: 400, height: 400 } as DOMRect;

describe('GestureService', () => {
  let service: GestureService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GestureService);
  });

  afterEach(() => {
    service.reset();
  });

  describe('initial state', () => {
    it('should start in Idle state', () => {
      expect(service.gestureState()).toBe(GestureState.Idle);
    });

    it('should have null longPressPosition', () => {
      expect(service.longPressPosition()).toBeNull();
    });
  });

  describe('single pointer draw lifecycle', () => {
    it('should transition to Drawing on pointer down', () => {
      const e = makePointerEvent('pointerdown', { clientX: 100, clientY: 50 });
      service.handlePointerDown(e, CANVAS_RECT);
      expect(service.gestureState()).toBe(GestureState.Drawing);
    });

    it('should call onDraw start on pointer down', () => {
      const drawSpy = vi.fn();
      service.onDraw = drawSpy;
      const e = makePointerEvent('pointerdown', { clientX: 100, clientY: 50 });
      service.handlePointerDown(e, CANVAS_RECT);
      expect(drawSpy).toHaveBeenCalledWith(100, 50, 'start', false);
    });

    it('should call onDraw move on pointer move', () => {
      const drawSpy = vi.fn();
      service.onDraw = drawSpy;
      service.handlePointerDown(makePointerEvent('pointerdown', { clientX: 100, clientY: 50 }), CANVAS_RECT);
      service.handlePointerMove(makePointerEvent('pointermove', { clientX: 110, clientY: 60 }));
      expect(drawSpy).toHaveBeenCalledWith(110, 60, 'move', false);
    });

    it('should call onDraw end and return to Idle on pointer up', () => {
      const drawSpy = vi.fn();
      service.onDraw = drawSpy;
      service.handlePointerDown(makePointerEvent('pointerdown', { clientX: 100, clientY: 50 }), CANVAS_RECT);
      service.handlePointerUp(makePointerEvent('pointerup', { clientX: 120, clientY: 60 }));
      expect(drawSpy).toHaveBeenCalledWith(120, 60, 'end', false);
      expect(service.gestureState()).toBe(GestureState.Idle);
    });
  });

  describe('long press', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should trigger long press after 500ms hold', () => {
      const longPressSpy = vi.fn();
      service.onLongPress = longPressSpy;
      service.handlePointerDown(makePointerEvent('pointerdown', { clientX: 50, clientY: 75 }), CANVAS_RECT);
      vi.advanceTimersByTime(500);
      expect(service.gestureState()).toBe(GestureState.LongPress);
      expect(service.longPressPosition()).toEqual({ x: 50, y: 75 });
      expect(longPressSpy).toHaveBeenCalledWith(50, 75);
    });

    it('should not trigger long press before 500ms', () => {
      const longPressSpy = vi.fn();
      service.onLongPress = longPressSpy;
      service.handlePointerDown(makePointerEvent('pointerdown', { clientX: 50, clientY: 75 }), CANVAS_RECT);
      vi.advanceTimersByTime(499);
      expect(service.gestureState()).toBe(GestureState.Drawing);
      expect(longPressSpy).not.toHaveBeenCalled();
    });

    it('should cancel long press if pointer moves more than 5px', () => {
      const longPressSpy = vi.fn();
      service.onLongPress = longPressSpy;
      service.handlePointerDown(makePointerEvent('pointerdown', { clientX: 50, clientY: 75 }), CANVAS_RECT);
      // Move 6px away
      service.handlePointerMove(makePointerEvent('pointermove', { clientX: 56, clientY: 75 }));
      vi.advanceTimersByTime(500);
      expect(longPressSpy).not.toHaveBeenCalled();
    });

    it('should not cancel long press for small movement', () => {
      const longPressSpy = vi.fn();
      service.onLongPress = longPressSpy;
      service.handlePointerDown(makePointerEvent('pointerdown', { clientX: 50, clientY: 75 }), CANVAS_RECT);
      // Move only 3px
      service.handlePointerMove(makePointerEvent('pointermove', { clientX: 52, clientY: 77 }));
      vi.advanceTimersByTime(500);
      expect(longPressSpy).toHaveBeenCalled();
    });

    it('should cancel long press on pointer up', () => {
      const longPressSpy = vi.fn();
      service.onLongPress = longPressSpy;
      service.handlePointerDown(makePointerEvent('pointerdown', { clientX: 50, clientY: 75 }), CANVAS_RECT);
      service.handlePointerUp(makePointerEvent('pointerup', { clientX: 50, clientY: 75 }));
      vi.advanceTimersByTime(500);
      expect(longPressSpy).not.toHaveBeenCalled();
    });
  });

  describe('two-pointer pinch', () => {
    it('should transition to Pinching on second pointer down', () => {
      service.handlePointerDown(makePointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 }), CANVAS_RECT);
      service.handlePointerDown(makePointerEvent('pointerdown', { pointerId: 2, clientX: 200, clientY: 200 }), CANVAS_RECT);
      expect(service.gestureState()).toBe(GestureState.Pinching);
    });

    it('should call onPinch with scale delta on move', () => {
      const pinchSpy = vi.fn();
      service.onPinch = pinchSpy;

      service.handlePointerDown(makePointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 }), CANVAS_RECT);
      service.handlePointerDown(makePointerEvent('pointerdown', { pointerId: 2, clientX: 200, clientY: 100 }), CANVAS_RECT);
      // Move second pointer further apart (zoom in)
      service.handlePointerMove(makePointerEvent('pointermove', { pointerId: 2, clientX: 300, clientY: 100 }));

      expect(pinchSpy).toHaveBeenCalled();
      const scaleDelta = pinchSpy.mock.calls[0][0];
      expect(scaleDelta).toBeGreaterThan(1); // fingers moved apart = zoom in
    });

    it('should transition to Panning when going from 2 to 1 pointer', () => {
      service.handlePointerDown(makePointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 }), CANVAS_RECT);
      service.handlePointerDown(makePointerEvent('pointerdown', { pointerId: 2, clientX: 200, clientY: 200 }), CANVAS_RECT);
      service.handlePointerUp(makePointerEvent('pointerup', { pointerId: 2, clientX: 200, clientY: 200 }));
      expect(service.gestureState()).toBe(GestureState.Panning);
    });
  });

  describe('handlePointerCancel', () => {
    it('should behave like handlePointerUp', () => {
      const drawSpy = vi.fn();
      service.onDraw = drawSpy;
      service.handlePointerDown(makePointerEvent('pointerdown', { clientX: 100, clientY: 50 }), CANVAS_RECT);
      service.handlePointerCancel(makePointerEvent('pointercancel', { clientX: 100, clientY: 50 }));
      expect(drawSpy).toHaveBeenCalledWith(100, 50, 'end', false);
      expect(service.gestureState()).toBe(GestureState.Idle);
    });
  });

  describe('edge swipe', () => {
    it('should detect right swipe from left edge', () => {
      const edgeSpy = vi.fn();
      service.onEdgeSwipe = edgeSpy;
      service.checkEdgeSwipe(10, 100, 400); // starts at x=10 (< 20 threshold), moves 90px
      expect(edgeSpy).toHaveBeenCalledWith('right');
    });

    it('should detect left swipe from right edge', () => {
      const edgeSpy = vi.fn();
      service.onEdgeSwipe = edgeSpy;
      service.checkEdgeSwipe(390, 300, 400); // starts at x=390 (> 400-20), moves 90px left
      expect(edgeSpy).toHaveBeenCalledWith('left');
    });

    it('should not detect swipe if distance too short', () => {
      const edgeSpy = vi.fn();
      service.onEdgeSwipe = edgeSpy;
      service.checkEdgeSwipe(10, 40, 400); // only 30px distance (< 50)
      expect(edgeSpy).not.toHaveBeenCalled();
    });

    it('should not detect swipe if not starting from edge', () => {
      const edgeSpy = vi.fn();
      service.onEdgeSwipe = edgeSpy;
      service.checkEdgeSwipe(100, 200, 400); // starts at x=100 (not an edge)
      expect(edgeSpy).not.toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('should return to Idle and clear state', () => {
      service.handlePointerDown(makePointerEvent('pointerdown'), CANVAS_RECT);
      expect(service.gestureState()).toBe(GestureState.Drawing);
      service.reset();
      expect(service.gestureState()).toBe(GestureState.Idle);
    });
  });

  describe('multi-tap (double / triple tap)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function tap(service: GestureService, x = 50, y = 50): void {
      service.handlePointerDown(
        makePointerEvent('pointerdown', { clientX: x, clientY: y, pointerType: 'touch' as unknown as string }),
        CANVAS_RECT,
      );
      service.handlePointerUp(
        makePointerEvent('pointerup', { clientX: x, clientY: y, pointerType: 'touch' as unknown as string }),
      );
    }

    it('should fire onDoubleTap after two quick touch taps', () => {
      const spy = vi.fn();
      service.onDoubleTap = spy;
      tap(service);
      tap(service);
      vi.advanceTimersByTime(350);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should fire onTripleTap after three quick touch taps', () => {
      const tripleSpy = vi.fn();
      const doubleSpy = vi.fn();
      service.onTripleTap = tripleSpy;
      service.onDoubleTap = doubleSpy;
      tap(service);
      tap(service);
      tap(service);
      vi.advanceTimersByTime(350);
      expect(tripleSpy).toHaveBeenCalledTimes(1);
      expect(doubleSpy).not.toHaveBeenCalled();
    });

    it('should not fire double-tap for a single tap', () => {
      const spy = vi.fn();
      service.onDoubleTap = spy;
      tap(service);
      vi.advanceTimersByTime(350);
      expect(spy).not.toHaveBeenCalled();
    });

    it('should not fire double-tap when taps are too far apart in time', () => {
      const spy = vi.fn();
      service.onDoubleTap = spy;
      tap(service);
      vi.advanceTimersByTime(400); // exceeds TAP_WINDOW=350
      tap(service);
      vi.advanceTimersByTime(350);
      expect(spy).not.toHaveBeenCalled();
    });

    it('should not fire double-tap for mouse pointerType', () => {
      const spy = vi.fn();
      service.onDoubleTap = spy;
      // mouse pointer events
      service.handlePointerDown(
        makePointerEvent('pointerdown', { clientX: 50, clientY: 50, pointerType: 'mouse' as unknown as string }),
        CANVAS_RECT,
      );
      service.handlePointerUp(
        makePointerEvent('pointerup', { clientX: 50, clientY: 50, pointerType: 'mouse' as unknown as string }),
      );
      service.handlePointerDown(
        makePointerEvent('pointerdown', { clientX: 50, clientY: 50, pointerType: 'mouse' as unknown as string }),
        CANVAS_RECT,
      );
      service.handlePointerUp(
        makePointerEvent('pointerup', { clientX: 50, clientY: 50, pointerType: 'mouse' as unknown as string }),
      );
      vi.advanceTimersByTime(350);
      expect(spy).not.toHaveBeenCalled();
    });

    it('should not fire double-tap when tap moves more than 5px', () => {
      const spy = vi.fn();
      service.onDoubleTap = spy;
      // First tap: pointer moves 10px during hold
      service.handlePointerDown(
        makePointerEvent('pointerdown', { clientX: 50, clientY: 50, pointerType: 'touch' as unknown as string }),
        CANVAS_RECT,
      );
      service.handlePointerMove(makePointerEvent('pointermove', { clientX: 60, clientY: 50 }));
      service.handlePointerUp(
        makePointerEvent('pointerup', { clientX: 60, clientY: 50, pointerType: 'touch' as unknown as string }),
      );
      tap(service);
      vi.advanceTimersByTime(350);
      expect(spy).not.toHaveBeenCalled();
    });

    it('should reset tap state on reset()', () => {
      const spy = vi.fn();
      service.onDoubleTap = spy;
      tap(service);
      service.reset(); // clears tap state
      tap(service);
      vi.advanceTimersByTime(350);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('unknown pointer handling', () => {
    it('should ignore move for untracked pointer', () => {
      const drawSpy = vi.fn();
      service.onDraw = drawSpy;
      // Move without a prior down
      service.handlePointerMove(makePointerEvent('pointermove', { pointerId: 99, clientX: 100, clientY: 50 }));
      expect(drawSpy).not.toHaveBeenCalled();
    });

    it('should work without callbacks set', () => {
      // No callbacks set — should not throw
      service.handlePointerDown(makePointerEvent('pointerdown'), CANVAS_RECT);
      service.handlePointerMove(makePointerEvent('pointermove', { clientX: 10, clientY: 10 }));
      service.handlePointerUp(makePointerEvent('pointerup'));
      expect(service.gestureState()).toBe(GestureState.Idle);
    });
  });
});
