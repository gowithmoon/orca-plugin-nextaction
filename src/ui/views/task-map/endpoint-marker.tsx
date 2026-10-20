// The endpoint markers on the task map (#217): a dependency whose other end
// is filtered out or hidden is drawn as a marker on the end shown, never as
// an edge through the hidden task. The entry marker sits left of the card
// (it depends on a task not shown), the exit marker right of it (a task not
// shown depends on it); one per side however many endpoints it has.
// Hovering shows the other tasks and what shows them; a click reveals the
// other end (its project added to the filter, or done tasks shown) and
// centers the canvas on it once the map shows it; with several, a menu picks
// one first. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  TaskMapEndpoint,
  TaskMapReveal,
} from "../../../application/usecases/read-task-map";
import type { Project } from "../../../domain/project/project";
import { t } from "../../../shared/l10n/l10n";
import { ContextMenu } from "../../components/popup-controls";
import { projectName } from "./task-map-filter-button";

/** What the markers need of the view: the projects' names, and revealing. */
export interface EndpointMarkerDeps {
  readonly projects: readonly Project[];
  /** Shows the endpoint's other end and centers the canvas on it. */
  readonly reveal: (endpoint: TaskMapEndpoint) => void;
}

const EndpointContext = React.createContext<EndpointMarkerDeps | undefined>(
  undefined,
);

export function EndpointMarkerProvider(props: {
  deps: EndpointMarkerDeps;
  children: React.ReactNode;
}) {
  return (
    <EndpointContext.Provider value={props.deps}>
      {props.children}
    </EndpointContext.Provider>
  );
}

/** The menu's presses are not the canvas's (as dependency-popover.tsx). */
const keepFromCanvas = {
  onPointerDown: (event: React.PointerEvent) => event.stopPropagation(),
  onKeyDown: (event: React.KeyboardEvent) => {
    if (event.key !== "Escape") event.stopPropagation();
  },
};

function otherText(endpoint: TaskMapEndpoint): string {
  const text = endpoint.other.text.trim();
  return text === "" ? t("(No text)") : text;
}

function revealText(
  reveal: TaskMapReveal,
  projects: readonly Project[],
): string {
  if (reveal.kind === "showDone") return t("Show done");
  if (reveal.area === "none") return t("No project");
  const project = projects.find((item) => item.id === reveal.area);
  return t("Project ${name}", {
    name: project ? projectName(project) : String(reveal.area),
  });
}

function conditions(
  endpoint: TaskMapEndpoint,
  projects: readonly Project[],
): string {
  return endpoint.reveal.map((item) => revealText(item, projects)).join(" · ");
}

/** The tooltip: each other task, its ID, and what shows it. */
function MarkerTip(props: {
  side: "in" | "out";
  endpoints: readonly TaskMapEndpoint[];
  projects: readonly Project[];
}) {
  return (
    <div className="nextaction-task-map-endpoint-tip">
      <div className="nextaction-task-map-endpoint-tip-head">
        {props.side === "in"
          ? t("Depends on tasks not shown")
          : t("Tasks not shown depend on it")}
      </div>
      {props.endpoints.map((endpoint) => (
        <div key={endpoint.other.id}>
          <div>
            <span className="nextaction-task-map-endpoint-id">
              #{endpoint.other.id}
            </span>{" "}
            {otherText(endpoint)}
          </div>
          <div className="nextaction-task-map-endpoint-reveal">
            {t("Shown with: ${conditions}", {
              conditions: conditions(endpoint, props.projects),
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The marker on one side of a card; nothing outside the task map. */
export function EndpointMarker(props: {
  side: "in" | "out";
  endpoints: readonly TaskMapEndpoint[];
  /** The card has a dependency badge on its entry: the marker goes above it. */
  badged?: boolean;
}) {
  const { side, endpoints } = props;
  const deps = React.useContext(EndpointContext);
  if (!deps || endpoints.length === 0) return null;
  const { Menu, MenuText, Tooltip } = orca.components;
  const label =
    side === "in"
      ? t("Depends on tasks not shown")
      : t("Tasks not shown depend on it");
  const button = (onClick: (event: React.MouseEvent) => void) => (
    <Tooltip
      text={
        <MarkerTip side={side} endpoints={endpoints} projects={deps.projects} />
      }
      placement="horizontal"
    >
      <button
        type="button"
        className="nextaction-task-map-endpoint"
        data-side={side}
        data-badged={props.badged || undefined}
        aria-label={label}
        onClick={(event) => {
          // Not a click on the card: that opens the task panel.
          event.stopPropagation();
          onClick(event);
        }}
      >
        <i
          className={
            side === "in" ? "ti ti-arrow-bar-to-right" : "ti ti-arrow-bar-right"
          }
          aria-hidden="true"
        />
        {endpoints.length > 1 && <span>{endpoints.length}</span>}
      </button>
    </Tooltip>
  );
  const [only] = endpoints;
  if (endpoints.length === 1 && only) {
    return button(() => deps.reveal(only));
  }
  return (
    <ContextMenu
      menu={(close) => (
        <div {...keepFromCanvas}>
          <Menu>
            {endpoints.map((endpoint) => (
              <MenuText
                key={endpoint.other.id}
                title={otherText(endpoint)}
                subtitle={conditions(endpoint, deps.projects)}
                onClick={() => {
                  close();
                  deps.reveal(endpoint);
                }}
              />
            ))}
          </Menu>
        </div>
      )}
    >
      {(open) => button(open)}
    </ContextMenu>
  );
}
