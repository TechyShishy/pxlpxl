import { ApplicationConfig, provideBrowserGlobalErrorListeners, inject, provideAppInitializer } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatIconRegistry } from '@angular/material/icon';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideAnimationsAsync(),
    provideAppInitializer(() => {
      const iconRegistry = inject(MatIconRegistry);
      iconRegistry.setDefaultFontSetClass('material-symbols-outlined');
    }),
  ],
};
