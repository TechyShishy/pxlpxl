import { TestBed } from '@angular/core/testing';
import { ErrorHandler, NgZone } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { GlobalErrorHandler } from './global-error-handler';

describe('GlobalErrorHandler', () => {
  let handler: GlobalErrorHandler;
  let mockSnackBar: { open: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockSnackBar = { open: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        GlobalErrorHandler,
        { provide: MatSnackBar, useValue: mockSnackBar },
      ],
    });

    handler = TestBed.inject(GlobalErrorHandler);
  });

  it('should be created', () => {
    expect(handler).toBeTruthy();
  });

  it('should implement ErrorHandler interface', () => {
    expect(typeof handler.handleError).toBe('function');
  });

  it('should show snackbar with error message for Error instances', () => {
    handler.handleError(new Error('Something went wrong'));

    expect(mockSnackBar.open).toHaveBeenCalledWith(
      'Something went wrong',
      'Dismiss',
      expect.objectContaining({ duration: 5000 }),
    );
  });

  it('should show generic message for non-Error values', () => {
    handler.handleError('string error');

    expect(mockSnackBar.open).toHaveBeenCalledWith(
      'An unexpected error occurred',
      'Dismiss',
      expect.objectContaining({ duration: 5000 }),
    );
  });

  it('should log error to console', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('test error');

    handler.handleError(error);

    expect(consoleSpy).toHaveBeenCalledWith('Unhandled error:', error);
    consoleSpy.mockRestore();
  });
});
