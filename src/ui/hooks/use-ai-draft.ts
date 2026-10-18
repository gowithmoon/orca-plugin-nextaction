// The AI's side of a draft window ("Split into subtasks" #202, "Extract
// tasks" #204): asks for the draft when the window opens, lets the user
// answer or skip the AI's questions, and cancels whatever is under way when
// the window closes. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import { AiDraftFailedError } from "../../application/ai/conversation";
import {
  AiCancelledError,
  AiRequestFailedError,
} from "../../application/ports/ai-chat";
import { TaskFeaturesPausedError } from "../../application/ports/task-repository";
import type {
  DraftExtractedTasks,
  ExtractDraft,
} from "../../application/usecases/draft-extracted-tasks";
import type {
  DraftSubtasks,
  SubtaskDraft,
} from "../../application/usecases/draft-subtasks";
import type { TaskId } from "../../domain/task/task";
import { describeError } from "../../shared/describe-error";
import { t } from "../../shared/l10n/l10n";
import { pausedText } from "../notify";

/** What the first request gave, whatever the feature: questions or `D`. */
type AiStart<D> =
  | {
      readonly kind: "questions";
      readonly questions: readonly string[];
      readonly answer: (
        answers: readonly string[] | null,
        signal: AbortSignal,
      ) => Promise<D>;
    }
  | { readonly kind: "result"; readonly result: D };

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
            setState({ kind: "draft", draft: result.result });
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
        kind: "result",
        result: await questions.answer(answers, signal),
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
    async (signal: AbortSignal): Promise<AiStart<SubtaskDraft>> => {
      const start = await draftSubtasks(taskId, signal);
      return start.kind === "questions"
        ? start
        : { kind: "result", result: start.draft };
    },
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
    async (signal: AbortSignal): Promise<AiStart<ExtractDraft>> => {
      const start = await draftExtractedTasks(blockIds, signal);
      return start.kind === "questions"
        ? start
        : { kind: "result", result: start };
    },
    [draftExtractedTasks, blockIds],
  );
  return useAiDraft(begin);
}
