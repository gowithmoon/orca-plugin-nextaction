import type { DayBoundarySetting } from "../application/ports/day-boundary-setting";
import type { ReminderDefaultTimeSetting } from "../application/ports/reminder-default-time-setting";
import type { StartPreviewDaysSetting } from "../application/ports/start-preview-days-setting";
import type { TaskRepository } from "../application/ports/task-repository";
import { createAddNewBlockRefTarget } from "../application/usecases/add-new-block-ref-target";
import {
  createClearCompletionHistory,
  createDeleteCompletionEntry,
} from "../application/usecases/delete-completion-entries";
import { createDiscardUnreadable } from "../application/usecases/discard-unreadable";
import { createDropTask } from "../application/usecases/drop-task";
import { createEditTask } from "../application/usecases/edit-task";
import {
  createCanMarkReviewed,
  createMarkReviewed,
} from "../application/usecases/mark-reviewed";
import { createPreviewNextOccurrence } from "../application/usecases/preview-next-occurrence";
import { createReadBlockRefCandidates } from "../application/usecases/read-block-ref-candidates";
import { createReadCandidates } from "../application/usecases/read-candidates";
import {
  createReadTask,
  createReadTaskForPanel,
} from "../application/usecases/read-task";
import { createReadTaskPanelRelations } from "../application/usecases/read-task-panel-relations";
import { createRepairNotAdvanced } from "../application/usecases/repair-not-advanced";
import { createSetCustomProperty } from "../application/usecases/set-custom-property";
import { createSetDependencies } from "../application/usecases/set-dependencies";
import { createSetDependencyMode } from "../application/usecases/set-dependency-mode";
import { createSetProjectOfTask } from "../application/usecases/set-project-of-task";
import { createSetRecurrence } from "../application/usecases/set-recurrence";
import { createSetReminders } from "../application/usecases/set-reminders";
import { createSetReviewPlan } from "../application/usecases/set-review-plan";
import { createSetSequential } from "../application/usecases/set-sequential";
import type { CalendarDate } from "../domain/task/task";
import { systemClock } from "../infra/system-clock";
import type { ChangeSignalSource } from "../shared/change-signal";
import type { TaskActionsDeps } from "../ui/hooks/use-task-actions";
import { createCompletionHistoryPopup } from "../ui/task-panel/completion-history-popup";
import { createRecurrencePopup } from "../ui/task-panel/recurrence-popup";
import { createReminderPopup } from "../ui/task-panel/reminder-popup";
import {
  createReviewPopup,
  type OpenReviewPopup,
} from "../ui/task-panel/review-popup";
import type { TaskPanelFormDeps } from "../ui/task-panel/task-panel-form";
import {
  createTaskPanelPopup,
  type OpenTaskPanelPopup,
} from "../ui/task-panel/task-panel-popup";
import type { FeatureContext, FeatureModule } from "./bootstrap";

/**
 * The task panel (#40, #42): the popup's own React root, unmounted on unload;
 * its style sheets come from the popup styles feature. `open` is what the task menu and the plugin panel call
 * for the popup; it may be handed out before the feature loads and does
 * nothing outside a load. `formDeps` is what the form needs wherever it shows
 * (the popup, the plugin panel's side pane). `openReviewPopup` opens the
 * review popup (#103) for a task, for any view that offers it.
 */
