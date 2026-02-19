import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { LoadProjectPanelComponent } from './load-project-panel.component';
import { ProjectService } from '../../services/project.service';
import { Project } from '../../models/project.model';

const MOCK_PROJECTS: Project[] = [
  {
    id: 1,
    name: 'Test Project 1',
    width: 32,
    height: 32,
    gridType: 'square',
    layers: [],
    palette: [],
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-06-15'),
  },
  {
    id: 2,
    name: 'Test Project 2',
    width: 64,
    height: 64,
    gridType: 'peyote',
    layers: [],
    palette: [],
    createdAt: new Date('2025-03-01'),
    updatedAt: new Date('2025-07-20'),
  },
];

describe('LoadProjectPanelComponent', () => {
  let component: LoadProjectPanelComponent;
  let fixture: ComponentFixture<LoadProjectPanelComponent>;
  let savedProjectsSignal: ReturnType<typeof signal<Project[]>>;
  let mockProjectService: {
    savedProjects: ReturnType<typeof signal<Project[]>>;
    refreshSavedProjects: ReturnType<typeof vi.fn>;
    deleteProject: ReturnType<typeof vi.fn>;
    renameProject: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    savedProjectsSignal = signal<Project[]>([...MOCK_PROJECTS]);
    mockProjectService = {
      savedProjects: savedProjectsSignal,
      refreshSavedProjects: vi.fn().mockResolvedValue(undefined),
      deleteProject: vi.fn().mockImplementation(async (id: number) => {
        savedProjectsSignal.update((list) => list.filter((p) => p.id !== id));
      }),
      renameProject: vi.fn().mockImplementation(async (id: number, name: string) => {
        savedProjectsSignal.update((list) => list.map((p) => (p.id === id ? { ...p, name } : p)));
      }),
    };

    await TestBed.configureTestingModule({
      imports: [LoadProjectPanelComponent],
      providers: [{ provide: ProjectService, useValue: mockProjectService }],
    }).compileComponents();

    fixture = TestBed.createComponent(LoadProjectPanelComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load projects on init', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    expect(mockProjectService.refreshSavedProjects).toHaveBeenCalled();
    expect(mockProjectService.savedProjects().length).toBe(2);
  });

  it('should display empty state when no projects exist', async () => {
    savedProjectsSignal.set([]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const emptyState = fixture.nativeElement.querySelector('.empty-state');
    expect(emptyState).toBeTruthy();
    expect(emptyState.textContent).toContain('No saved projects');
  });

  it('should emit projectSelected with project id on select', () => {
    fixture.detectChanges();
    const emitSpy = vi.spyOn(component.projectSelected, 'emit');

    component.onSelect(MOCK_PROJECTS[0]);

    expect(emitSpy).toHaveBeenCalledWith(1);
  });

  it('should not emit projectSelected when project has no id', () => {
    fixture.detectChanges();
    const emitSpy = vi.spyOn(component.projectSelected, 'emit');
    const projectWithoutId: Project = { ...MOCK_PROJECTS[0], id: undefined };

    component.onSelect(projectWithoutId);

    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('should emit closed when close is triggered', () => {
    fixture.detectChanges();
    const emitSpy = vi.spyOn(component.closed, 'emit');

    const closeButton = fixture.nativeElement.querySelector(
      '.panel-header button[aria-label="Close projects panel"]',
    );
    closeButton?.click();

    expect(emitSpy).toHaveBeenCalled();
  });

  it('should delete a project and refresh the list', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    const event = new Event('click');
    vi.spyOn(event, 'stopPropagation');

    await component.onDelete(event, MOCK_PROJECTS[0]);

    expect(event.stopPropagation).toHaveBeenCalled();
    expect(mockProjectService.deleteProject).toHaveBeenCalledWith(1);
    expect(mockProjectService.savedProjects().length).toBe(1);
  });

  /* ====== inline edit ====== */

  describe('inline edit', () => {
    it('should enter edit mode on long-press', () => {
      vi.useFakeTimers();
      fixture.detectChanges();

      const pointerDown = new PointerEvent('pointerdown', { clientX: 100, clientY: 100 });
      component.onPointerDown(pointerDown, MOCK_PROJECTS[0]);

      vi.advanceTimersByTime(500);

      expect(component.editingProjectId()).toBe(1);
      vi.useRealTimers();
    });

    it('should not enter edit mode if pointer moves beyond threshold', () => {
      vi.useFakeTimers();
      fixture.detectChanges();

      const pointerDown = new PointerEvent('pointerdown', { clientX: 100, clientY: 100 });
      component.onPointerDown(pointerDown, MOCK_PROJECTS[0]);

      const pointerMove = new PointerEvent('pointermove', { clientX: 120, clientY: 100 });
      component.onPointerMove(pointerMove);

      vi.advanceTimersByTime(500);

      expect(component.editingProjectId()).toBeNull();
      vi.useRealTimers();
    });

    it('should not enter edit mode if pointer is released before delay', () => {
      vi.useFakeTimers();
      fixture.detectChanges();

      const pointerDown = new PointerEvent('pointerdown', { clientX: 100, clientY: 100 });
      component.onPointerDown(pointerDown, MOCK_PROJECTS[0]);

      vi.advanceTimersByTime(200);
      component.onPointerUp();

      vi.advanceTimersByTime(500);

      expect(component.editingProjectId()).toBeNull();
      vi.useRealTimers();
    });

    it('should suppress click after long-press', () => {
      vi.useFakeTimers();
      fixture.detectChanges();
      const emitSpy = vi.spyOn(component.projectSelected, 'emit');

      const pointerDown = new PointerEvent('pointerdown', { clientX: 100, clientY: 100 });
      component.onPointerDown(pointerDown, MOCK_PROJECTS[0]);

      vi.advanceTimersByTime(500);

      // Now click — should be suppressed
      component.onSelect(MOCK_PROJECTS[0]);

      expect(emitSpy).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('should enter edit mode on Enter key press', () => {
      fixture.detectChanges();

      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      vi.spyOn(event, 'preventDefault');

      component.onEnterKey(event, MOCK_PROJECTS[0]);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(component.editingProjectId()).toBe(1);
      expect(component.editControl.value).toBe('Test Project 1');
    });

    it('should not enter edit mode via Enter when already editing', () => {
      fixture.detectChanges();

      component.startEdit(MOCK_PROJECTS[0]);
      expect(component.editingProjectId()).toBe(1);

      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      vi.spyOn(event, 'preventDefault');

      component.onEnterKey(event, MOCK_PROJECTS[1]);

      // Should still be editing project 1, not project 2
      expect(component.editingProjectId()).toBe(1);
      expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it('should commit edit and call renameProject', async () => {
      fixture.detectChanges();

      component.startEdit(MOCK_PROJECTS[0]);
      component.editControl.setValue('New Name');

      await component.commitEdit(MOCK_PROJECTS[0]);

      expect(component.editingProjectId()).toBeNull();
      expect(mockProjectService.renameProject).toHaveBeenCalledWith(1, 'New Name');
    });

    it('should not rename when name is unchanged', async () => {
      fixture.detectChanges();

      component.startEdit(MOCK_PROJECTS[0]);
      // Keep the same name
      component.editControl.setValue('Test Project 1');

      await component.commitEdit(MOCK_PROJECTS[0]);

      expect(component.editingProjectId()).toBeNull();
      expect(mockProjectService.renameProject).not.toHaveBeenCalled();
    });

    it('should revert when name is empty (treat as cancel)', async () => {
      fixture.detectChanges();

      component.startEdit(MOCK_PROJECTS[0]);
      component.editControl.setValue('');

      await component.commitEdit(MOCK_PROJECTS[0]);

      expect(component.editingProjectId()).toBeNull();
      expect(mockProjectService.renameProject).not.toHaveBeenCalled();
    });

    it('should revert when name is only whitespace', async () => {
      fixture.detectChanges();

      component.startEdit(MOCK_PROJECTS[0]);
      component.editControl.setValue('   ');

      await component.commitEdit(MOCK_PROJECTS[0]);

      expect(component.editingProjectId()).toBeNull();
      expect(mockProjectService.renameProject).not.toHaveBeenCalled();
    });

    it('should cancel edit without saving on cancelEdit', () => {
      fixture.detectChanges();

      component.startEdit(MOCK_PROJECTS[0]);
      expect(component.editingProjectId()).toBe(1);

      component.cancelEdit();

      expect(component.editingProjectId()).toBeNull();
      expect(mockProjectService.renameProject).not.toHaveBeenCalled();
    });

    it('should not select project when in edit mode', () => {
      fixture.detectChanges();
      const emitSpy = vi.spyOn(component.projectSelected, 'emit');

      component.startEdit(MOCK_PROJECTS[0]);
      component.onSelect(MOCK_PROJECTS[0]);

      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('should render an input when editing', () => {
      fixture.detectChanges();

      component.startEdit(MOCK_PROJECTS[0]);
      fixture.detectChanges();

      const input = fixture.nativeElement.querySelector('.edit-input');
      expect(input).toBeTruthy();
      expect(input.value).toBe('Test Project 1');
    });

    it('should trim whitespace from name on commit', async () => {
      fixture.detectChanges();

      component.startEdit(MOCK_PROJECTS[0]);
      component.editControl.setValue('  Trimmed Name  ');

      await component.commitEdit(MOCK_PROJECTS[0]);

      expect(mockProjectService.renameProject).toHaveBeenCalledWith(1, 'Trimmed Name');
    });
  });
});
