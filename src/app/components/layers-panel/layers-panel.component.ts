import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  OnDestroy,
  ElementRef,
  viewChildren,
} from '@angular/core';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSliderModule } from '@angular/material/slider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CdkDragDrop, CdkDropList, CdkDrag, CdkDragHandle } from '@angular/cdk/drag-drop';
import { LayerService } from '../../services/layer.service';
import { CanvasStateService } from '../../services/canvas-state.service';
import { HistoryService } from '../../services/history.service';
import { DuplicateLayerCommand } from '../../commands/duplicate-layer.command';
import { FlattenLayerCommand } from '../../commands/flatten-layer.command';
import { MoveLayerCommand } from '../../commands/move-layer.command';
import { Layer } from '../../models';

const LONG_PRESS_DELAY = 500;
const MOVE_THRESHOLD = 5;

@Component({
  selector: 'app-layers-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatSliderModule,
    MatTooltipModule,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
  ],
  templateUrl: './layers-panel.component.html',
  styleUrl: './layers-panel.component.scss',
})
export class LayersPanelComponent implements OnDestroy {
  protected readonly layerService = inject(LayerService);
  private readonly canvasState = inject(CanvasStateService);
  private readonly historyService = inject(HistoryService);

  readonly editingLayerId = signal<string | null>(null);
  readonly editControl = new FormControl('', { nonNullable: true });

  private readonly editInputs = viewChildren<ElementRef<HTMLInputElement>>('editInput');

  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private pointerStart: { x: number; y: number } | null = null;
  private suppressClick = false;
  private originalName = '';

  ngOnDestroy(): void {
    this.clearLongPressTimer();
  }

  addLayer(): void {
    this.layerService.addLayer(this.canvasState.canvasWidth(), this.canvasState.canvasHeight());
  }

  duplicateLayer(index: number): void {
    const source = this.layerService.layers()[index];
    if (!source) return;
    const clonedLayer: Layer = {
      id: crypto.randomUUID(),
      name: `Copy of ${source.name}`,
      visible: source.visible,
      opacity: source.opacity,
      data: new Uint8ClampedArray(source.data),
    };
    const command = new DuplicateLayerCommand(this.layerService, index + 1, clonedLayer);
    this.historyService.execute(command);
  }

  flattenToAbove(index: number): void {
    const layers = this.layerService.layers();
    if (index <= 0) return; // No layer above in the panel (index 0 is the topmost panel row)
    const command = new FlattenLayerCommand(
      this.layerService,
      index,
      this.canvasState.bufferWidth(),
      this.canvasState.bufferHeight(),
    );
    this.historyService.execute(command);
  }

  drop(event: CdkDragDrop<Layer[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const command = new MoveLayerCommand(
      this.layerService,
      event.previousIndex,
      event.currentIndex,
    );
    this.historyService.execute(command);
  }

  onLayerKeydown(event: KeyboardEvent, index: number): void {
    const count = this.layerService.layerCount();
    let targetIndex: number | null = null;

    if (event.altKey && event.key === 'ArrowUp' && index < count - 1) {
      targetIndex = index + 1;
    } else if (event.altKey && event.key === 'ArrowDown' && index > 0) {
      targetIndex = index - 1;
    }

    if (targetIndex === null) return;
    event.preventDefault();
    const command = new MoveLayerCommand(this.layerService, index, targetIndex);
    this.historyService.execute(command);
  }

  onPointerDown(event: PointerEvent, layer: Layer): void {
    this.pointerStart = { x: event.clientX, y: event.clientY };
    this.clearLongPressTimer();

    this.longPressTimer = setTimeout(() => {
      this.suppressClick = true;
      this.startEdit(layer);
    }, LONG_PRESS_DELAY);
  }

  onPointerMove(event: PointerEvent): void {
    if (this.pointerStart == null) return;
    const dx = event.clientX - this.pointerStart.x;
    const dy = event.clientY - this.pointerStart.y;
    if (Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD) {
      this.clearLongPressTimer();
    }
  }

  onPointerUp(): void {
    this.clearLongPressTimer();
  }

  onEnterKey(event: Event, layer: Layer): void {
    if (this.editingLayerId() !== null) return;
    event.preventDefault();
    this.startEdit(layer);
  }

  onSelect(index: number): void {
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    if (this.editingLayerId() !== null) return;
    this.layerService.setActiveLayer(index);
  }

  startEdit(layer: Layer): void {
    this.originalName = layer.name;
    this.editControl.setValue(layer.name);
    this.editingLayerId.set(layer.id);

    // Focus the input after Angular renders it
    setTimeout(() => {
      const inputs = this.editInputs();
      if (inputs.length > 0) {
        const input = inputs[0].nativeElement;
        input.focus();
        input.select();
      }
    });
  }

  commitEdit(layer: Layer, index: number): void {
    const id = this.editingLayerId();
    if (id === null || layer.id !== id) return;

    const newName = this.editControl.value.trim();
    this.editingLayerId.set(null);

    if (newName === '' || newName === this.originalName) return;

    this.layerService.renameLayer(index, newName);
  }

  cancelEdit(): void {
    this.editingLayerId.set(null);
  }

  private clearLongPressTimer(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }
}
