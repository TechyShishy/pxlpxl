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
    gridType: 'peyote-even',
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
  };

  beforeEach(async () => {
    savedProjectsSignal = signal<Project[]>([...MOCK_PROJECTS]);
    mockProjectService = {
      savedProjects: savedProjectsSignal,
      refreshSavedProjects: vi.fn().mockResolvedValue(undefined),
      deleteProject: vi.fn().mockImplementation(async (id: number) => {
        savedProjectsSignal.update(list => list.filter(p => p.id !== id));
      }),
    };

    await TestBed.configureTestingModule({
      imports: [LoadProjectPanelComponent],
      providers: [
        { provide: ProjectService, useValue: mockProjectService },
      ],
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
});
