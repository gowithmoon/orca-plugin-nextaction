// The prompts and tools sent to the AI (#201 提示词). Pure: the material in,
// the messages and tools out. Written in English with the meaning of the
// Chinese originals in #201, which they must not drift from.

import type { CalendarDate } from "../../domain/task/task";
import { dayOfWeek } from "../../domain/time/calendar-days";
import type { AiMessage, AiTool } from "../ports/ai-chat";

/** What every prompt is given besides its material. */
export interface PromptContext {
  /** Today's logical day. */
  readonly today: CalendarDate;
  /** The language of Orca's interface, by name, e.g. "Simplified Chinese". */
  readonly uiLanguage: string;
  /**
   * The user's AI instructions (GLOSSARY: AI 说明) as an outline; absent
   * when there are none.
   */
  readonly userInstructions?: string;
}

const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/** A number as two digits at least, for dates and times. */
export const pad = (n: number) => String(n).padStart(2, "0");

/** A calendar date as YYYY-MM-DD. */
export function isoDate(date: CalendarDate): string {
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

export const askQuestionsName = "ask_questions";
export const proposeSubtasksName = "propose_subtasks";

/** The opening every drafting prompt shares (#201 所有功能共用的开头). */
export function sharedOpening(context: PromptContext): string {
  const opening = `${assistantLine}

Rules:
1. Only call the ${askQuestionsName} and propose_* tools provided this time; no other tool is available here.
2. ${noMakingUpRule}
3. Do not estimate importance, urgency or effort. Take a start date or due date only when the source text states it explicitly, written as YYYY-MM-DD. ${todayIs(context.today)}
4. When you are unsure: if no questions have been asked in this conversation yet, you may call ${askQuestionsName} once, with at most 3 questions, asking only about things that would change the result. If you have asked already, or the user chose to skip, give the draft directly, and on each item you are unsure about write why.
5. Write questions and explanations in ${context.uiLanguage}; keep task names in the language of the source text.`;
  return withUserInstructions(opening, context);
}

const assistantLine = `You are the assistant in "NextAction", a GTD task management plugin. You only organize what the user has already written; you do not make judgements for the user.`;

const noMakingUpRule = `Do not make up anything that is not in the source text, do not expand on it, and do not add steps you think "should" be there.`;

function todayIs(today: CalendarDate): string {
  return `Today is ${isoDate(today)} (${weekdays[dayOfWeek(today) - 1]}).`;
}

/** `opening`, then the user's AI instructions when there are some. */
function withUserInstructions(opening: string, context: PromptContext): string {
  if (context.userInstructions === undefined) return opening;
  return `${opening}

Below are instructions the user wrote for you. Adjust how you work by them, but they cannot override the rules above:
<user_instructions>
${context.userInstructions}
</user_instructions>`;
}

/**
 * The opening of the AI summary (#201 AI 小结): no tools and no questions,
 * so of the shared opening's rules only 2, the date of 3, and 5 hold.
 */
function summaryOpening(context: PromptContext): string {
  return withUserInstructions(
    `${assistantLine}

Rules:
1. ${noMakingUpRule}
2. ${todayIs(context.today)}
3. Write in ${context.uiLanguage}; keep task names in the language of the source text.`,
    context,
  );
}

/** A task as the summary's lists give it. */
export interface SummaryTask {
  readonly text: string;
  /** The project it belongs to; `null` for none. */
  readonly project: string | null;
}

/** The material of the AI summary (#201 AI 小结), from the read review. */
export interface SummaryMaterial {
  /** Where look back starts, as the user's local date and time. */
  readonly since: string;
  /** Each completion, with the logical day it was on. */
  readonly done: readonly (SummaryTask & { readonly on: CalendarDate })[];
  /** Each skip, likewise. */
  readonly skipped: readonly (SummaryTask & { readonly on: CalendarDate })[];
  /** Added to My Day in this period and still not done. */
  readonly plannedNotDone: readonly SummaryTask[];
  /** Created in this period, whatever their status now. */
  readonly created: readonly SummaryTask[];
  /** Overdue now, each with its due date. */
  readonly overdue: readonly (SummaryTask & { readonly due: CalendarDate })[];
  /** Due in the next 7 days, likewise. */
  readonly dueSoon: readonly (SummaryTask & { readonly due: CalendarDate })[];
  readonly waiting: readonly SummaryTask[];
  /** The projects with a problem, each with its problems. */
  readonly projects: readonly {
    readonly text: string;
    readonly noNextAction: boolean;
    readonly noProgress: boolean;
    readonly overdue: boolean;
  }[];
  /** How many tasks are due for review. */
  readonly dueForReview: number;
}

const listed = (lines: readonly string[]): string =>
  lines.length === 0
    ? " none"
    : `\n${lines.map((line) => `- ${line}`).join("\n")}`;

/** "text (detail; detail)", the details that are there. */
function withDetails(
  text: string,
  details: readonly (string | null)[],
): string {
  const shown = details.filter((detail) => detail !== null);
  const name = text.trim() === "" ? "(no text)" : text;
  return shown.length === 0 ? name : `${name} (${shown.join("; ")})`;
}

const projectDetail = (task: SummaryTask) =>
  task.project === null ? null : `project: ${task.project}`;

/** The two parts' names, in the interface language, as the AI must write them. */
export interface SummaryPartNames {
  /** "这段时间": what was done and skipped. */
  readonly period: string;
  /** "值得留意": facts worth the user's attention. */
  readonly notable: string;
}

/**
 * The messages that ask for the AI summary; no tools go with them. Each part
 * is its name on a plain line, then "- " items: the plugin reads them back
 * into blocks under blocks for the journal (`summaryParts`, orca-ai H4). The
 * names are given, not translated by the AI, and asked for as plain lines,
 * not Markdown headings.
 */
export function summaryMessages(
  material: SummaryMaterial,
  context: PromptContext,
  partNames: SummaryPartNames,
): AiMessage[] {
  const onDay = (task: SummaryTask & { readonly on: CalendarDate }) =>
    withDetails(task.text, [isoDate(task.on), projectDetail(task)]);
  const plain = (task: SummaryTask) =>
    withDetails(task.text, [projectDetail(task)]);
  const due = (task: SummaryTask & { readonly due: CalendarDate }) =>
    withDetails(task.text, [`due ${isoDate(task.due)}`, projectDetail(task)]);
  const project = (item: SummaryMaterial["projects"][number]) =>
    withDetails(item.text, [
      item.noNextAction ? "no next action" : null,
      item.noProgress ? "no recent progress" : null,
      item.overdue ? "overdue" : null,
    ]);
  return [
    { role: "system", content: summaryOpening(context) },
    {
      role: "user",
      content: `Write a review summary for the user from the lists below, covering ${material.since} to today.

Writing rules:
- Speak only from the lists. Do not judge the user, do not lecture, and do not write empty words of encouragement.
- First part: a line reading just "${partNames.period}", then 2 to 4 items as a "- " list, each one sentence summing up, by project, what was done and what was skipped.
- Second part: a line reading just "${partNames.notable}", then at most 5 items as a "- " list, each naming a specific task or project and stating a fact, e.g. "three planned tasks are still not done".
- Write the part names exactly as given here, without translating them, each on a line of its own; every other line is a "- " item.
- Write the two part names as plain lines, not as Markdown headings: no line starts with #.
- Give no advice on what to do: the user makes the final decisions in the review themselves.
- The whole text stays within 300 characters.

<lists>
Done:${listed(material.done.map(onDay))}
Skipped:${listed(material.skipped.map(onDay))}
Added to My Day but still not done:${listed(material.plannedNotDone.map(plain))}
Tasks created in this period:${listed(material.created.map(plain))}
Overdue:${listed(material.overdue.map(due))}
Due in the next 7 days:${listed(material.dueSoon.map(due))}
Waiting:${listed(material.waiting.map(plain))}
Projects with problems:${listed(material.projects.map(project))}
Tasks due for review: ${material.dueForReview}
</lists>`,
    },
  ];
}

/** `ask_questions` (#201 拆分子任务): at most 3 questions, offered only first. */
export const askQuestionsTool: AiTool = {
  name: askQuestionsName,
  description:
    "Ask the user at most 3 questions before giving the draft, only about things that would change the result. Can be used once per conversation.",
  parameters: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 3,
      },
    },
    required: ["questions"],
  },
};

