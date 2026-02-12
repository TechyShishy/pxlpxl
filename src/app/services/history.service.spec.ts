import { TestBed } from '@angular/core/testing';
import { HistoryService } from './history.service';
import { Command } from '../models';

function createMockCommand(description = 'mock command'): Command & {
  executeCalls: number;
  undoCalls: number;
} {
  const cmd = {
    description,
    executeCalls: 0,
    undoCalls: 0,
    execute() {
      cmd.executeCalls++;
    },
    undo() {
      cmd.undoCalls++;
    },
  };
  return cmd;
}

describe('HistoryService', () => {
  let service: HistoryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(HistoryService);
  });

  describe('initial state', () => {
    it('should not be able to undo', () => {
      expect(service.canUndo()).toBe(false);
    });

    it('should not be able to redo', () => {
      expect(service.canRedo()).toBe(false);
    });

    it('should have empty undo description', () => {
      expect(service.undoDescription()).toBe('');
    });

    it('should have empty redo description', () => {
      expect(service.redoDescription()).toBe('');
    });
  });

  describe('execute', () => {
    it('should call command.execute()', () => {
      const cmd = createMockCommand();
      service.execute(cmd);
      expect(cmd.executeCalls).toBe(1);
    });

    it('should enable undo after executing a command', () => {
      service.execute(createMockCommand());
      expect(service.canUndo()).toBe(true);
    });

    it('should clear the redo stack', () => {
      const cmd1 = createMockCommand('cmd1');
      const cmd2 = createMockCommand('cmd2');
      service.execute(cmd1);
      service.undo();
      expect(service.canRedo()).toBe(true);
      service.execute(cmd2);
      expect(service.canRedo()).toBe(false);
    });

    it('should set undoDescription to the last command description', () => {
      service.execute(createMockCommand('Draw 5 pixel(s)'));
      expect(service.undoDescription()).toBe('Draw 5 pixel(s)');
    });
  });

  describe('undo', () => {
    it('should call command.undo()', () => {
      const cmd = createMockCommand();
      service.execute(cmd);
      service.undo();
      expect(cmd.undoCalls).toBe(1);
    });

    it('should move command to redo stack', () => {
      service.execute(createMockCommand());
      service.undo();
      expect(service.canUndo()).toBe(false);
      expect(service.canRedo()).toBe(true);
    });

    it('should be no-op on empty stack', () => {
      expect(() => service.undo()).not.toThrow();
      expect(service.canUndo()).toBe(false);
    });

    it('should set redoDescription after undo', () => {
      service.execute(createMockCommand('action'));
      service.undo();
      expect(service.redoDescription()).toBe('action');
    });

    it('should undo commands in LIFO order', () => {
      const cmd1 = createMockCommand('first');
      const cmd2 = createMockCommand('second');
      const cmd3 = createMockCommand('third');
      service.execute(cmd1);
      service.execute(cmd2);
      service.execute(cmd3);

      service.undo();
      expect(cmd3.undoCalls).toBe(1);
      expect(cmd2.undoCalls).toBe(0);

      service.undo();
      expect(cmd2.undoCalls).toBe(1);
      expect(cmd1.undoCalls).toBe(0);

      service.undo();
      expect(cmd1.undoCalls).toBe(1);
    });
  });

  describe('redo', () => {
    it('should call command.execute()', () => {
      const cmd = createMockCommand();
      service.execute(cmd);
      service.undo();
      cmd.executeCalls = 0; // reset
      service.redo();
      expect(cmd.executeCalls).toBe(1);
    });

    it('should move command back to undo stack', () => {
      service.execute(createMockCommand());
      service.undo();
      service.redo();
      expect(service.canUndo()).toBe(true);
      expect(service.canRedo()).toBe(false);
    });

    it('should be no-op on empty stack', () => {
      expect(() => service.redo()).not.toThrow();
      expect(service.canRedo()).toBe(false);
    });

    it('should redo in correct order after multiple undos', () => {
      const cmd1 = createMockCommand('first');
      const cmd2 = createMockCommand('second');
      service.execute(cmd1);
      service.execute(cmd2);
      service.undo(); // undo cmd2
      service.undo(); // undo cmd1

      // Redo should replay cmd1 first, then cmd2
      // Wait — redo stack is [cmd2, cmd1] (LIFO push during undo)
      // redo() pops last = cmd1, calls execute
      service.redo();
      expect(cmd1.executeCalls).toBe(2); // initial execute + redo
      service.redo();
      expect(cmd2.executeCalls).toBe(2);
    });
  });

  describe('MAX_HISTORY', () => {
    it('should trim undo stack to 100 commands', () => {
      for (let i = 0; i < 105; i++) {
        service.execute(createMockCommand(`cmd-${i}`));
      }
      // Undo all possible
      let undoCount = 0;
      while (service.canUndo()) {
        service.undo();
        undoCount++;
      }
      expect(undoCount).toBe(100);
    });

    it('should drop the oldest command when exceeding MAX_HISTORY', () => {
      const firstCmd = createMockCommand('first');
      service.execute(firstCmd);
      for (let i = 0; i < 100; i++) {
        service.execute(createMockCommand(`cmd-${i}`));
      }
      // Now undo all 100 commands
      let undoCount = 0;
      while (service.canUndo()) {
        service.undo();
        undoCount++;
      }
      expect(undoCount).toBe(100);
      // firstCmd should NOT have been undone (it was dropped)
      expect(firstCmd.undoCalls).toBe(0);
    });
  });

  describe('clear', () => {
    it('should empty both stacks', () => {
      service.execute(createMockCommand());
      service.execute(createMockCommand());
      service.undo();
      expect(service.canUndo()).toBe(true);
      expect(service.canRedo()).toBe(true);

      service.clear();
      expect(service.canUndo()).toBe(false);
      expect(service.canRedo()).toBe(false);
    });

    it('should clear descriptions', () => {
      service.execute(createMockCommand('something'));
      service.clear();
      expect(service.undoDescription()).toBe('');
      expect(service.redoDescription()).toBe('');
    });
  });

  describe('complex sequences', () => {
    it('execute → undo → execute (new) → redo stack should be empty', () => {
      service.execute(createMockCommand('a'));
      service.undo();
      service.execute(createMockCommand('b'));
      expect(service.canRedo()).toBe(false);
    });

    it('should handle interleaved undo/redo correctly', () => {
      const a = createMockCommand('a');
      const b = createMockCommand('b');
      const c = createMockCommand('c');

      service.execute(a);
      service.execute(b);
      service.execute(c);

      service.undo(); // undo c
      service.undo(); // undo b
      service.redo(); // redo b

      expect(service.canUndo()).toBe(true);
      expect(service.canRedo()).toBe(true);
      expect(service.undoDescription()).toBe('b');
      expect(service.redoDescription()).toBe('c');
    });
  });
});
