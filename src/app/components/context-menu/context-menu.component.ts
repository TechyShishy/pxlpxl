import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-context-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  template: `
    <div class="context-menu">
      <!-- TODO: Implement floating context menu for long-press -->
      <p>Context menu placeholder</p>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .context-menu {
        position: fixed;
        z-index: 200;
        background: var(--mat-sys-surface-container-high);
        border-radius: 12px;
        padding: 8px;
        box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
      }
    `,
  ],
})
export class ContextMenuComponent {
  // TODO: Position based on long-press location
  // TODO: Show tool options, brush size, quick color picker
}