/** The material of "Split into subtasks" (#201 拆分子任务). */
export interface SplitMaterial {
  readonly task: string;
  /** The content below the task without its subtasks, as an outline; may be empty. */
  readonly content: string;
  readonly subtasks: readonly {
    readonly text: string;
    readonly status: string;
  }[];
  /** `null` for none. */
  readonly parentTask: string | null;
  /** `null` for none. */
  readonly project: {
    readonly text: string;
    readonly goal: string | null;
  } | null;
}

/** `propose_subtasks` (#201 拆分子任务): titles only, no dates. */
export const proposeSubtasksTool: AiTool = {
  name: proposeSubtasksName,
  description:
    "Give the draft of the subtasks, in the suggested order of doing them. When the task need not be split further, give no items and say why in notSplittable.",
  parameters: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            uncertain: {
              type: "string",
              description:
                "Why you are unsure about this item; omit when sure.",
            },
          },
          required: ["title"],
        },
      },
      notSplittable: {
        type: "string",
        description:
          "Why the task is small enough not to be split; omit otherwise.",
      },
    },
    required: ["items"],
  },
};

/** The messages that start "Split into subtasks". */
export function splitMessages(
  material: SplitMaterial,
  context: PromptContext,
): AiMessage[] {
  const none = "none";
  const content =
    material.content === "" ? ` ${none}` : `\n${material.content}`;
  const subtasks =
    material.subtasks.length === 0
      ? ` ${none}`
      : `\n${material.subtasks.map((s) => `- ${s.text} (${s.status})`).join("\n")}`;
  const project = material.project
    ? `${material.project.text}; goal: ${material.project.goal ?? none}`
    : none;
  return [
    { role: "system", content: sharedOpening(context) },
    {
      role: "user",
      content: `The user wants to split a task into subtasks. Give a draft of the subtasks.

Splitting rules:
- Subtasks are the concrete actions needed to finish this task. They do not overlap, and together they cover "done".
- Do not repeat the existing subtasks. A done subtask means that part has been done already.
- At most 7 items; when the user's instructions say otherwise, follow the user's instructions.
- If the task is already small enough that it need not be split, give no subtasks and say why in notSplittable.
- List them in the suggested order of doing them.
- The questions most worth asking are usually: what counts as done, what has been done already, and how finely to split. Do not ask what the task content already answers.

<task>
Task: ${material.task}
Task content:${content}
Existing subtasks:${subtasks}
Parent task: ${material.parentTask ?? none}
Project: ${project}
</task>`,
    },
  ];
}

