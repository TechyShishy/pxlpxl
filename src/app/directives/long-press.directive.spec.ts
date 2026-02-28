import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LongPressDirective } from './long-press.directive';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

@Component({
  imports: [LongPressDirective],
  template: `<button appLongPress (longPress)="onLongPress()">Press</button>`,
})
class TestHostComponent {
  longPressCount = 0;
  onLongPress(): void {
    this.longPressCount++;
  }
}

describe('LongPressDirective', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let host: TestHostComponent;
  let button: HTMLButtonElement;

  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    host = fixture.componentInstance;
    button = fixture.nativeElement.querySelector('button');
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function pointerEvent(type: string, x = 0, y = 0): PointerEvent {
    return new PointerEvent(type, {
      clientX: x,
      clientY: y,
      bubbles: true,
    });
  }

  it('should emit longPress after 500ms hold', () => {
    button.dispatchEvent(pointerEvent('pointerdown', 10, 10));
    expect(host.longPressCount).toBe(0);
    vi.advanceTimersByTime(500);
    expect(host.longPressCount).toBe(1);
  });

  it('should not emit if pointer released before 500ms', () => {
    button.dispatchEvent(pointerEvent('pointerdown', 10, 10));
    vi.advanceTimersByTime(200);
    button.dispatchEvent(pointerEvent('pointerup'));
    vi.advanceTimersByTime(400);
    expect(host.longPressCount).toBe(0);
  });

  it('should cancel on pointer move beyond threshold', () => {
    button.dispatchEvent(pointerEvent('pointerdown', 10, 10));
    vi.advanceTimersByTime(100);
    // Move 10px (> 5px threshold)
    button.dispatchEvent(pointerEvent('pointermove', 20, 10));
    vi.advanceTimersByTime(500);
    expect(host.longPressCount).toBe(0);
  });

  it('should not cancel on small movement within threshold', () => {
    button.dispatchEvent(pointerEvent('pointerdown', 10, 10));
    vi.advanceTimersByTime(100);
    // Move 3px (< 5px threshold)
    button.dispatchEvent(pointerEvent('pointermove', 13, 10));
    vi.advanceTimersByTime(500);
    expect(host.longPressCount).toBe(1);
  });

  it('should cancel on pointercancel', () => {
    button.dispatchEvent(pointerEvent('pointerdown', 10, 10));
    vi.advanceTimersByTime(100);
    button.dispatchEvent(pointerEvent('pointercancel'));
    vi.advanceTimersByTime(500);
    expect(host.longPressCount).toBe(0);
  });

  it('should set fired flag after emission', () => {
    const directive = fixture.debugElement.children[0].injector.get(LongPressDirective);
    button.dispatchEvent(pointerEvent('pointerdown', 10, 10));
    expect(directive.fired).toBe(false);
    vi.advanceTimersByTime(500);
    expect(directive.fired).toBe(true);
  });

  it('should reset fired flag on next pointerdown', () => {
    const directive = fixture.debugElement.children[0].injector.get(LongPressDirective);
    button.dispatchEvent(pointerEvent('pointerdown', 10, 10));
    vi.advanceTimersByTime(500);
    expect(directive.fired).toBe(true);
    button.dispatchEvent(pointerEvent('pointerup'));
    button.dispatchEvent(pointerEvent('pointerdown', 10, 10));
    expect(directive.fired).toBe(false);
    vi.advanceTimersByTime(500);
  });

  it('should clean up timer on destroy', () => {
    button.dispatchEvent(pointerEvent('pointerdown', 10, 10));
    vi.advanceTimersByTime(100);
    fixture.destroy();
    vi.advanceTimersByTime(500);
    expect(host.longPressCount).toBe(0);
  });

  it('cancel() should programmatically stop pending long-press', () => {
    const directive = fixture.debugElement.children[0].injector.get(LongPressDirective);
    button.dispatchEvent(pointerEvent('pointerdown', 10, 10));
    vi.advanceTimersByTime(100);
    directive.cancel();
    vi.advanceTimersByTime(500);
    expect(host.longPressCount).toBe(0);
  });
});
