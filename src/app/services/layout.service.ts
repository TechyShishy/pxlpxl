import { Injectable, signal, computed, inject, NgZone } from '@angular/core';

export type Orientation = 'landscape' | 'portrait';

@Injectable({ providedIn: 'root' })
export class LayoutService {
  private readonly ngZone = inject(NgZone);

  readonly leftSidebarOpen = signal<boolean>(true);
  readonly rightSidebarOpen = signal<boolean>(true);
  readonly loadPanelOpen = signal<boolean>(false);
  readonly orientation = signal<Orientation>(this.detectOrientation());

  readonly isLandscape = computed(() => this.orientation() === 'landscape');
  readonly isPortrait = computed(() => this.orientation() === 'portrait');

  constructor() {
    // Listen for orientation changes outside Angular zone for performance
    this.ngZone.runOutsideAngular(() => {
      const mq = globalThis.matchMedia?.('(orientation: landscape)');
      mq?.addEventListener('change', (e) => {
        this.ngZone.run(() => {
          this.orientation.set(e.matches ? 'landscape' : 'portrait');
          // Auto-close sidebars in portrait
          if (!e.matches) {
            this.leftSidebarOpen.set(false);
            this.rightSidebarOpen.set(false);
          } else {
            this.leftSidebarOpen.set(true);
            this.rightSidebarOpen.set(true);
          }
        });
      });
    });
  }

  toggleLeftSidebar(): void {
    this.leftSidebarOpen.update((v) => !v);
  }

  toggleRightSidebar(): void {
    this.rightSidebarOpen.update((v) => !v);
  }

  closeAllSidebars(): void {
    this.leftSidebarOpen.set(false);
    this.rightSidebarOpen.set(false);
  }

  openAllSidebars(): void {
    this.leftSidebarOpen.set(true);
    this.rightSidebarOpen.set(true);
  }

  openLoadPanel(): void {
    this.loadPanelOpen.set(true);
  }

  closeLoadPanel(): void {
    this.loadPanelOpen.set(false);
  }

  private detectOrientation(): Orientation {
    if (typeof globalThis.matchMedia === 'undefined') return 'landscape';
    return globalThis.matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait';
  }
}
