// The task panel's completion history row (GLOSSARY: 完成历史, #209): a
// summary ("完成于 10月18日 周六", "完成 12 次 · 跳过 2 次 · 最近 10月18日 周六")
// as a button that opens the completion history popup, as Repeat's and
// Reminders' rows do. Not shown without any entry. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import type { CompletionHistoryRead } from "../../application/ports/task-repository";
import type { CalendarDate } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { completionHistoryText } from "../components/completion-history-text";
import { Field } from "./task-panel-fields";

export function CompletionHistoryField(props: {
  labelId: string;
  completionHistory: CompletionHistoryRead;
  today: CalendarDate;
  onOpen: () => void;
}) {
  const { Button } = orca.components;
  const text = completionHistoryText(props.completionHistory, props.today);
  if (text === null) return null;
  const valueId = `${props.labelId}-value`;
  return (
    <Field label={t("Completion history")} labelId={props.labelId}>
      <div className="nextaction-recurrence-field">
        <Button
          id={valueId}
          className="nextaction-recurrence-button"
          variant="outline"
          aria-labelledby={`${props.labelId} ${valueId}`}
          aria-haspopup="dialog"
          data-unreadable={
            props.completionHistory.kind === "unreadable" || undefined
          }
          onClick={props.onOpen}
        >
          <i className="ti ti-history" aria-hidden="true" />
          {text}
        </Button>
      </div>
    </Field>
  );
}
