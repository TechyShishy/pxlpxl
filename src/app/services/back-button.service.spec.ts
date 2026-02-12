import { BackButtonService } from './back-button.service';

describe('BackButtonService', () => {
  let service: BackButtonService;

  beforeEach(() => {
    service = new BackButtonService();
  });

  describe('push', () => {
    it('should add a handler to the stack', () => {
      service.push(() => true);
      expect(service.hasHandlers).toBe(true);
    });

    it('should return a removal function', () => {
      const remove = service.push(() => true);
      expect(typeof remove).toBe('function');
    });
  });

  describe('hasHandlers', () => {
    it('should return false when stack is empty', () => {
      expect(service.hasHandlers).toBe(false);
    });

    it('should return true after pushing a handler', () => {
      service.push(() => true);
      expect(service.hasHandlers).toBe(true);
    });

    it('should return false after removing all handlers', () => {
      const remove = service.push(() => true);
      remove();
      expect(service.hasHandlers).toBe(false);
    });
  });

  describe('handleBackPress', () => {
    it('should return false when stack is empty', () => {
      expect(service.handleBackPress()).toBe(false);
    });

    it('should call the top handler (LIFO)', () => {
      const calls: number[] = [];
      service.push(() => {
        calls.push(1);
        return true;
      });
      service.push(() => {
        calls.push(2);
        return true;
      });
      service.handleBackPress();
      expect(calls).toEqual([2]);
    });

    it('should return true when a handler handles the back press', () => {
      service.push(() => true);
      expect(service.handleBackPress()).toBe(true);
    });

    it('should continue popping if handler returns false', () => {
      const calls: number[] = [];
      service.push(() => {
        calls.push(1);
        return true;
      });
      service.push(() => {
        calls.push(2);
        return false;
      });
      service.push(() => {
        calls.push(3);
        return false;
      });
      const result = service.handleBackPress();
      // Handler 3 returns false → pop handler 2 returns false → pop handler 1 returns true
      expect(calls).toEqual([3, 2, 1]);
      expect(result).toBe(true);
    });

    it('should return false if all handlers return false', () => {
      service.push(() => false);
      service.push(() => false);
      expect(service.handleBackPress()).toBe(false);
      expect(service.hasHandlers).toBe(false);
    });

    it('should remove the handler after it is called', () => {
      service.push(() => true);
      service.handleBackPress();
      expect(service.hasHandlers).toBe(false);
    });
  });

  describe('removal function', () => {
    it('should remove the correct handler from the stack', () => {
      const calls: number[] = [];
      service.push(() => {
        calls.push(1);
        return true;
      });
      const remove2 = service.push(() => {
        calls.push(2);
        return true;
      });
      service.push(() => {
        calls.push(3);
        return true;
      });
      remove2();
      // Now stack should be [handler1, handler3]
      service.handleBackPress();
      expect(calls).toEqual([3]);
    });

    it('should be safe to call twice', () => {
      const remove = service.push(() => true);
      remove();
      remove(); // Should not throw
      expect(service.hasHandlers).toBe(false);
    });

    it('should update hasHandlers correctly', () => {
      const remove1 = service.push(() => true);
      const remove2 = service.push(() => true);
      remove1();
      expect(service.hasHandlers).toBe(true);
      remove2();
      expect(service.hasHandlers).toBe(false);
    });
  });
});
