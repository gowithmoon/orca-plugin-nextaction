// A ReminderNotifier for tests: it records every notice, in order.
import type {
  ReminderNotifier,
  TaskReminderNotice,
} from "../src/application/ports/reminder-notifier";

export interface RecordingReminderNotifier extends ReminderNotifier {
  readonly notices: TaskReminderNotice[];
}

export function createRecordingReminderNotifier(): RecordingReminderNotifier {
  const notices: TaskReminderNotice[] = [];
  return {
    notices,
    notify(notice) {
      notices.push({ ...notice });
    },
  };
}
