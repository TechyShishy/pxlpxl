import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'editor',
    loadComponent: () =>
      import('./components/editor/editor.component').then((m) => m.EditorComponent),
  },
  {
    path: 'editor/:id',
    loadComponent: () =>
      import('./components/editor/editor.component').then((m) => m.EditorComponent),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./components/settings/settings.component').then((m) => m.SettingsComponent),
  },
  {
    path: '',
    redirectTo: 'editor',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: 'editor',
  },
];
