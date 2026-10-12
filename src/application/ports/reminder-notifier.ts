import type { TaskId } from "../../domain/task/task";

/** A task's reminder that has come due, as the user is told of it. */
export interface TaskReminderNotice {
  readonly taskId: TaskId;
  /** The task's name: the body of the notice. */
  readonly text: string;
}

/**
 * Tells the user a task's reminder has come due (GLOSSARY: 提醒), as a
 * system notification. Each call is one notice; none are merged. It does not
 * throw: a notice that cannot be shown is reported by the implementation, so
 * one failure neither stops the others nor holds the checkpoint back.
 */
export interface ReminderNotifier {
  notify(notice: TaskReminderNotice): void;
}
