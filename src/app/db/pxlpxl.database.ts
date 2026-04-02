import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { Project } from '../models';

/** Shape used by migration callbacks — only the fields accessed during upgrades. */
interface ProjectMigrationRecord {
  gridType?: string;
  width?: number;
  triangularD?: number;
  triangularDNum?: number;
  triangularDDen?: number;
}

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
          .modify((project: ProjectMigrationRecord) => {
            if (!project.gridType) {
              project.gridType = 'square';
            }
          }),
      );
    this.version(3).stores({
      projects: '++id, name, createdAt, updatedAt',
    });
    this.version(4)
      .stores({
        projects: '++id, name, createdAt, updatedAt',
      })
      .upgrade((tx) =>
        tx
          .table('projects')
          .toCollection()
          .modify((project: ProjectMigrationRecord) => {
            if (project.gridType === 'peyote-even') {
              project.gridType = 'peyote';
            } else if (project.gridType === 'peyote-odd') {
              project.gridType = 'peyote';
            }
          }),
      );
    this.version(5)
      .stores({
        projects: '++id, name, createdAt, updatedAt',
      })
      .upgrade((tx) =>
        tx
          .table('projects')
          .toCollection()
          .modify((project: ProjectMigrationRecord) => {
            if (
              project.gridType === 'triangular-slow' &&
              project.triangularD !== undefined &&
              project.triangularDNum === undefined
            ) {
              project.triangularDNum = 1;
              project.triangularDDen = project.triangularD;
            }
          }),
      );
    this.version(6)
      .stores({
        projects: '++id, name, createdAt, updatedAt',
      })
      .upgrade((tx) =>
        tx
          .table('projects')
          .toCollection()
          .modify((project: ProjectMigrationRecord) => {
            if (project.gridType === 'triangular-slow') {
              // Remap to unified 'triangular'
              project.gridType = 'triangular';
              // Ensure dNum/dDen are set (v5 migration should have handled this,
              // but be defensive)
              if (project.triangularDNum === undefined) {
                project.triangularDNum = 1;
                project.triangularDDen = project.triangularD ?? 2;
              }
            } else if (project.gridType === 'triangular') {
              // Old fast-growth projects: set dNum = d, dDen = 1
              if (project.triangularDNum === undefined && project.triangularD !== undefined) {
                project.triangularDNum = project.triangularD;
                project.triangularDDen = 1;
              }
            }
          }),
      );
    this.version(7)
      .stores({
        projects: '++id, name, createdAt, updatedAt',
      })
      .upgrade((tx) =>
        tx
          .table('projects')
          .toCollection()
          .modify((project: ProjectMigrationRecord) => {
            // Prior to v7, peyote bufferWidth = ceil(width / 2).
            // From v7, bufferWidth = width (peyote column-pair count).
            // Halve the stored width so existing projects display the same
            // number of peyote column-pairs as before.
            // Buffer byte layouts are unchanged — only the width metadata changes.
            if (project.gridType === 'peyote' && project.width !== undefined) {
              project.width = Math.ceil(project.width / 2);
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

  async renameProject(id: number, name: string): Promise<void> {
    await this.projects.update(id, { name, updatedAt: new Date() });
  }

  async deleteProject(id: number): Promise<void> {
    await this.projects.delete(id);
  }
}
