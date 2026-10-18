// The AI's side of a draft window ("Split into subtasks" #202, "Extract
// tasks" #204): asks for the draft when the window opens, lets the user
// answer or skip the AI's questions, and cancels whatever is under way when
// the window closes. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import {
  AiDraftFailedError,
  type AiStart,
} from "../../application/ai/conversation";
import { AiCancelledError } from "../../application/ports/ai-chat";
import type {
  DraftExtractedTasks,
  ExtractDraft,
} from "../../application/usecases/draft-extracted-tasks";
import type {
  DraftSubtasks,
  SubtaskDraft,
} from "../../application/usecases/draft-subtasks";
import type { TaskId } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { aiFailureText } from "../notify";

/** Where the conversation with the AI is. */
export type AiDraftState<D> =
  | { readonly kind: "waiting" }
  | {
      readonly kind: "questions";
      readonly questions: readonly string[];
    }
  | { readonly kind: "draft"; readonly draft: D }
  /** `message` says what went wrong and what to do; already translated. */
  | { readonly kind: "failed"; readonly message: string };

export interface AiDraft<D> {
  state: AiDraftState<D>;
  /** Answers the questions, `null` skipping them, and asks for the draft. */
  answer: (answers: readonly string[] | null) => void;
  /** Starts the conversation over, after a failure. */
  retry: () => void;
}

/** What the window shows for a failure. */
function failureText(error: unknown): string {
  if (error instanceof AiDraftFailedError) {
    return t("The AI did not give a draft the plugin can use. Try again.");
  }
  return aiFailureText(error, (reason) =>
    t("Could not get a draft: ${reason}", { reason }),
  );
}

/** `begin` keeps its identity while the window shows one conversation. */
function useAiDraft<D>(
  begin: (signal: AbortSignal) => Promise<AiStart<D>>,
): AiDraft<D> {
  const [state, setState] = React.useState<AiDraftState<D>>({
    kind: "waiting",
  });
  const [attempt, setAttempt] = React.useState(0);
  /** The request under way; aborted when the window closes. */
  const controller = React.useRef<AbortController | null>(null);
  const start = React.useRef<Extract<AiStart<D>, { kind: "questions" }> | null>(
    null,
  );

  /** Runs `request`, showing its draft, or its failure unless cancelled. */
  const run = React.useCallback(
    (request: (signal: AbortSignal) => Promise<AiStart<D>>) => {
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
    run(begin);
    // Closing the window cancels the request; its late reply is dropped.
    return () => controller.current?.abort();
  }, [run, begin, attempt]);

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

/** "Split into subtasks" (#202) for task `taskId`. */
export function useSubtaskDraft(
  draftSubtasks: DraftSubtasks,
  taskId: TaskId,
): AiDraft<SubtaskDraft> {
  const begin = React.useCallback(
    (signal: AbortSignal) => draftSubtasks(taskId, signal),
    [draftSubtasks, taskId],
  );
  return useAiDraft(begin);
}

/** "Extract tasks" (#204) from blocks `blockIds`, in note order. */
export function useExtractDraft(
  draftExtractedTasks: DraftExtractedTasks,
  blockIds: readonly number[],
): AiDraft<ExtractDraft> {
  const begin = React.useCallback(
    (signal: AbortSignal) => draftExtractedTasks(blockIds, signal),
    [draftExtractedTasks, blockIds],
  );
  return useAiDraft(begin);
}
