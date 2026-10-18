// Showing a drop at once (#85 乐观显示): what a drop writes is laid over the
// view's read until the write has ended and a read started after it
// arrives; that read then shows as it is. A failed write is taken back (the
// failure is told by the schedule actions). Nothing shows loading in between,
// and the layover puts every card where the read will: the scheduled by
// start, then in the unscheduled order, the unscheduled in that order
// (read-my-day.ts), so the read replacing it moves nothing. A drop in another
// quadrant (#199) lays the importance and urgency it writes over the task,
// which puts the card in its new quadrant, where it keeps its place in the
// order; the read replacing it may move it within the quadrant, as the new
// values change its score. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  MyDayItem,
  ScheduledMyDayItem,
  TodaysMyDay,
} from "../../../application/usecases/read-my-day";
import type { MyDaySchedule } from "../../../domain/task/my-day";
import {
  type QuadrantChanges,
  quadrantChanges,
} from "../../../domain/task/quadrant";
import type { TaskId } from "../../../domain/task/task";
import { minuteMs } from "../../../domain/time/durations";
import type { ViewQuery, ViewQueryState } from "../../hooks/use-view-query";
import type { MyDayDrop } from "./my-day-drag";
import type { MyDayScheduleActions } from "./my-day-schedule-actions";
import type { QuadrantDrop } from "./quadrant-drag";

/** The writes a drop makes, each resolving to whether it succeeded; never throwing. */
export interface MyDayDropWrites extends MyDayScheduleActions {
  /** Moves task `id` to another quadrant (#199). */
  moveToQuadrant(id: TaskId, target: QuadrantDrop["target"]): Promise<boolean>;
}

/**
 * What a drop lays over the read: a schedule, or `null` for unscheduled; or
 * the importance and urgency written by a move to another quadrant.
 */
type DropChange =
  | { readonly kind: "schedule"; readonly schedule: MyDaySchedule | null }
  | { readonly kind: "ratings"; readonly ratings: QuadrantChanges };

/** A drop laid over the read. */
interface PendingDrop {
  /** Tells a later drop of the same task apart. */
  readonly token: number;
  readonly change: DropChange;
  /**
   * Once written: how many states the query had gone through when the write
   * ended. Every later state comes from a read started after it (the write
   * reloads the query, and an older read then counts for nothing,
   * latest-read.ts), and replaces the drop.
   */
  readonly writtenAt?: number;
}

/** Whether a drop still shows: not written yet, or no later state shown. */
function showing(drop: PendingDrop, shownAt: number): boolean {
  return drop.writtenAt === undefined || shownAt <= drop.writtenAt;
}

/** `read` with the importance and urgency quadrant drops write (#199). */
function withRatings(
  read: TodaysMyDay,
  ratings: ReadonlyMap<TaskId, QuadrantChanges>,
): TodaysMyDay {
  if (ratings.size === 0) return read;
  // Only the task's values change: the order is as read.
  const rated = <Item extends MyDayItem>(items: readonly Item[]) =>
    items.map((item) => {
      const changes = ratings.get(item.task.id);
      return changes ? { ...item, task: { ...item.task, ...changes } } : item;
    });
  return {
    range: read.range,
    scheduled: rated(read.scheduled),
    unscheduled: rated(read.unscheduled),
    all: rated(read.all),
  };
}

/**
 * `read` with the schedules timeline drops write (#85), `null` for
 * unscheduled: every card where the read will put it.
 */
function withSchedules(
  read: TodaysMyDay,
  schedules: ReadonlyMap<TaskId, MyDaySchedule | null>,
): TodaysMyDay {
  if (schedules.size === 0) return read;
  const scheduled: ScheduledMyDayItem[] = [];
  const unscheduled: MyDayItem[] = [];
  const items: readonly (MyDayItem & { readonly schedule?: MyDaySchedule })[] =
    [...read.scheduled, ...read.unscheduled];
  for (const item of items) {
    const drop = schedules.get(item.task.id);
    if (drop === undefined) {
      if (item.schedule) scheduled.push({ ...item, schedule: item.schedule });
      else unscheduled.push(item);
    } else if (drop === null) {
      unscheduled.push({
        task: item.task,
        done: item.done,
        skipped: item.skipped,
        overdue: item.overdue,
        project: item.project,
        unscheduledOrder: item.unscheduledOrder,
      });
    } else {
      scheduled.push({ ...item, schedule: drop });
    }
  }
  scheduled.sort(
    (a, b) =>
      a.schedule.start.getTime() - b.schedule.start.getTime() ||
      a.unscheduledOrder - b.unscheduledOrder,
  );
  unscheduled.sort((a, b) => a.unscheduledOrder - b.unscheduledOrder);
  // A drop changes no task's place among all of today's (the list's order).
  return { range: read.range, scheduled, unscheduled, all: read.all };
}