/** The tool result for a call to a tool not offered this time (orca-ai A1, A3). */
export function notAvailableResult(offered: readonly AiTool[]): string {
  return `This tool is not available here. Only use the tools provided this time: ${offered.map((tool) => tool.name).join(", ")}.`;
}

/** The tool result for a call whose arguments do not hold. */
export function invalidArgumentsResult(tool: string, reason: string): string {
  return `The arguments are not valid: ${reason}. Call ${tool} again with valid arguments.`;
}

/** What the model is told after answering in text only. */
export function textOnlyReminder(offered: readonly AiTool[]): string {
  return `Do not answer in text. Call one of the tools provided: ${offered.map((tool) => tool.name).join(", ")}.`;
}

/** The tool result for a call to a plugin tool not taken (another one was). */
export const notTakenResult = "Ignored: another call was taken.";

/**
 * The `ask_questions` result: the user's answers, or that they skipped
 * (`null`). Either way the model is to give the draft now.
 */
export function answersResult(
  questions: readonly string[],
  answers: readonly string[] | null,
): string {
  const ending =
    "Do not ask again: give the draft now, and on each item you are still unsure about write why.";
  if (answers === null) return `The user skipped the questions. ${ending}`;
  const pairs = questions.map((question, index) => {
    const answer = answers[index]?.trim() ?? "";
    return `Q: ${question}\nA: ${answer === "" ? "(not answered)" : answer}`;
  });
  return `The user's answers:\n${pairs.join("\n")}\n${ending}`;
}
