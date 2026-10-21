// Shared by every use case that reads the task graph as it stands today: one
// read of the snapshot, the logical day and the start preview worked out
// once, the graph analyzed once. Read fresh on every call (ADR 0007).
import {
  analyzeTaskGraph,
  type TaskGraph,
  type TaskGraphSnapshot,
} from "../../domain/blocking/task-graph";
import type { CalendarDate } from "../../domain/task/task";
import { addDays } from "../../domain/time/calendar-days";
import { type DayBoundary, logicalDay } from "../../domain/time/logical-day";
import type { Clock } from "../ports/clock";
import type { DayBoundarySetting } from "../ports/day-boundary-setting";
import type { StartPreviewDaysSetting } from "../ports/start-preview-days-setting";
import type { TaskRepository } from "../ports/task-repository";

/** What reading today's task graph needs. */
export interface TaskGraphReading {
  repository: TaskRepository;
  clock: Clock;
  dayBoundary: DayBoundarySetting;
  startPreviewDays: StartPreviewDaysSetting;
}

/** The task graph as it stands today, with the days it was judged by. */
export interface TodaysTaskGraph {
  readonly snapshot: TaskGraphSnapshot;
  readonly graph: TaskGraph;
  /** When it was read. */
  readonly now: Date;
  /** The current logical day. */
  readonly today: CalendarDate;
  readonly boundary: DayBoundary;
  /** The last start that is reached: today plus the start preview days. */
  readonly startsBy: CalendarDate;
}

/**
 * Today's task graph. The settings are read once, so the graph and whatever
 * the caller works out from `today` and `startsBy` agree.
 */
export async function readTodaysTaskGraph(
  deps: TaskGraphReading,
): Promise<TodaysTaskGraph> {
  const now = deps.clock.now();
  const boundary = deps.dayBoundary.current();
  const today = logicalDay(now, boundary);
  const previewDays = deps.startPreviewDays.current();
  const snapshot = await deps.repository.readTaskGraph();
  return {
    snapshot,
    graph: analyzeTaskGraph(snapshot, { today, previewDays }),
    now,
    today,
    boundary,
    startsBy: addDays(today, previewDays),
  };
}
