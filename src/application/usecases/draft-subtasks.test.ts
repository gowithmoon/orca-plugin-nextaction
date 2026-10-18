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
  textReply,
  toolResults,
} from "../../../tests/scripted-ai-chat";
import { AiDraftFailedError } from "../ai/conversation";
import { createReadUserInstructions } from "../ai/user-instructions";
import { AiCancelledError, AiRequestFailedError } from "../ports/ai-chat";
import type { TaskRepository } from "../ports/task-repository";
import { createDraftSubtasks } from "./draft-subtasks";

function setup(
  answers: readonly ScriptedAnswer[],
  options: {
    /** Replaces how the instructions block is read, e.g. to fail. */
    readInstructionsOutline?: TaskRepository["readOutline"];
  } = {},
) {
  const repository = createInMemoryTaskRepository();
  const chat = createScriptedAiChat(answers);
  const clock = createFixedClock("2026-10-18T09:00:00+08:00");
  const aiInstructions = createFixedAiInstructions();
  const warnings: string[] = [];
  const draftSubtasks = createDraftSubtasks({
    repository,
    chat,
    clock,
    dayBoundary: createFixedDayBoundary(),
    uiLanguage: () => "Simplified Chinese",
    userInstructions: createReadUserInstructions({
      repository: {
        readOutline:
          options.readInstructionsOutline ??
          ((id) => repository.readOutline(id)),
      },
      setting: aiInstructions,
      warn: (message) => warnings.push(message),
    }),
  });
  return { repository, chat, clock, aiInstructions, warnings, draftSubtasks };
}

const propose = (args: unknown) =>
  callsReply({ name: "propose_subtasks", arguments: args });

const noSignal = () => new AbortController().signal;

describe("draft subtasks: what the AI is given", () => {
  it("gives the task, its content without the subtasks' own, its subtasks with their status, its parent task and its project with the goal", async () => {
    const { repository, chat, draftSubtasks } = setup([
      propose({ items: [{ title: "Book the movers" }] }),
    ]);
    repository.addProject({
      id: 1,
      text: "Move house",
      goal: "Settled in by November",
    });
    repository.addTask({ id: 2, text: "Prepare the move" }, { parentId: 1 });
    repository.addTask({ id: 3, text: "Pack" }, { parentId: 2 });
    repository.addBlock(4, { text: "Boxes are in the garage", parentId: 3 });
    repository.addBlock(5, { text: "Start with the books", parentId: 3 });
    repository.addBlock(6, { text: "Under the books", parentId: 5 });
    repository.addTask(
      { id: 7, text: "Find a flat", status: "done" },
      { parentId: 3 },
    );
    repository.addBlock(8, { text: "The flat has a lift", parentId: 7 });
    repository.addTask({ id: 9, text: "Sell the sofa" }, { parentId: 3 });

    await draftSubtasks(3, noSignal());

    const sent = requestText(chat.requests()[0]);
    expect(sent).toContain("Pack");
    expect(sent).toContain("- Boxes are in the garage");
    expect(sent).toContain("- Start with the books\n  - Under the books");
    expect(sent).not.toContain("The flat has a lift");
    expect(sent).toContain("Find a flat (done)");
    expect(sent).toContain("Sell the sofa (inbox)");
    expect(sent).toContain("Parent task: Prepare the move");
    expect(sent).toContain("Move house; goal: Settled in by November");
  });
});

describe("draft subtasks: a task with little around it", () => {
  it("says none for no content, no subtasks, no parent task and no project", async () => {
    const { repository, chat, draftSubtasks } = setup([
      propose({ items: [{ title: "Book the movers" }] }),
    ]);
    repository.addTask({ id: 1, text: "Move house" });

    await draftSubtasks(1, noSignal());

    const sent = requestText(chat.requests()[0]);
    expect(sent).toContain("Task content: none");
    expect(sent).toContain("Existing subtasks: none");
    expect(sent).toContain("Parent task: none");
    expect(sent).toContain("Project: none");
  });

  it("fails, asking nothing, when the block is not a task", async () => {
    const { repository, chat, draftSubtasks } = setup([]);
    repository.addBlock(1, { text: "Just a note" });

    await expect(draftSubtasks(1, noSignal())).rejects.toThrow();
    expect(chat.requests()).toHaveLength(0);
  });
});

