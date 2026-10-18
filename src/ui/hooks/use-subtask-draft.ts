// The AI's side of the "Split into subtasks" window (#202): asks for the
// draft when the window opens, lets the user answer or skip the AI's
// questions, and cancels whatever is under way when the window closes.
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import { AiDraftFailedError } from "../../application/ai/conversation";
import {
  AiCancelledError,
  AiRequestFailedError,
} from "../../application/ports/ai-chat";
import { TaskFeaturesPausedError } from "../../application/ports/task-repository";
import type {
  DraftSubtasks,
  SplitStart,
  SubtaskDraft,
} from "../../application/usecases/draft-subtasks";
import type { TaskId } from "../../domain/task/task";
import { describeError } from "../../shared/describe-error";
import { t } from "../../shared/l10n/l10n";
import { pausedText } from "../notify";

/** Where the conversation with the AI is. */
export type SubtaskDraftState =
  | { readonly kind: "waiting" }
  | {
      readonly kind: "questions";
      readonly questions: readonly string[];
    }
  | { readonly kind: "draft"; readonly draft: SubtaskDraft }
  /** `message` says what went wrong and what to do; already translated. */
  | { readonly kind: "failed"; readonly message: string };

/**
 * What the window shows for a failure. Orca has already told the user about
 * a request that got no reply ("Error calling AI", orca-ai), so nothing is
 * notified again here: the window says where to look.
 */
function failureText(error: unknown): string {
  if (error instanceof AiRequestFailedError) {
    return t(
      "The AI did not answer. Check that the AI chat is set up in Orca's settings, then try again.",
    );
  }
  if (error instanceof AiDraftFailedError) {
    return t("The AI did not give a draft the plugin can use. Try again.");
  }
  if (error instanceof TaskFeaturesPausedError) return pausedText();
  return t("Could not get a draft: ${reason}", {
    reason: describeError(error),
  });
}

export function useSubtaskDraft(
  draftSubtasks: DraftSubtasks,
  taskId: TaskId,
): {
  state: SubtaskDraftState;
  /** Answers the questions, `null` skipping them, and asks for the draft. */
  answer: (answers: readonly string[] | null) => void;
  /** Starts the conversation over, after a failure. */
  retry: () => void;
} {
  const [state, setState] = React.useState<SubtaskDraftState>({
    kind: "waiting",
  });
  const [attempt, setAttempt] = React.useState(0);
  /** The request under way; aborted when the window closes. */
  const controller = React.useRef<AbortController | null>(null);
  const start = React.useRef<Extract<SplitStart, { kind: "questions" }> | null>(
    null,
  );

  /** Runs `request`, showing its draft, or its failure unless cancelled. */
  const run = React.useCallback(
    (request: (signal: AbortSignal) => Promise<SplitStart>) => {
      controller.current?.abort();
      const mine = new AbortController();
      controller.current = mine;
      setState({ kind: "waiting" });
      request(mine.signal).then(
        (result) => {
          if (mine.signal.aborted) return;
          if (result.kind === "questions") {
            start.current = result;
            setState({ kind: "questions", questions: result.questions });
          } else {
            setState({ kind: "draft", draft: result.draft });
          }
        },
        (error: unknown) => {
          if (mine.signal.aborted || error instanceof AiCancelledError) return;
          setState({ kind: "failed", message: failureText(error) });
        },
      );
    },
    [],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` starts it over.
  React.useEffect(() => {
    run((signal) => draftSubtasks(taskId, signal));
    // Closing the window cancels the request; its late reply is dropped.
    return () => controller.current?.abort();
  }, [run, draftSubtasks, taskId, attempt]);

  const answer = React.useCallback(
    (answers: readonly string[] | null) => {
      const questions = start.current;
      if (!questions) return;
      run(async (signal) => ({
        kind: "draft",
        draft: await questions.answer(answers, signal),
      }));
    },
    [run],
  );

  const retry = React.useCallback(() => setAttempt((n) => n + 1), []);

  return { state, answer, retry };
}
