// The AI summary in the review's summary step (GLOSSARY: AI 小结, #205):
// streams the AI's text into an editable text, cancels what is under way
// when asked or when the step closes, and writes the edited text to today's
// journal. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import {
  AiCancelledError,
  AiRequestFailedError,
} from "../../application/ports/ai-chat";
import { TaskFeaturesPausedError } from "../../application/ports/task-repository";
import type { WriteAiSummary } from "../../application/usecases/write-ai-summary";
import type { WriteSummaryToJournal } from "../../application/usecases/write-summary-to-journal";
import { describeError } from "../../shared/describe-error";
import { t } from "../../shared/l10n/l10n";
import { type Notify, notifyActionFailure, pausedText } from "../notify";

/**
 * Where the summary is: `idle` before the first one; `streaming` while the
 * AI writes; `ready` to edit and write down; `failed` with what to do,
 * already translated.
 */
export type AiSummaryPhase =
  | { readonly kind: "idle" }
  | { readonly kind: "streaming" }
  | { readonly kind: "ready" }
  | { readonly kind: "failed"; readonly message: string };

export interface AiSummary {
  readonly phase: AiSummaryPhase;
  /** The text: as the AI wrote it so far, or as the user edited it. */
  readonly text: string;
  /** The user changed the text since the AI wrote it. */
  readonly edited: boolean;
  /** A write to the journal is under way. */
  readonly writing: boolean;
  /** Asks the AI for a summary; what is shown is replaced. */
  generate(): void;
  /** Stops the AI; what it wrote so far stays, to edit. */
  cancel(): void;
  edit(text: string): void;
  /** Writes the text as it is now to today's journal. */
  write(): void;
}

/**
 * What the step shows for a failure. Orca has already told the user about a
 * request that got no reply ("Error calling AI", orca-ai), so nothing is
 * notified again: the step says where to look.
 */
function failureText(error: unknown): string {
  if (error instanceof AiRequestFailedError) {
    return t(
      "The AI did not answer. Check that the AI chat is set up in Orca's settings, then try again.",
    );
  }
  if (error instanceof TaskFeaturesPausedError) return pausedText();
  return t("Could not get the AI summary: ${reason}", {
    reason: describeError(error),
  });
}

export function useAiSummary(deps: {
  writeAiSummary: WriteAiSummary;
  writeSummaryToJournal: WriteSummaryToJournal;
  notify: Notify;
}): AiSummary {
  const [phase, setPhase] = React.useState<AiSummaryPhase>({ kind: "idle" });
  const [text, setText] = React.useState("");
  const [edited, setEdited] = React.useState(false);
  const [writing, setWriting] = React.useState(false);
  /** The request under way; aborted on cancel and when the step closes. */
  const controller = React.useRef<AbortController | null>(null);
  const latest = React.useRef(deps);
  latest.current = deps;
  const textNow = React.useRef(text);
  textNow.current = text;

  // Leaving the step cancels the request; its late text is dropped.
  React.useEffect(() => () => controller.current?.abort(), []);

  const generate = React.useCallback(() => {
    controller.current?.abort();
    const mine = new AbortController();
    controller.current = mine;
    setText("");
    setEdited(false);
    setPhase({ kind: "streaming" });
    void (async () => {
      let written = "";
      try {
        for await (const piece of latest.current.writeAiSummary(mine.signal)) {
          if (mine.signal.aborted) return;
          written += piece;
          setText(written);
        }
        if (!mine.signal.aborted) setPhase({ kind: "ready" });
      } catch (error) {
        if (mine.signal.aborted || error instanceof AiCancelledError) return;
        setPhase({ kind: "failed", message: failureText(error) });
      }
    })();
  }, []);

  const cancel = React.useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    // What the AI wrote so far stays, to edit; nothing came: as before.
    setPhase(
      textNow.current.trim() === "" ? { kind: "idle" } : { kind: "ready" },
    );
  }, []);

  const edit = React.useCallback((next: string) => {
    setText(next);
    setEdited(true);
  }, []);

  const writingNow = React.useRef(false);
  const write = React.useCallback(() => {
    // Two quick clicks must not write twice.
    if (writingNow.current) return;
    writingNow.current = true;
    setWriting(true);
    const { writeSummaryToJournal, notify } = latest.current;
    writeSummaryToJournal(textNow.current)
      .then(
        (result) => {
          if (result.kind === "written") {
            notify(
              "success",
              t("The AI summary was written to today's journal"),
            );
          }
        },
        (error: unknown) =>
          notifyActionFailure(notify, error, (reason) =>
            t("Could not write the AI summary to the journal: ${reason}", {
              reason,
            }),
          ),
      )
      .finally(() => {
        writingNow.current = false;
        setWriting(false);
      });
  }, []);

  return { phase, text, edited, writing, generate, cancel, edit, write };
}
