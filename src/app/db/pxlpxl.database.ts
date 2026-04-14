import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { Project } from '../models';

/** Shape used by migration callbacks — only the fields accessed during upgrades. */
interface ProjectMigrationRecord {
  gridType?: string;
  width?: number;
  height?: number;
  layers?: Array<{ data: number[] }>;
  history?: unknown;
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
    this.version(8)
      .stores({
        projects: '++id, name, createdAt, updatedAt',
      })
      .upgrade((tx) =>
        tx
          .table('projects')
          .toCollection()
          .modify((project: ProjectMigrationRecord) => {
            if (project.gridType !== 'peyote') return;
            const bufferWidth = project.width;
            const bufferHeight = project.height;
            if (!bufferWidth || !bufferHeight || !project.layers) return;

            const rowByteCount = bufferWidth * 4;
            for (const layer of project.layers) {
              const data = layer.data;
              // Swap even and odd buffer rows pairwise so that even visual
              // sub-columns become the shifted/down ones (fix for inverted
              // peyote column orientation).
              for (let beadRow = 0; beadRow < Math.floor(bufferHeight / 2); beadRow++) {
                const evenStart = beadRow * 2 * rowByteCount;
                const oddStart = (beadRow * 2 + 1) * rowByteCount;
                for (let i = 0; i < rowByteCount; i++) {
                  const tmp = data[evenStart + i];
                  data[evenStart + i] = data[oddStart + i];
                  data[oddStart + i] = tmp;
                }
              }
            }

            // History contains buffer-space coordinates that are now stale
            // after the row swap; clear it rather than attempt coord remapping.
            project.history = undefined;
          }),
      );
    this.version(9)
      .stores({
        projects: '++id, name, createdAt, updatedAt',
      })
      .upgrade((tx) =>
        tx
          .table('projects')
          .toCollection()
          .modify((project: ProjectMigrationRecord) => {
            if (project.gridType !== 'peyote') return;
            const bufferWidth = project.width;
            const bufferHeight = project.height;
            if (!bufferWidth || !bufferHeight || !project.layers) return;

            const rowByteCount = bufferWidth * 4;
            for (const layer of project.layers) {
              const data = layer.data;
              // Re-swap even and odd buffer rows pairwise to align with the
              // updated bufferToVisual convention: even buffer rows now hold
              // odd visual sub-columns (UP/unshifted), odd buffer rows hold
              // even visual sub-columns (DOWN/shifted). V8 swapped for the
              // old convention; v9 swaps once more to reach the new one.
              for (let beadRow = 0; beadRow < Math.floor(bufferHeight / 2); beadRow++) {
                const evenStart = beadRow * 2 * rowByteCount;
                const oddStart = (beadRow * 2 + 1) * rowByteCount;
                for (let i = 0; i < rowByteCount; i++) {
                  const tmp = data[evenStart + i];
                  data[evenStart + i] = data[oddStart + i];
                  data[oddStart + i] = tmp;
                }
              }
            }

            project.history = undefined;
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
