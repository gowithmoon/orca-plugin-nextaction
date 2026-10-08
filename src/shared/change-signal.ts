// The plugin's one "tasks may have changed" signal (ADR 0007, #35 "任务变更信号
// 与刷新"). It carries no data: whoever hears it reads again. Time comes in
// through `schedule`, so the timing rules are tested without real timers.

/** Runs `fn` after `ms`; the returned function cancels it if it has not run. */
export type Schedule = (fn: () => void, ms: number) => () => void;

/** What a listener needs: hearing the signal. */
export interface ChangeSignalSource {
  /** Calls `listener` on every signal; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

export interface ChangeSignal extends ChangeSignalSource {
  /**
   * Something may have changed. The signal is given once changes have
   * stopped for `settleMs`, so a burst of edits is heard once. `late`: the
   * change takes effect only some time after it is reported (an undo,
   * tag-operations), so the signal is given again `lateMs` after it.
   */
  changed(options?: { late?: boolean }): void;
  /**
   * Gives the signal at once (focus, the refresh button). It stands in for
   * changes still settling; a pending late signal is still given.
   */
  now(): void;
}

export function createChangeSignal(options: {
  schedule: Schedule;
  settleMs: number;
  lateMs: number;
}): ChangeSignal {
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of [...listeners]) listener();
  };
  let cancelSettle: (() => void) | undefined;
  let cancelLate: (() => void) | undefined;
  return {
    changed(change = {}) {
      cancelSettle?.();
      cancelSettle = options.schedule(() => {
        cancelSettle = undefined;
        emit();
      }, options.settleMs);
      if (change.late) {
        // Counted from the latest late change: after a run of undos, the
        // last one is what lands late.
        cancelLate?.();
        cancelLate = options.schedule(() => {
          cancelLate = undefined;
          emit();
        }, options.lateMs);
      }
    },
    now() {
      cancelSettle?.();
      cancelSettle = undefined;
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
