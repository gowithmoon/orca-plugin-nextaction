// The stats view's distribution of completions (GLOSSARY: 统计视图, #136): the
// period's completions by context, label or importance as horizontal bars,
// switched with a segmented control, context first. The control is plain
// buttons, so the keyboard reaches and presses them. Each bar reads as its
// name and count, in its tooltip and to a screen reader. Only Orca's theme
// variables; verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  DistributionDimension,
  DistributionItem,
  Distributions,
} from "../../../domain/stats/distributions";
import { t } from "../../../shared/l10n/l10n";
import { formatContext, importanceName } from "../../components/format";

const dimensions: readonly DistributionDimension[] = [
  "context",
  "label",
  "importance",
];

function dimensionName(dimension: DistributionDimension): string {
  switch (dimension) {
    case "context":
      return t("Context");
    case "label":
      return t("Label");
    case "importance":
      return t("Importance");
  }
}

/** What an item shows as: a context with `@`, "not set" for no value. */
function itemName(item: DistributionItem): string {
  switch (item.dimension) {
    case "importance":
      return importanceName(item.value);
    case "context":
      return item.value === null ? t("Not set") : formatContext(item.value);
    case "label":
      return item.value === null ? t("Not set") : item.value;
  }
}

/** A key for an item, unique within its distribution. */
function itemKey(item: DistributionItem): string {
  return item.value === null ? "" : `=${item.value}`;
}

export function CompletionDistribution(props: {
  distributions: Distributions;
  /**
   * Shown instead of the bars when the period has no completion; `null`
   * shows the bars.
   */
  emptyMessage: string | null;
}) {
  const { Tooltip } = orca.components;
  const headingId = React.useId();
  const [dimension, setDimension] =
    React.useState<DistributionDimension>("context");
  const items = props.distributions[dimension];
  const most = Math.max(1, ...items.map((item) => item.completions));

  return (
    <section className="nextaction-stats-distribution">
      <div className="nextaction-stats-distribution-header">
        <h3 id={headingId} className="nextaction-stats-distribution-title">
          {t("Distribution of completions")}
        </h3>
        <fieldset
          aria-labelledby={headingId}
          className="nextaction-stats-segmented"
        >
          {dimensions.map((value) => (
            <button
              key={value}
              type="button"
              className="nextaction-stats-segment"
              aria-pressed={value === dimension}
              onClick={() => setDimension(value)}
            >
              {dimensionName(value)}
            </button>
          ))}
        </fieldset>
      </div>
      {props.emptyMessage !== null ? (
        <p className="nextaction-stats-empty" role="status">
          {props.emptyMessage}
        </p>
      ) : (
        <ul
          className="nextaction-stats-distribution-items"
          aria-labelledby={headingId}
        >
          {items.map((item) => {
            const name = itemName(item);
            const description = t("${name}: ${completions} completed", {
              name,
              completions: String(item.completions),
            });
            return (
              <Tooltip
                key={itemKey(item)}
                text={description}
                defaultPlacement="top"
              >
                <li
                  className="nextaction-stats-distribution-item"
                  data-not-set={item.value === null ? "" : undefined}
                >
                  <span className="nextaction-visually-hidden">
                    {description}
                  </span>
                  <span
                    className="nextaction-stats-distribution-name"
                    aria-hidden="true"
                  >
                    {name}
                  </span>
                  <svg
                    className="nextaction-stats-distribution-track"
                    width="100%"
                    height="10"
                    aria-hidden="true"
                  >
                    {item.completions > 0 && (
                      <rect
                        className="nextaction-stats-bar-completions"
                        width={`${(item.completions / most) * 100}%`}
                        height="10"
                        rx="2"
                      />
                    )}
                  </svg>
                  <span
                    className="nextaction-stats-distribution-count"
                    aria-hidden="true"
                  >
                    {item.completions}
                  </span>
                </li>
              </Tooltip>
            );
          })}
        </ul>
      )}
    </section>
  );
}
