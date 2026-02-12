import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { Project } from '../models';

@Injectable({ providedIn: 'root' })
export class PxlpxlDatabase extends Dexie {
  projects!: Table<Project, number>;

  constructor() {
    super('pxlpxl');
    this.version(1).stores({
      projects: '++id, name, createdAt, updatedAt',
    });
    this.version(2)
      .stores({
        projects: '++id, name, createdAt, updatedAt',
      })
      .upgrade((tx) =>
        tx
          .table('projects')
          .toCollection()
          .modify((project: any) => {
            if (!project.gridType) {
              project.gridType = 'square';
            }
          }),
      );
  }

  async saveProject(project: Project): Promise<number> {
    if (project.id) {
      await this.projects.put(project);
      return project.id;
    }
    return await this.projects.add(project);
  }

  async getProject(id: number): Promise<Project | undefined> {
    return this.projects.get(id);
  }

  async getAllProjects(): Promise<Project[]> {
    return this.projects.orderBy('updatedAt').reverse().toArray();
  }

  async deleteProject(id: number): Promise<void> {
    await this.projects.delete(id);
  }
}
