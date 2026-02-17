import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-context-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './context-menu.component.html',
  styleUrl: './context-menu.component.scss',
})
export class ContextMenuComponent {
  // TODO: Position based on long-press location
  // TODO: Show tool options, brush size, quick color picker
}