/** `read` with the drops laid over it; `read` itself without any. */
function withDrops(
  read: TodaysMyDay,
  changes: ReadonlyMap<TaskId, DropChange>,
): TodaysMyDay {
  if (changes.size === 0) return read;
  const schedules = new Map<TaskId, MyDaySchedule | null>();
  const ratings = new Map<TaskId, QuadrantChanges>();
  for (const [id, change] of changes) {
    if (change.kind === "schedule") schedules.set(id, change.schedule);
    else ratings.set(id, change.ratings);
  }
  return withSchedules(withRatings(read, ratings), schedules);
}

/** A drop's change to lay over the read, and the write that makes it. */
interface DropOverlay {
  readonly change: DropChange;
  write(actions: MyDayDropWrites): Promise<boolean>;
}

/** A drop on the timeline or in the unscheduled area (#85). */
function scheduleOverlay(drop: MyDayDrop): DropOverlay {
  const id = drop.task.id;
  if (drop.kind === "unschedule") {
    return {
      change: { kind: "schedule", schedule: null },
      write: (actions) => actions.unschedule(id),
    };
  }
  const { schedule } = drop;
  return {
    change: { kind: "schedule", schedule },
    // Already snapped; the use case snaps it the same way.
    write: (actions) =>
      actions.schedule(id, {
        start: schedule.start,
        minutes: (schedule.end.getTime() - schedule.start.getTime()) / minuteMs,
      }),
  };
}

/** A drop in another quadrant (#199). */
function ratingsOverlay(drop: QuadrantDrop): DropOverlay {
  return {
    // As the use case works it out, from the values shown.
    change: {
      kind: "ratings",
      ratings: quadrantChanges(drop.task, drop.target),
    },
    write: (actions) => actions.moveToQuadrant(drop.task.id, drop.target),
  };
}

/**
 * The query's state with the drops under way laid over it, and `commit`,
 * which writes a drop, once, and shows it at once.
 */
export function useOptimisticMyDay(
  query: ViewQuery<TodaysMyDay>,
  state: ViewQueryState<TodaysMyDay>,
  actions: MyDayDropWrites,
): {
  shown: ViewQueryState<TodaysMyDay>;
  commit: (drop: MyDayDrop | QuadrantDrop) => void;
} {
  const [pending, setPending] = React.useState<
    ReadonlyMap<TaskId, PendingDrop>
  >(() => new Map());
  const tokens = React.useRef(0);
  // The query's states, numbered as they come: the rendered `state` may be
  // a render behind the query.
  const counted = React.useRef({
    count: 0,
    numbers: new WeakMap<object, number>(),
  });
  const mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    const states = counted.current;
    states.numbers.set(query.current(), states.count);
    const unsubscribe = query.subscribe(() => {
      states.count += 1;
      states.numbers.set(query.current(), states.count);
    });
    return () => {
      mounted.current = false;
      unsubscribe();
    };
  }, [query]);
  const shownAt = counted.current.numbers.get(state) ?? 0;

  // Replaced drops go; what shows already leaves them out.
  React.useEffect(() => {
    setPending((current) => {
      const kept = [...current].filter(([, drop]) => showing(drop, shownAt));
      return kept.length === current.size ? current : new Map(kept);
    });
  }, [shownAt]);

  const shown = React.useMemo<ViewQueryState<TodaysMyDay>>(() => {
    if (state.kind !== "loaded") return state;
    const drops = new Map<TaskId, DropChange>();
    for (const [id, drop] of pending) {
      if (showing(drop, shownAt)) drops.set(id, drop.change);
    }
    const data = withDrops(state.data, drops);
    return data === state.data ? state : { kind: "loaded", data };
  }, [state, shownAt, pending]);

  const commit = React.useCallback(
    (drop: MyDayDrop | QuadrantDrop) => {
      tokens.current += 1;
      const token = tokens.current;
      const id = drop.task.id;
      const overlay =
        drop.kind === "quadrant" ? ratingsOverlay(drop) : scheduleOverlay(drop);
      setPending((current) =>
        new Map(current).set(id, { token, change: overlay.change }),
      );
      const write = overlay.write(actions);
      void write.then((written) => {
        if (!mounted.current) return;
        // The query's own count, not the rendered state's: a read that
        // ended just now, but started before the write ended, must not count.
        const writtenAt = counted.current.count;
        setPending((current) => {
          const mine = current.get(id);
          if (mine?.token !== token) return current;
          const next = new Map(current);
          if (written) next.set(id, { ...mine, writtenAt });
          else next.delete(id);
          return next;
        });
        // A read from now on: one still under way counts for nothing
        // (latest-read.ts), so the next state holds the write.
        if (written) query.reload();
      });
    },
    [actions, query],
  );

  return { shown, commit };
}
