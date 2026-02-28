import { Injectable, signal, computed, inject, NgZone } from '@angular/core';

export type Orientation = 'landscape' | 'portrait';

@Injectable({ providedIn: 'root' })
export class LayoutService {
  private readonly ngZone = inject(NgZone);

  private readonly _leftSidebarOpen = signal<boolean>(true);
  private readonly _rightSidebarOpen = signal<boolean>(true);
  private readonly _loadPanelOpen = signal<boolean>(false);
  private readonly _orientation = signal<Orientation>(this.detectOrientation());

  readonly leftSidebarOpen = this._leftSidebarOpen.asReadonly();
  readonly rightSidebarOpen = this._rightSidebarOpen.asReadonly();
  readonly loadPanelOpen = this._loadPanelOpen.asReadonly();
  readonly orientation = this._orientation.asReadonly();

  readonly isLandscape = computed(() => this._orientation() === 'landscape');
  readonly isPortrait = computed(() => this._orientation() === 'portrait');

  constructor() {
    // Listen for orientation changes outside Angular zone for performance
    this.ngZone.runOutsideAngular(() => {
      const mq = globalThis.matchMedia?.('(orientation: landscape)');
      mq?.addEventListener('change', (e) => {
        this.ngZone.run(() => {
          this._orientation.set(e.matches ? 'landscape' : 'portrait');
          // Auto-close sidebars in portrait
          if (!e.matches) {
            this._leftSidebarOpen.set(false);
            this._rightSidebarOpen.set(false);
          } else {
            this._leftSidebarOpen.set(true);
            this._rightSidebarOpen.set(true);
          }
        });
      });
    });
  }

  toggleLeftSidebar(): void {
    this._leftSidebarOpen.update((v) => !v);
  }

  toggleRightSidebar(): void {
    this._rightSidebarOpen.update((v) => !v);
  }

  closeAllSidebars(): void {
    this._leftSidebarOpen.set(false);
    this._rightSidebarOpen.set(false);
  }

  openAllSidebars(): void {
    this._leftSidebarOpen.set(true);
    this._rightSidebarOpen.set(true);
  }

  openLoadPanel(): void {
    this._loadPanelOpen.set(true);
  }

  closeLoadPanel(): void {
    this._loadPanelOpen.set(false);
  }

  private detectOrientation(): Orientation {
    if (typeof globalThis.matchMedia === 'undefined') return 'landscape';
    return globalThis.matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait';
  }
}
