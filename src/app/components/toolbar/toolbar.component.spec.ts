import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ToolbarComponent } from './toolbar.component';
import { HistoryService } from '../../services/history.service';
import { LayoutService } from '../../services/layout.service';
import { CanvasStateService } from '../../services/canvas-state.service';
import { ProjectService } from '../../services/project.service';
import { ExportService } from '../../services/export.service';
import { ImportService } from '../../services/import.service';

describe('ToolbarComponent', () => {
  let component: ToolbarComponent;
  let fixture: ComponentFixture<ToolbarComponent>;
  let mockImportService: {
    openFilePicker: ReturnType<typeof vi.fn>;
    importFile: ReturnType<typeof vi.fn>;
  };
  let mockProjectService: {
    saveProject: ReturnType<typeof vi.fn>;
    currentProjectName: ReturnType<typeof signal<string>>;
    currentId: number | undefined;
    renameProject: ReturnType<typeof vi.fn>;
    newProject: ReturnType<typeof vi.fn>;
  };
  let mockSnackBar: { open: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockImportService = {
      openFilePicker: vi.fn().mockResolvedValue(null),
      importFile: vi.fn().mockResolvedValue(undefined),
    };
    mockProjectService = {
      saveProject: vi.fn().mockResolvedValue(undefined),
      currentProjectName: signal('Test Project'),
      currentId: 1,
      renameProject: vi.fn().mockResolvedValue(undefined),
      newProject: vi.fn(),
    };
    mockSnackBar = { open: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [ToolbarComponent],
      providers: [
        { provide: ImportService, useValue: mockImportService },
        { provide: ProjectService, useValue: mockProjectService },
        { provide: ExportService, useValue: {} },
        { provide: HistoryService, useValue: { canUndo: signal(false), canRedo: signal(false) } },
        { provide: LayoutService, useValue: { openLoadPanel: vi.fn(), isLandscape: signal(true) } },
        { provide: CanvasStateService, useValue: {} },
        { provide: MatDialog, useValue: { open: vi.fn() } },
        { provide: MatSnackBar, useValue: mockSnackBar },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ToolbarComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('error handling', () => {
    it('should show snackbar when import fails', async () => {
      const mockFile = new File(['test'], 'test.pxl');
      mockImportService.openFilePicker.mockResolvedValue(mockFile);
      mockImportService.importFile.mockRejectedValue(new Error('Import failed'));

      await component.onImportFile();

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        expect.stringContaining('Import failed'),
        'Dismiss',
        expect.objectContaining({ duration: expect.any(Number) }),
      );
    });

    it('should show snackbar when save fails', async () => {
      mockProjectService.saveProject.mockRejectedValue(new Error('Save failed'));

      await component.onSaveProject();

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        expect.stringContaining('Save failed'),
        'Dismiss',
        expect.objectContaining({ duration: expect.any(Number) }),
      );
    });

    it('should not show snackbar when import succeeds', async () => {
      const mockFile = new File(['test'], 'test.pxl');
      mockImportService.openFilePicker.mockResolvedValue(mockFile);
      mockImportService.importFile.mockResolvedValue(undefined);

      await component.onImportFile();

      expect(mockSnackBar.open).not.toHaveBeenCalled();
    });

    it('should not show snackbar when save succeeds', async () => {
      mockProjectService.saveProject.mockResolvedValue(undefined);

      await component.onSaveProject();

      expect(mockSnackBar.open).not.toHaveBeenCalled();
    });
  });
});
