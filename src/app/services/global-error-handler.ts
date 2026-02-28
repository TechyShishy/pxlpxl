import { ErrorHandler, Injectable, inject, NgZone } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

/**
 * Global error handler that logs unhandled errors and shows a
 * user-facing snackbar notification.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly snackBar = inject(MatSnackBar);
  private readonly zone = inject(NgZone);

  handleError(error: unknown): void {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';

    // Log to console for debugging
    console.error('Unhandled error:', error);

    // Show snackbar inside Angular zone to trigger change detection
    this.zone.run(() => {
      this.snackBar.open(message, 'Dismiss', { duration: 5000 });
    });
  }
}
