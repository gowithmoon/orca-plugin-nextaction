// The quick capture window (GLOSSARY: 快速捕获, #45 "快速捕获") and the command
// that opens it: a line of text and, below it, importance, urgency, effort,
// start and due with the task panel's controls. Nothing is written before the capture.
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { InitialProperties } from "../../application/ports/task-repository";
import type { QuickCapture } from "../../application/usecases/quick-capture";
import {
  type CalendarDate,
  defaultRating,
  type Rating,
} from "../../domain/task/task";
import type { CommandFn } from "../../orca.d.ts";
import { t } from "../../shared/l10n/l10n";
import { effortName, importanceName, urgencyName } from "../components/format";
import { PopupLayer } from "../components/popup-layer";
import { useFocusInside } from "../hooks/use-focus-inside";
import { useQuickCapture } from "../hooks/use-quick-capture";
import { DateField, Field, RatingField } from "../task-panel/task-panel-fields";

interface Draft {
  importance: Rating;
  urgency: Rating;
  effort: Rating;
  start: CalendarDate | null;
  due: CalendarDate | null;
}

const emptyDraft: Draft = {
  importance: defaultRating,
  urgency: defaultRating,
  effort: defaultRating,
  start: null,
  due: null,
};

/**
 * Only what the user set: the rest is left for Orca to fill with its
 * defaults (inbox-anomalous-status).
 */
function initialProperties(draft: Draft): InitialProperties {
  return {
    ...(draft.importance !== defaultRating && { importance: draft.importance }),
    ...(draft.urgency !== defaultRating && { urgency: draft.urgency }),
    ...(draft.effort !== defaultRating && { effort: draft.effort }),
    ...(draft.start && { start: draft.start }),
    ...(draft.due && { due: draft.due }),
  };
}

/** The line of text leads the window, a size up from the fields. */
const captureTextStyle: React.CSSProperties = {
  padding: "var(--orca-spacing-md)",
  borderRadius: "var(--orca-radius-md)",
  fontSize: "var(--orca-fontsize-md)",
};

