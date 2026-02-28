import { Injectable, signal, computed } from '@angular/core';
import { Command } from '../models';

@Injectable({ providedIn: 'root' })
export class HistoryService {
  private readonly undoStack = signal<Command[]>([]);
  private readonly redoStack = signal<Command[]>([]);

  private static readonly MAX_HISTORY = 100;

  readonly canUndo = computed(() => this.undoStack().length > 0);
  readonly canRedo = computed(() => this.redoStack().length > 0);

  readonly undoDescription = computed(() => {
    const stack = this.undoStack();
    return stack.length > 0 ? stack[stack.length - 1].description : '';
  });

  readonly redoDescription = computed(() => {
    const stack = this.redoStack();
    return stack.length > 0 ? stack[stack.length - 1].description : '';
  });

  execute(command: Command): void {
    command.execute();
    this.undoStack.update((stack) => {
      const newStack = [...stack, command];
      if (newStack.length > HistoryService.MAX_HISTORY) {
        newStack.shift();
      }
      return newStack;
    });
    this.redoStack.set([]);
  }

  /**
   * Push a command that has already been executed onto the undo stack
   * without calling execute() again. Clears the redo stack.
   */
  pushExecuted(command: Command): void {
    this.undoStack.update((stack) => {
      const newStack = [...stack, command];
      if (newStack.length > HistoryService.MAX_HISTORY) {
        newStack.shift();
      }
      return newStack;
    });
    this.redoStack.set([]);
  }

  undo(): void {
    const stack = this.undoStack();
    if (stack.length === 0) return;

    const command = stack[stack.length - 1];
    command.undo();

    this.undoStack.update((s) => s.slice(0, -1));
    this.redoStack.update((s) => [...s, command]);
  }

  redo(): void {
    const stack = this.redoStack();
    if (stack.length === 0) return;

    const command = stack[stack.length - 1];
    command.execute();

    this.redoStack.update((s) => s.slice(0, -1));
    this.undoStack.update((s) => [...s, command]);
  }

  clear(): void {
    this.undoStack.set([]);
    this.redoStack.set([]);
  }

  /** Read-only access to the undo stack (for serialization) */
  getUndoStack(): readonly Command[] {
    return this.undoStack();
  }

  /** Read-only access to the redo stack (for serialization) */
  getRedoStack(): readonly Command[] {
    return this.redoStack();
  }

  /** Replace both stacks with pre-built commands (for import/restore) */
  setStacks(undo: Command[], redo: Command[]): void {
    this.undoStack.set(undo);
    this.redoStack.set(redo);
  }
}
