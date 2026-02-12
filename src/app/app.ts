import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BackButtonService } from './services/back-button.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        width: 100%;
      }
    `,
  ],
})
export class App implements OnInit {
  private readonly backButtonService = inject(BackButtonService);

  ngOnInit(): void {
    this.initBackButton();
  }

  private async initBackButton(): Promise<void> {
    try {
      const { App: CapApp } = await import('@capacitor/app');
      CapApp.addListener('backButton', () => {
        if (!this.backButtonService.handleBackPress()) {
          // Nothing to dismiss — minimize the app
          CapApp.minimizeApp();
        }
      });
    } catch {
      // Not running in Capacitor — ignore
    }
  }
}