function QuickCapturePopup(props: {
  quickCapture: QuickCapture;
  pluginName: string;
  today: () => CalendarDate;
  /** Closes the popup by unmounting it. */
  onClose: () => void;
}) {
  const { Button, CompositionInput, ModalOverlay, Tooltip } = orca.components;
  const idPrefix = React.useId();
  const id = (field: string) => `${idPrefix}-${field}`;
  const [text, setText] = React.useState("");
  const [draft, setDraft] = React.useState(emptyDraft);
  const input = React.useRef<HTMLInputElement>(null);
  // Into the text on opening, back where it was (e.g. the editor) on closing,
  // as the task panel popup does.
  const restoreFocus = React.useRef(true);
  useFocusInside(input, restoreFocus);
  const capture = useQuickCapture(props.quickCapture, props.pluginName);
  const today = props.today();
  const blank = text.trim() === "";

  // Kept here until the capture; the fields do not know where they are.
  const set =
    <K extends keyof Draft>(key: K) =>
    (value: Draft[K]) =>
      setDraft((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    // Empty text and failures keep the window, its text and its properties.
    if ((await capture(text, initialProperties(draft))) === "captured") {
      props.onClose();
    }
  };

  const onTextKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Enter that confirms an IME composition is not a capture.
    if (e.nativeEvent.isComposing || e.key !== "Enter") return;
    e.preventDefault();
    e.stopPropagation();
    void submit();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // As in the task panel popup: a key a control inside already handled
    // (e.g. a picker closing) is left alone.
    if (e.key !== "Escape" || e.defaultPrevented) return;
    if (e.nativeEvent.isComposing) return;
    // Keys from a picker rendered elsewhere in the page (a portal) still
    // bubble here through React: Esc there closes the picker, not the window.
    if (!e.currentTarget.contains(e.target as Node)) return;
    e.preventDefault();
    e.stopPropagation();
    props.onClose();
  };

  // Always visible while mounted: closing unmounts it at once instead of
  // waiting for `onClosed`, whose timing is not documented, so the command
  // can reopen it right away, afresh.
  return (
    <ModalOverlay visible={true} canClose={true} onClose={props.onClose}>
      <PopupLayer>
        <div
          // The shared window look (window-style.ts), narrower than the task
          // panel's: four fields and a line of text (quick-capture-style.ts).
          className="nextaction-window nextaction-capture"
          role="dialog"
          aria-modal="true"
          aria-labelledby={id("title")}
          onKeyDown={onKeyDown}
        >
          <header className="nextaction-capture-header">
            <div className="nextaction-capture-title" id={id("title")}>
              {t("Create task")}
            </div>
            <Tooltip text={t("Close")}>
              <Button
                variant="plain"
                aria-label={t("Close")}
                onClick={props.onClose}
              >
                <i className="ti ti-x" aria-hidden="true" />
              </Button>
            </Tooltip>
          </header>
          <div className="nextaction-capture-body">
            <CompositionInput
              ref={input}
              className="nextaction-capture-text"
              // Orca's Input puts `style` on the input element itself.
              style={captureTextStyle}
              aria-label={t("Task name")}
              placeholder={t("Task name, press Enter to create")}
              value={text}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setText(e.target.value)
              }
              onKeyDown={onTextKeyDown}
            />
            <div className="nextaction-capture-fields">
              <div className="nextaction-task-fields">
                <Field label={t("Importance")} labelId={id("importance")}>
                  <RatingField
                    labelId={id("importance")}
                    value={draft.importance}
                    name={importanceName}
                    onChange={set("importance")}
                  />
                </Field>
                <Field label={t("Urgency")} labelId={id("urgency")}>
                  <RatingField
                    labelId={id("urgency")}
                    value={draft.urgency}
                    name={urgencyName}
                    onChange={set("urgency")}
                  />
                </Field>
                <Field label={t("Effort")} labelId={id("effort")}>
                  <RatingField
                    labelId={id("effort")}
                    value={draft.effort}
                    name={effortName}
                    onChange={set("effort")}
                  />
                </Field>
                <Field label={t("Start")} labelId={id("start")}>
                  <DateField
                    labelId={id("start")}
                    value={draft.start}
                    today={today}
                    onChange={set("start")}
                  />
                </Field>
                <Field label={t("Due")} labelId={id("due")}>
                  <DateField
                    labelId={id("due")}
                    value={draft.due}
                    today={today}
                    onChange={set("due")}
                  />
                </Field>
              </div>
            </div>
          </div>
          <footer className="nextaction-capture-footer">
            <span className="nextaction-capture-hint">
              <i className="ti ti-inbox" aria-hidden="true" />
              {t("Goes to today's journal, into the inbox")}
            </span>
            <Button variant="plain" onClick={props.onClose}>
              {t("Cancel")}
            </Button>
            <Button
              variant="solid"
              disabled={blank}
              onClick={() => void submit()}
            >
              {t("Create")}
            </Button>
          </footer>
        </div>
      </PopupLayer>
    </ModalOverlay>
  );
}

/**
 * The quick capture command ("Create task"): opens the popup in `render`'s root. At most
 * one popup at a time; running the command while it is open does nothing.
 */
export function createQuickCaptureCommand(
  quickCapture: QuickCapture,
  pluginName: string,
  /** The current logical day, for the dates. */
  today: () => CalendarDate,
  render: (node: React.ReactNode) => void,
): CommandFn {
  let open = false;
  return () => {
    if (open) return;
    open = true;
    render(
      <QuickCapturePopup
        quickCapture={quickCapture}
        pluginName={pluginName}
        today={today}
        onClose={() => {
          open = false;
          render(null);
        }}
      />,
    );
  };
}