describe("draft subtasks: the user's AI instructions", () => {
  it("gives the instructions block and every block below it as an outline", async () => {
    const { repository, chat, aiInstructions, warnings, draftSubtasks } = setup(
      [propose({ items: [{ title: "Book the movers" }] })],
    );
    repository.addTask({ id: 1, text: "Move house" });
    repository.addBlock(10, { text: "About me" });
    repository.addBlock(11, { text: "I work from home", parentId: 10 });
    repository.addBlock(12, { text: "Split into at most 5", parentId: 10 });
    repository.addBlock(13, { text: "Small steps", parentId: 12 });
    aiInstructions.set(10);

    await draftSubtasks(1, noSignal());

    expect(requestText(chat.requests()[0])).toContain(
      "<user_instructions>\n- About me\n  - I work from home\n  - Split into at most 5\n    - Small steps\n</user_instructions>",
    );
    expect(warnings).toEqual([]);
  });

  it("gives no instructions when the setting names no block", async () => {
    const { repository, chat, warnings, draftSubtasks } = setup([
      propose({ items: [{ title: "Book the movers" }] }),
    ]);
    repository.addTask({ id: 1, text: "Move house" });

    await draftSubtasks(1, noSignal());

    expect(requestText(chat.requests()[0])).not.toContain("user_instructions");
    expect(warnings).toEqual([]);
  });

  it("goes on without instructions when the block does not exist, warning once for it", async () => {
    const { repository, chat, aiInstructions, warnings, draftSubtasks } = setup(
      [
        propose({ items: [{ title: "Book the movers" }] }),
        propose({ items: [{ title: "Book the movers" }] }),
      ],
    );
    repository.addTask({ id: 1, text: "Move house" });
    aiInstructions.set(99);

    const first = await draftSubtasks(1, noSignal());
    await draftSubtasks(1, noSignal());

    expect(first.kind).toBe("draft");
    expect(chat.requests()).toHaveLength(2);
    for (const request of chat.requests()) {
      expect(requestText(request)).not.toContain("user_instructions");
    }
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("99");
  });

  it("goes on without instructions when the block cannot be read, warning once for it", async () => {
    const { repository, chat, aiInstructions, warnings, draftSubtasks } = setup(
      [
        propose({ items: [{ title: "Book the movers" }] }),
        propose({ items: [{ title: "Book the movers" }] }),
      ],
      {
        readInstructionsOutline: async () => {
          throw new Error("get-block-tree failed");
        },
      },
    );
    repository.addTask({ id: 1, text: "Move house" });
    aiInstructions.set(10);

    await draftSubtasks(1, noSignal());
    await draftSubtasks(1, noSignal());

    expect(chat.requests()).toHaveLength(2);
    for (const request of chat.requests()) {
      expect(requestText(request)).not.toContain("user_instructions");
    }
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("get-block-tree failed");
  });
});

describe("draft subtasks: today", () => {
  it("gives today as the logical day, with its weekday", async () => {
    const { repository, chat, clock, draftSubtasks } = setup([
      propose({ items: [{ title: "Book the movers" }] }),
    ]);
    repository.addTask({ id: 1, text: "Move house" });
    // Before the default day boundary (05:00): still Saturday the 17th.
    clock.set("2026-10-18T03:00:00+08:00");

    await draftSubtasks(1, noSignal());

    expect(requestText(chat.requests()[0])).toContain("2026-10-17 (Saturday)");
  });
});

