import { describe, expect, it } from "vitest";
import { createFixedAiInstructions } from "../../../tests/fixed-ai-instructions";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import {
  callsReply,
  createScriptedAiChat,
  requestText,
  type ScriptedAnswer,
  toolResults,
} from "../../../tests/scripted-ai-chat";
import { createReadPromptContext } from "../ai/prompt-context";
import { createReadUserInstructions } from "../ai/user-instructions";
import { createDraftExtractedTasks } from "./draft-extracted-tasks";

function setup(answers: readonly ScriptedAnswer[]) {
  const repository = createInMemoryTaskRepository();
  const chat = createScriptedAiChat(answers);
  const clock = createFixedClock("2026-10-18T09:00:00+08:00");
  const aiInstructions = createFixedAiInstructions();
  const draftExtractedTasks = createDraftExtractedTasks({
    repository,
    chat,
    promptContext: createReadPromptContext({
      clock,
      dayBoundary: createFixedDayBoundary(),
      uiLanguage: () => "Simplified Chinese",
      userInstructions: createReadUserInstructions({
        repository,
        setting: aiInstructions,
        warn: () => {},
      }),
    }),
  });
  return { repository, chat, aiInstructions, draftExtractedTasks };
}

const propose = (args: unknown) =>
  callsReply({ name: "propose_tasks", arguments: args });

const noSignal = () => new AbortController().signal;

/** The draft given at once, without questions. */
async function draftOf(
  start: ReturnType<ReturnType<typeof createDraftExtractedTasks>>,
) {
  const given = await start;
  if (given.kind !== "draft") throw new Error("questions, not a draft");
  return given.draft;
}

describe("draft extracted tasks: what the AI is given", () => {
  it("gives the selected blocks in the order given, each with everything below it, tasks marked", async () => {
    const { repository, chat, draftExtractedTasks } = setup([
      propose({ items: [] }),
    ]);
    repository.addBlock(1, { text: "Ideas" });
    repository.addBlock(2, { text: "Paint the fence", parentId: 1 });
    repository.addBlock(10, { text: "Weekly meeting" });
    repository.addBlock(11, { text: "Wang sends the quote", parentId: 10 });
    repository.addBlock(12, { text: "Ask about shipping", parentId: 11 });
    repository.addTask({ id: 13, text: "Send the report" }, { parentId: 10 });

    await draftExtractedTasks([10, 1], noSignal());

    expect(requestText(chat.requests()[0])).toContain(
      [
        "- Weekly meeting",
        "  - Wang sends the quote",
        "    - Ask about shipping",
        "  - [already a task] Send the report",
        "- Ideas",
        "  - Paint the fence",
      ].join("\n"),
    );
  });
});

describe("draft extracted tasks: the user's AI instructions", () => {
  it("gives the instructions block and every block below it", async () => {
    const { repository, chat, aiInstructions, draftExtractedTasks } = setup([
      propose({ items: [] }),
    ]);
    repository.addBlock(1, { text: "Meeting notes" });
    repository.addBlock(20, { text: "About me" });
    repository.addBlock(21, { text: "I lead the team", parentId: 20 });
    aiInstructions.set(20);

    await draftExtractedTasks([1], noSignal());

    expect(requestText(chat.requests()[0])).toContain(
      "<user_instructions>\n- About me\n  - I lead the team\n</user_instructions>",
    );
  });

  it("goes on without instructions when the block does not exist", async () => {
    const { repository, chat, aiInstructions, draftExtractedTasks } = setup([
      propose({ items: [] }),
    ]);
    repository.addBlock(1, { text: "Meeting notes" });
    aiInstructions.set(99);

    const result = await draftOf(draftExtractedTasks([1], noSignal()));

    expect(result).toEqual({ kind: "nothing" });
    expect(requestText(chat.requests()[0])).not.toContain("user_instructions");
  });
});

describe("draft extracted tasks: the conversation", () => {
  const ask = (questions: unknown) =>
    callsReply({ name: "ask_questions", arguments: { questions } });

  it("offers ask_questions and propose_tasks first, and only propose_tasks after the answers", async () => {
    const { repository, chat, draftExtractedTasks } = setup([
      ask(["Is the fence yours to paint?"]),
      propose({ items: [{ title: "Paint the fence", quote: "Paint it" }] }),
    ]);
    repository.addBlock(1, { text: "Paint it" });

    const start = await draftExtractedTasks([1], noSignal());

    if (start.kind !== "questions") throw new Error("no questions");
    expect(start.questions).toEqual(["Is the fence yours to paint?"]);
    const result = await start.answer(["Yes"], noSignal());
    expect(result).toEqual({
      kind: "draft",
      items: [{ title: "Paint the fence", quote: "Paint it" }],
    });
    const [first, second] = chat.requests();
    expect(first?.tools).toEqual(["ask_questions", "propose_tasks"]);
    expect(second?.tools).toEqual(["propose_tasks"]);
    expect(toolResults(second).at(-1)?.content).toContain("Yes");
  });
});

describe("draft extracted tasks: the draft", () => {
  it("keeps valid dates and drops only the field whose date is not valid", async () => {
    const { repository, draftExtractedTasks } = setup([
      propose({
        items: [
          {
            title: "Send the report",
            quote: "Report by Friday",
            start: "2026-10-20",
            due: "2026-10-23",
          },
          {
            title: "Call Wang",
            quote: "Call Wang tomorrow-ish",
            start: "tomorrow",
            due: "2026-02-30",
          },
        ],
      }),
    ]);
    repository.addBlock(1, { text: "Notes" });

    const result = await draftOf(draftExtractedTasks([1], noSignal()));

    expect(result).toEqual({
      kind: "draft",
      items: [
        {
          title: "Send the report",
          quote: "Report by Friday",
          start: { year: 2026, month: 10, day: 20 },
          due: { year: 2026, month: 10, day: 23 },
        },
        { title: "Call Wang", quote: "Call Wang tomorrow-ish" },
      ],
    });
  });

  it("carries the quote and why the AI is unsure over as the AI gave them", async () => {
    const { repository, draftExtractedTasks } = setup([
      propose({
        items: [
          {
            title: "Follow up with Li",
            quote: "Li will look into it",
            uncertain: "It may be Li's to do, not yours",
          },
        ],
      }),
    ]);
    repository.addBlock(1, { text: "Li will look into it" });

    const result = await draftOf(draftExtractedTasks([1], noSignal()));

    expect(result).toEqual({
      kind: "draft",
      items: [
        {
          title: "Follow up with Li",
          quote: "Li will look into it",
          uncertain: "It may be Li's to do, not yours",
        },
      ],
    });
  });

  it("says there is nothing to extract when the AI gives no items", async () => {
    const { repository, draftExtractedTasks } = setup([propose({ items: [] })]);
    repository.addBlock(1, { text: "The sky was blue" });

    const result = await draftOf(draftExtractedTasks([1], noSignal()));

    expect(result).toEqual({ kind: "nothing" });
  });
});
