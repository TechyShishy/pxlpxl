import { TestBed } from '@angular/core/testing';
import { LayoutService } from './layout.service';

describe('LayoutService', () => {
  let service: LayoutService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LayoutService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('loadPanelOpen', () => {
    it('should default to false', () => {
      expect(service.loadPanelOpen()).toBe(false);
    });

    it('should be true after openLoadPanel', () => {
      service.openLoadPanel();
      expect(service.loadPanelOpen()).toBe(true);
    });

    it('should be false after closeLoadPanel', () => {
      service.openLoadPanel();
      service.closeLoadPanel();
      expect(service.loadPanelOpen()).toBe(false);
    });
  });

  describe('sidebar toggles', () => {
    it('should default sidebars to open', () => {
      expect(service.leftSidebarOpen()).toBe(true);
      expect(service.rightSidebarOpen()).toBe(true);
    });

    it('should toggle left sidebar', () => {
      service.toggleLeftSidebar();
      expect(service.leftSidebarOpen()).toBe(false);
      service.toggleLeftSidebar();
      expect(service.leftSidebarOpen()).toBe(true);
    });

    it('should toggle right sidebar', () => {
      service.toggleRightSidebar();
      expect(service.rightSidebarOpen()).toBe(false);
      service.toggleRightSidebar();
      expect(service.rightSidebarOpen()).toBe(true);
    });

    it('should close all sidebars', () => {
      service.closeAllSidebars();
      expect(service.leftSidebarOpen()).toBe(false);
      expect(service.rightSidebarOpen()).toBe(false);
    });

    it('should open all sidebars', () => {
      service.closeAllSidebars();
      service.openAllSidebars();
      expect(service.leftSidebarOpen()).toBe(true);
      expect(service.rightSidebarOpen()).toBe(true);
    });
  });

  describe('orientation', () => {
    it('should default to landscape when matchMedia is available', () => {
      expect(service.isLandscape()).toBe(true);
      expect(service.isPortrait()).toBe(false);
    });
  });
});