export function createTaskPanelFeature(deps: {
  repository: TaskRepository;
  /** Tasks may have changed: an open task panel reads its task again. */
  changes: ChangeSignalSource;
  /** The current logical day, for dates and overdue. */
  today: () => CalendarDate;
  /** The day boundary, for the logical day the task graph is read on. */
  dayBoundary: DayBoundarySetting;
  /** How far ahead a start lets a task in, for why it is not a next action. */
  startPreviewDays: StartPreviewDaysSetting;
  /** The time of day the reminder popup's quick options fall at (#107). */
  reminderDefaultTime: ReminderDefaultTimeSetting;
  /** The plugin panel's status change, "open in notes" and notices (#39). */
  taskActions: TaskActionsDeps;
}): {
  feature: FeatureModule;
  open: OpenTaskPanelPopup;
  formDeps: TaskPanelFormDeps;
  openReviewPopup: OpenReviewPopup;
} {
  const { repository } = deps;
  // Until a load says otherwise, writing on leaving is allowed.
  let releasing = () => false;
  // The recurrence rule (#95), review (#103), reminder (#107) and
  // completion history (#209) popups' roots.
  const recurrenceRoot = rootWhileLoaded("recurrencePopup");
  const reviewRoot = rootWhileLoaded("reviewPopup");
  const reminderRoot = rootWhileLoaded("reminderPopup");
  const completionHistoryRoot = rootWhileLoaded("completionHistoryPopup");
  const readTask = createReadTask({ repository });
  // The popups' "Discard and reset" (#106): the task read again afterwards.
  const discard = {
    discardUnreadable: createDiscardUnreadable({ repository }),
    readTask,
    notify: deps.taskActions.notify,
  };
  const clockDeps = {
    repository,
    clock: systemClock,
    dayBoundary: deps.dayBoundary,
  };
  const openReminderPopup = createReminderPopup({
    deps: {
      setReminders: createSetReminders({ repository, clock: systemClock }),
      reminderDefaultTime: deps.reminderDefaultTime,
      now: () => systemClock.now(),
      today: deps.today,
      notify: deps.taskActions.notify,
      discard,
    },
    // Into the load's root; nothing outside a load.
    render: (node) => reminderRoot.render(node),
  });
  const readTaskForPanel = createReadTaskForPanel({ repository });
  const openCompletionHistoryPopup = createCompletionHistoryPopup({
    deps: {
      actions: {
        deleteCompletionEntry: createDeleteCompletionEntry({ repository }),
        clearCompletionHistory: createClearCompletionHistory({ repository }),
        readTaskForPanel,
        notify: deps.taskActions.notify,
      },
      today: deps.today,
      discard,
    },
    // Into the load's root; nothing outside a load.
    render: (node) => completionHistoryRoot.render(node),
  });
  const markReviewed = createMarkReviewed(clockDeps);
  const canMarkReviewed = createCanMarkReviewed();
  const openReviewPopup = createReviewPopup({
    deps: {
      setReviewPlan: createSetReviewPlan(clockDeps),
      markReviewed,
      canMarkReviewed,
      today: deps.today,
      notify: deps.taskActions.notify,
      discard,
    },
    // Into the load's root; nothing outside a load.
    render: (node) => reviewRoot.render(node),
  });
  const formDeps: TaskPanelFormDeps = {
    readTaskForPanel,
    setCustomProperty: createSetCustomProperty({
      repository,
      clock: systemClock,
    }),
    addNewBlockRefTarget: createAddNewBlockRefTarget({ repository }),
    editTask: createEditTask({ repository }),
    dropTask: createDropTask({ repository }),
    readCandidates: createReadCandidates({ repository }),
    readTaskPanelRelations: createReadTaskPanelRelations({
      repository,
      clock: systemClock,
      dayBoundary: deps.dayBoundary,
      startPreviewDays: deps.startPreviewDays,
    }),
    setSequential: createSetSequential({ repository }),
    readBlockRefCandidates: createReadBlockRefCandidates({ repository }),
    setDependencies: createSetDependencies({ repository }),
    setDependencyMode: createSetDependencyMode({ repository }),
    setProjectOfTask: createSetProjectOfTask({ repository }),
    openRecurrencePopup: createRecurrencePopup({
      deps: {
        setRecurrence: createSetRecurrence({
          repository,
          clock: systemClock,
          dayBoundary: deps.dayBoundary,
        }),
        previewNextOccurrence: createPreviewNextOccurrence({
          clock: systemClock,
          dayBoundary: deps.dayBoundary,
        }),
        today: deps.today,
        notify: deps.taskActions.notify,
        discard,
      },
      // Into the load's root; nothing outside a load.
      render: (node) => recurrenceRoot.render(node),
    }),
    repairNotAdvanced: createRepairNotAdvanced({
      repository,
      clock: systemClock,
      dayBoundary: deps.dayBoundary,
    }),
    openReviewPopup,
    openReminderPopup,
    openCompletionHistoryPopup,
    now: () => systemClock.now(),
    markReviewed,
    canMarkReviewed,
    actions: deps.taskActions,
    changes: deps.changes,
    today: deps.today,
    unloading: () => releasing(),
  };
  let current: OpenTaskPanelPopup | undefined;

  const feature: FeatureModule = (context) => {
    const { pluginName, registry } = context;
    releasing = context.releasing;
    // Created before the task panel's root so they are released after it: a
    // popup opened from the task panel goes with the load.
    recurrenceRoot.load(context);
    reviewRoot.load(context);
    reminderRoot.load(context);
    completionHistoryRoot.load(context);
    const root = registry.reactRoot("taskPanelPopup", null);
    let live = true;
    const open = createTaskPanelPopup({
      deps: formDeps,
      // A plugin panel closing late (after unload) still takes its popup
      // away: nothing renders into a root that is gone.
      render: (node) => {
        if (live) root.render(node);
      },
    });
    current = open;
    // Recorded after the root, so it is released first: nothing opens a
    // popup into a root that is going away.
    registry.add(`${pluginName}.taskPanelOpen`, () => {
      live = false;
      if (current === open) current = undefined;
    });
  };

  return {
    feature,
    open: (taskId, onClose, onSelect) =>
      current?.(taskId, onClose, onSelect) ?? (() => {}),
    formDeps,
    openReviewPopup,
  };
}

/**
 * A popup's own React root, which exists only while loaded: rendering outside
 * a load does nothing.
 */
function rootWhileLoaded(name: string) {
  let render: (node: React.ReactNode) => void = () => {};
  return {
    render: (node: React.ReactNode) => render(node),
    load({ pluginName, registry }: FeatureContext) {
      render = registry.reactRoot(name, null).render;
      registry.add(`${pluginName}.${name}Open`, () => {
        render = () => {};
      });
    },
  };
}
