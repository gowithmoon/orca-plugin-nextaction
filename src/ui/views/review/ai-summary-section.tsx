// The AI summary in the review's summary step (GLOSSARY: AI 小结, #205): an
// "AI summary" button; the AI's text shows as it comes, with Cancel; then it
// is an editable text with "Write to today's journal"; a failure says why in
// place, with Try again. Generating again over edited text asks first.
// Nothing is written until the user writes it. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { WriteAiSummary } from "../../../application/usecases/write-ai-summary";
import type { WriteSummaryToJournal } from "../../../application/usecases/write-summary-to-journal";
import { t } from "../../../shared/l10n/l10n";
import { useAiSummary } from "../../hooks/use-ai-summary";
import type { Notify } from "../../notify";

export function AiSummarySection(props: {
  writeAiSummary: WriteAiSummary;
  writeSummaryToJournal: WriteSummaryToJournal;
  notify: Notify;
}) {
  const { Button, CompositionTextArea } = orca.components;
  const summary = useAiSummary(props);
  /** Generating again would replace the user's edits: asking first. */
  const [asking, setAsking] = React.useState(false);
  const { phase } = summary;
  const streaming = phase.kind === "streaming";
  const hasText = summary.text.trim() !== "";

  const onGenerate = () => {
    if (summary.edited && hasText) {
      setAsking(true);
      return;
    }
    summary.generate();
  };

  return (
    <section
      className="nextaction-review-ai-summary"
      aria-label={t("AI summary")}
    >
      <div className="nextaction-review-ai-summary-actions">
        <Button
          variant="outline"
          disabled={streaming || asking}
          onClick={onGenerate}
        >
          <i className="ti ti-sparkles" aria-hidden="true" />
          {phase.kind === "idle" ? t("AI summary") : t("Write it again")}
        </Button>
        {streaming && (
          <>
            <span role="status" className="nextaction-review-ai-summary-status">
              <i className="ti ti-loader-2" aria-hidden="true" />
              {t("The AI is writing…")}
            </span>
            <Button variant="plain" onClick={summary.cancel}>
              {t("Cancel")}
            </Button>
          </>
        )}
      </div>
      {asking && (
        <div role="alert" className="nextaction-review-ai-summary-confirm">
          <span>{t("Replace your edited summary with a new one?")}</span>
          <Button variant="plain" onClick={() => setAsking(false)}>
            {t("Keep editing")}
          </Button>
          <Button
            variant="solid"
            onClick={() => {
              setAsking(false);
              summary.generate();
            }}
          >
            {t("Replace")}
          </Button>
        </div>
      )}
      {phase.kind === "failed" && (
        <div role="alert" className="nextaction-review-ai-summary-failed">
          <span>{phase.message}</span>
          <Button variant="outline" onClick={summary.generate}>
            {t("Try again")}
          </Button>
        </div>
      )}
      {(streaming || phase.kind === "ready") && (
        <>
          <CompositionTextArea
            className="nextaction-review-ai-summary-text"
            aria-label={t("AI summary")}
            rows={8}
            value={summary.text}
            // The AI's text is shown as it comes; edited once it is done.
            readOnly={streaming}
            aria-busy={streaming || undefined}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              summary.edit(e.target.value)
            }
          />
          {phase.kind === "ready" && (
            <div className="nextaction-review-ai-summary-actions">
              <Button
                variant="solid"
                disabled={!hasText || summary.writing}
                onClick={summary.write}
              >
                <i className="ti ti-notebook" aria-hidden="true" />
                {t("Write to today's journal")}
              </Button>
              <span className="nextaction-review-ai-summary-hint">
                {t("Only what you write down is kept.")}
              </span>
            </div>
          )}
        </>
      )}
    </section>
  );
}
