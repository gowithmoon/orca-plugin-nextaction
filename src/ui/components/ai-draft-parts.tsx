// The parts every AI draft window shares ("Split into subtasks" #202,
// "Extract tasks" #204): waiting with cancel, the AI's questions with skip,
// a failure with try again, and the "unsure" badge under an item. Styles in
// ai-draft-style.ts. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import { t } from "../../shared/l10n/l10n";
import type { AiDraft } from "../hooks/use-ai-draft";
import { WindowFooter, WindowSpacer } from "./plugin-window";

/** The window's scrolling content area. */
export function AiBody(props: {
  role?: React.AriaRole;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        props.className
          ? `nextaction-ai-body ${props.className}`
          : "nextaction-ai-body"
      }
      role={props.role}
    >
      {props.children}
    </div>
  );
}

/** The questions, each with its answer, then skip or go on. */
function Questions(props: {
  questions: readonly string[];
  onAnswer: (answers: readonly string[] | null) => void;
}) {
  const { Button, CompositionInput } = orca.components;
  const [answers, setAnswers] = React.useState(() =>
    props.questions.map(() => ""),
  );
  const idPrefix = React.useId();
  return (
    <>
      <AiBody>
        <p className="nextaction-ai-lead">
          {t("The AI would like to know a few things first:")}
        </p>
        {props.questions.map((question, index) => (
          <label
            // The questions do not change while shown.
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed list.
            key={index}
            className="nextaction-ai-question"
            htmlFor={`${idPrefix}-${index}`}
          >
            <span>{question}</span>
            <CompositionInput
              id={`${idPrefix}-${index}`}
              value={answers[index] ?? ""}
              placeholder={t("Your answer (may be left empty)")}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const value = e.target.value;
                setAnswers((current) =>
                  current.map((answer, i) => (i === index ? value : answer)),
                );
              }}
            />
          </label>
        ))}
      </AiBody>
      <WindowFooter>
        <WindowSpacer />
        <Button variant="plain" onClick={() => props.onAnswer(null)}>
          {t("Skip and get the draft")}
        </Button>
        <Button variant="solid" onClick={() => props.onAnswer(answers)}>
          {t("Answer")}
        </Button>
      </WindowFooter>
    </>
  );
}

/**
 * The window's content for `ai`: waiting, questions or failure here, the
 * draft by `renderDraft`.
 */
export function AiDraftContent<D>(props: {
  ai: AiDraft<D>;
  onClose: () => void;
  renderDraft: (draft: D) => React.ReactNode;
}) {
  const { Button } = orca.components;
  const { state, answer, retry } = props.ai;
  switch (state.kind) {
    case "waiting":
      return (
        <>
          <AiBody role="status" className="nextaction-ai-waiting">
            <i className="ti ti-loader-2" aria-hidden="true" />
            {t("The AI is drafting…")}
          </AiBody>
          <WindowFooter>
            <WindowSpacer />
            <Button variant="plain" onClick={props.onClose}>
              {t("Cancel")}
            </Button>
          </WindowFooter>
        </>
      );
    case "questions":
      return <Questions questions={state.questions} onAnswer={answer} />;
    case "draft":
      return props.renderDraft(state.draft);
    case "failed":
      return (
        <>
          <AiBody role="alert">{state.message}</AiBody>
          <WindowFooter>
            <WindowSpacer />
            <Button variant="plain" onClick={props.onClose}>
              {t("Close")}
            </Button>
            <Button variant="solid" onClick={retry}>
              {t("Try again")}
            </Button>
          </WindowFooter>
        </>
      );
  }
}

/** Why the AI is unsure; shown only in the window, never written (GLOSSARY: 草稿). */
export function UncertainNote(props: { reason: string }) {
  return (
    <div className="nextaction-ai-uncertain">
      <span className="nextaction-ai-badge">{t("Unsure")}</span>
      <span>{props.reason}</span>
    </div>
  );
}
