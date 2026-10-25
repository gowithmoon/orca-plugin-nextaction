<p align="center">
  <img src="icon.svg" width="96" height="96" alt="NextAction icon">
</p>

<h1 align="center">NextAction</h1>

<p align="center">
  <a href="README.md"><img src="https://img.shields.io/badge/%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-9AA3B2?style=for-the-badge" alt="简体中文"></a>
  <img src="https://img.shields.io/badge/English-1C5FC7?style=for-the-badge" alt="English">
</p>

<p align="center">
  <a href="https://github.com/gowithmoon/orca-plugin-nextaction/actions/workflows/check.yml"><img src="https://github.com/gowithmoon/orca-plugin-nextaction/actions/workflows/check.yml/badge.svg" alt="check"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0--or--later-1C5FC7" alt="GPL-3.0-or-later"></a>
</p>

A GTD task manager for [Orca Note](https://www.orca-studio.com/orcanote/) (formerly Task Planner), with task capture, next action calculation, My Day, projects, review and more.

## Features

### Tasks and capture

- Use the Convert to task command to turn the current block into a task, or the Create task popup to jot down a new one, which goes to the end of today's journal. You can also tag a block with the task tag directly.
- Six statuses: Inbox (where new tasks start), Todo, Doing, Waiting, Someday, Done.
- Parent and subtask relations follow Orca's block hierarchy. A parent task can be set to Sequential, so its subtasks become next actions one at a time, in the order they appear in the note.
- Recurring tasks and reminders.
- Drag any task card from the plugin panel into a note to create a block reference to the task. Hold `Alt` (`Option`) to create a mirror block instead.

### Next actions

From statuses, subtasks, dependencies, sequential parents, start dates and project status, the plugin works out the tasks you can do now and sorts them by score. The score combines due date, start date, importance and urgency, adjusted for effort. Importance and urgency are inherited from parent tasks and projects.

### My Day

Each morning, pick the tasks you want to do today from your task lists and add them to My Day from the right-click menu. The My Day view has three layouts:

- Timeline: drag tasks onto the timeline to schedule them, and drag to change their time and length.
- List: today's tasks laid out flat, sorted by score from high to low.
- Eisenhower Matrix: four quadrants by importance and urgency. Dragging a card to another quadrant rewrites those values.

### Inbox and All tasks

- Inbox: where new tasks start. Clarify them one by one in the Task Panel, deciding which to do, which to leave for later, and which no longer need doing.
- All tasks: every task in a tree, with search, filters, sorting and drag and drop.

### Projects

Tag a block with the project tag to make it a project. The project list groups projects by status (Planning, Active, Paused, Someday, Done) and shows each project's progress and whether it is overdue, has no next action, or has made no recent progress. A project's details come in three layouts:

- Tree: like All tasks, all of the project's tasks in a tree.
- Board: columns by status or by root task (the project's top-level tasks). Drag cards to change status or parent.
- Gantt: day, week or month scale. Drag bars to change dates, see dependency arrows and date conflicts, and shift dependent tasks later in one click.

The project panel edits a project's status, goal, dates, importance and urgency, and the custom properties you add to the project tag.

### Review

Walk through the GTD weekly review step by step: Inbox, Look back, Overdue, Due in the next 7 days, Next actions, Waiting, Projects, Someday, Due for review, Summary. Each step has quick actions such as Add to My Day, change the due date, and Drop. Tasks can have a review interval or a review date, and show up under Due for review once they are due.

### Task Map

Shows the relations between all tasks as a graph: projects and parent tasks group their tasks, sequential subtasks are chained, and arrows show dependencies. Click a card to highlight what it waits on and what waits on it. On the map you can drag to add dependencies, delete them, toggle Sequential, and drag tasks into other groups (under another parent task or project).

### AI

Uses Orca's built-in AI. Currently supported:

- Split into subtasks: break a task into subtasks.
- Extract tasks: find tasks in the selected blocks, write them into your notes and tag them as tasks.
- AI Summary: write a summary in the last step of a review, and add it to today's journal in one click.

In the settings you can name a block as extra instructions. That block and its children go with every request, so you can write down your habits, preferences and instructions there.

## Installation

### From the plugin marketplace

1. Open Orca's plugin marketplace, search for NextAction and install it.
2. Enable it under Settings → Plugins.

### From a zip

1. Download `orca-plugin-nextaction-v<version>.zip` from the [Releases](https://github.com/gowithmoon/orca-plugin-nextaction/releases) page.
2. Extract it into `orca/plugins` under your Documents folder:
   - Windows: `C:\Users\<you>\Documents\orca\plugins`
   - macOS: `~/Documents/orca/plugins`
3. Check that the result is `orca/plugins/orca-plugin-nextaction/`, with `dist/`, `package.json` and the other files directly inside.
4. Restart Orca and enable the plugin under Settings → Plugins.

> [!IMPORTANT]
> The folder must be named `orca-plugin-nextaction`. Orca identifies a plugin by its folder name and stores the plugin's settings and data under it. A renamed folder is a different plugin.

## Quick start

1. Click the NextAction button in the editor's right-hand toolbar to open the plugin panel. Click it again to close it.
2. Type `/` in a note and pick Convert to task to turn the current block into a task, or Create task to add a new one. You can also tag a block with the task tag directly (Task by default, changeable in the settings).
3. Bind Convert to task, Create task and Extract tasks in Orca's shortcut settings if you use them often.
4. The Task Menu is in a task block's block menu. Right-clicking the task tag or a card in the plugin panel opens it too. Click the status icon in front of a task to change its status directly.

### Settings

Change these under Settings → Plugins → NextAction:

| Setting | Default | What it does |
|---|---|---|
| Task tag name | Task | The tag that marks a block as a task. Set at first start to "Task" or "任务" from the interface language |
| Project tag name | Project | The tag that marks a page or block as a project. Set at first start to "Project" or "项目" from the interface language |
| Day boundary | 5:00 | A day starts at this time. Affects My Day, overdue and recurrence |
| Reminder default time | 9:00 | The time quick reminder options (such as on the due date or 3 days before) fall at |
| Project view default layout | Tree | Tree, Board or Gantt |
| My Day default layout | Timeline | Timeline, List or Eisenhower Matrix |
| Start preview days | 0 | Tasks starting within this many days already show in next actions, with a slightly lower score |
| AI instructions block | empty | A block ID. That block and everything below it go with every AI request |

> [!WARNING]
> Rename the task tag or project tag only in the plugin settings. Do not rename or delete these two tags directly in Orca.

### Before using AI

Set up an AI chat model in Orca's settings before using Split into subtasks, Extract tasks or AI Summary. The plugin connects to no model of its own and needs no separate key.

## Building from source

Requires Node.js 24 and pnpm 12.

```bash
pnpm install
pnpm build          # build into dist/
pnpm package        # build and pack into release/orca-plugin-nextaction-v<version>.zip
pnpm check          # typecheck, lint, test, build
```

The zip from `pnpm package` holds a single `orca-plugin-nextaction/` folder with `dist/`, `package.json`, `icon.svg`, `LICENSE` and both READMEs. Upload it to Releases as is, or extract it into the plugins folder.

For local testing, create `.env.local` in the repository root with your Orca plugins folder:

```bash
ORCA_PLUGINS_DIR=/path/to/Documents/orca/plugins
```

Then run `pnpm deploy:local` to copy the build into the `orca-plugin-nextaction/` folder there.

### Releasing a new version

1. Bump `version` in `package.json`, commit and push to main.
2. Push a matching tag, e.g. `git tag v1.0.1 && git push origin v1.0.1`. GitHub Actions checks that the tag matches the version, runs `pnpm check`, and publishes the zip from `pnpm package` to Releases.
3. In [awesome-orcanote](https://github.com/sethyuan/awesome-orcanote), update this plugin's `version`, `updated` and `zip` in `plugins.json` and open a PR.

## License

[GPL-3.0-or-later](LICENSE)
