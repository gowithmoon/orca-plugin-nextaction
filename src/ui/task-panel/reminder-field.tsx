// The task panel's reminder row (GLOSSARY: 提醒, #107): the next reminder
// still to come and how many others ("10月20日 周二 9:00 · 另 2 个"), "已过" or
// "无", as a button that opens the reminder popup, as Repeat's row does.
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import type { ReminderRead } from "../../domain/reminder/reminder";
import type { CalendarDate } from "../../domain/task/task";
import { remindersText } from "../components/reminder-text";

export function ReminderField(props: {
  labelId: string;
  reminders: ReminderRead;
  now: Date;
  today: CalendarDate;
  onOpen: () => void;
}) {
  const { Button } = orca.components;
  const valueId = `${props.labelId}-value`;
  const { reminders } = props;
  const unreadable = reminders.kind === "unreadable";
  const empty =
    reminders.kind === "none" ||
    (reminders.kind === "list" && reminders.reminders.length === 0);
  return (
    <div className="nextaction-recurrence-field">
      <Button
        id={valueId}
        className="nextaction-recurrence-button"
        variant="outline"
        aria-labelledby={`${props.labelId} ${valueId}`}
        aria-haspopup="dialog"
        data-empty={empty || undefined}
        data-unreadable={unreadable || undefined}
        onClick={props.onOpen}
      >
        <i className="ti ti-bell" aria-hidden="true" />
        {remindersText(reminders, props.now, props.today)}
      </Button>
    </div>
  );
}