describe("draft subtasks: the conversation", () => {
  const ask = (questions: unknown) =>
    callsReply({ name: "ask_questions", arguments: { questions } });

  it("offers ask_questions and propose_subtasks first, and only propose_subtasks after the answers", async () => {
    const { repository, chat, draftSubtasks } = setup([
      ask(["What counts as done?", "How fine?"]),
      propose({ items: [{ title: "Book the movers" }] }),
    ]);
    repository.addTask({ id: 1, text: "Move house" });

    const start = await draftSubtasks(1, noSignal());

    if (start.kind !== "questions") throw new Error("no questions");
    expect(start.questions).toEqual(["What counts as done?", "How fine?"]);
    const draft = await start.answer(["Keys handed over", ""], noSignal());
    expect(draft).toEqual({ items: [{ title: "Book the movers" }] });
    const [first, second] = chat.requests();
    expect(first?.tools).toEqual(["ask_questions", "propose_subtasks"]);
    expect(second?.tools).toEqual(["propose_subtasks"]);
    expect(toolResults(second).at(-1)?.content).toContain("Keys handed over");
  });

  it("tells the AI the user skipped, and asks for the draft with propose_subtasks only", async () => {
    const { repository, chat, draftSubtasks } = setup([
      ask(["How fine?"]),
      propose({ items: [{ title: "Book the movers" }] }),
    ]);
    repository.addTask({ id: 1, text: "Move house" });

    const start = await draftSubtasks(1, noSignal());
    if (start.kind !== "questions") throw new Error("no questions");
    await start.answer(null, noSignal());

    const second = chat.requests()[1];
    expect(second?.tools).toEqual(["propose_subtasks"]);
    expect(toolResults(second).at(-1)?.content).toContain("skipped");
  });

  it("answers a second ask_questions after the answers as not available", async () => {
    const { repository, chat, draftSubtasks } = setup([
      ask(["How fine?"]),
      ask(["One more?"]),
      propose({ items: [{ title: "Book the movers" }] }),
    ]);
    repository.addTask({ id: 1, text: "Move house" });

    const start = await draftSubtasks(1, noSignal());
    if (start.kind !== "questions") throw new Error("no questions");
    expect(await start.answer(["Coarse"], noSignal())).toEqual({
      items: [{ title: "Book the movers" }],
    });
    expect(toolResults(chat.requests()[2]).at(-1)?.content).toContain(
      "not available",
    );
  });

  it("gives the draft at once when the AI asks nothing", async () => {
    const { repository, chat, draftSubtasks } = setup([
      propose({ items: [{ title: "Book the movers" }] }),
    ]);
    repository.addTask({ id: 1, text: "Move house" });

    expect(await draftSubtasks(1, noSignal())).toEqual({
      kind: "draft",
      draft: { items: [{ title: "Book the movers" }] },
    });
    expect(chat.requests()).toHaveLength(1);
  });

  it("answers every call to a tool of Orca's as not available, then asks again", async () => {
    const { repository, chat, draftSubtasks } = setup([
      callsReply(
        { name: "read_skills", arguments: { blockIds: [1] } },
        { name: "parse_datetime", arguments: { text: "tomorrow" } },
      ),
      propose({ items: [{ title: "Book the movers" }] }),
    ]);
    repository.addTask({ id: 1, text: "Move house" });

    expect((await draftSubtasks(1, noSignal())).kind).toBe("draft");
    const results = toolResults(chat.requests()[1]);
    expect(results).toHaveLength(2);
    for (const result of results) {
      expect(result.content).toContain("not available");
    }
  });

  it("retries when the arguments do not hold, and when the AI answers in text only", async () => {
    const { repository, chat, draftSubtasks } = setup([
      propose({ items: [{ title: "  " }] }),
      textReply("Here are the subtasks: ..."),
      propose({ items: [{ title: "Book the movers" }] }),
    ]);
    repository.addTask({ id: 1, text: "Move house" });

    expect((await draftSubtasks(1, noSignal())).kind).toBe("draft");
    expect(chat.requests()).toHaveLength(3);
    expect(toolResults(chat.requests()[1]).at(-1)?.content).toContain(
      "not valid",
    );
  });

  it("fails after two retries, writing nothing", async () => {
    const { repository, chat, draftSubtasks } = setup([
      propose("{not json"),
      textReply("Sorry"),
      propose({ items: [] }),
    ]);
    repository.addTask({ id: 1, text: "Move house" });

    await expect(draftSubtasks(1, noSignal())).rejects.toBeInstanceOf(
      AiDraftFailedError,
    );
    expect(chat.requests()).toHaveLength(3);
    expect(repository.writeCount()).toBe(0);
  });

  it("passes on a request that got no reply, without retrying", async () => {
    const { repository, chat, draftSubtasks } = setup(["fail"]);
    repository.addTask({ id: 1, text: "Move house" });

    await expect(draftSubtasks(1, noSignal())).rejects.toBeInstanceOf(
      AiRequestFailedError,
    );
    expect(chat.requests()).toHaveLength(1);
  });

  it("drops a reply that comes after the user cancelled", async () => {
    const controller = new AbortController();
    const { repository, draftSubtasks } = setup([
      () => {
        controller.abort();
        return propose({ items: [{ title: "Book the movers" }] });
      },
    ]);
    repository.addTask({ id: 1, text: "Move house" });

    await expect(draftSubtasks(1, controller.signal)).rejects.toBeInstanceOf(
      AiCancelledError,
    );
  });
});

describe("draft subtasks: the draft", () => {
  it("carries uncertain and notSplittable over as the AI gave them", async () => {
    const { repository, draftSubtasks } = setup([
      propose({
        items: [{ title: "Book the movers", uncertain: "Maybe friends help" }],
        notSplittable: "Small enough already",
      }),
    ]);
    repository.addTask({ id: 1, text: "Move house" });

    expect(await draftSubtasks(1, noSignal())).toEqual({
      kind: "draft",
      draft: {
        items: [{ title: "Book the movers", uncertain: "Maybe friends help" }],
        notSplittable: "Small enough already",
      },
    });
  });

  it("takes no items with a reason as the task not to be split", async () => {
    const { repository, draftSubtasks } = setup([
      propose({ items: [], notSplittable: "One phone call" }),
    ]);
    repository.addTask({ id: 1, text: "Call the landlord" });

    expect(await draftSubtasks(1, noSignal())).toEqual({
      kind: "draft",
      draft: { items: [], notSplittable: "One phone call" },
    });
  });
});
