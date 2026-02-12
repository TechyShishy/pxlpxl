import { Injectable, inject } from '@angular/core';

type Dismissible = () => boolean; // Returns true if it handled the back press

@Injectable({ providedIn: 'root' })
export class BackButtonService {
  private readonly dismissStack: Dismissible[] = [];

  /**
   * Push a dismissible handler onto the stack.
   * Returns a function to remove it when the UI element is closed manually.
   */
  push(handler: Dismissible): () => void {
    this.dismissStack.push(handler);
    return () => {
      const idx = this.dismissStack.indexOf(handler);
      if (idx !== -1) {
        this.dismissStack.splice(idx, 1);
      }
    };
  }

  /**
   * Handle a back button press.
   * Pops the top of the stack and calls it.
   * Returns true if something was dismissed, false if the stack was empty.
   */
  handleBackPress(): boolean {
    while (this.dismissStack.length > 0) {
      const handler = this.dismissStack.pop()!;
      if (handler()) {
        return true;
      }
    }
    return false;
  }

  get hasHandlers(): boolean {
    return this.dismissStack.length > 0;
  }
}
