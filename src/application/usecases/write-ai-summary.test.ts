import { describe, expect, it } from "vitest";
import { createFixedAiInstructions } from "../../../tests/fixed-ai-instructions";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import { createFixedStartPreviewDays } from "../../../tests/fixed-start-preview-days";
import { createInMemoryLastFullReview } from "../../../tests/in-memory-last-full-review";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import {
  createScriptedAiChat,
  requestText,
  type ScriptedAnswer,
  streamReply,
} from "../../../tests/scripted-ai-chat";
import { createReadUserInstructions } from "../ai/user-instructions";
import { AiCancelledError, AiRequestFailedError } from "../ports/ai-chat";
import { createReadReview } from "./read-review";
import { createWriteAiSummary } from "./write-ai-summary";

function setup(
  answers: readonly ScriptedAnswer[],
  lastFullReviewAt: string | null = "2026-10-09T20:00:00+08:00",
) {
  const repository = createInMemoryTaskRepository();
  const chat = createScriptedAiChat(answers);
  // Sunday October 18, 2026, 09:00 in UTC+8: the logical day October 18.
  const clock = createFixedClock("2026-10-18T09:00:00+08:00");
  const dayBoundary = createFixedDayBoundary();
  const aiInstructions = createFixedAiInstructions();
  const writeAiSummary = createWriteAiSummary({
    readReview: createReadReview({
      repository,
      clock,
      dayBoundary,
      startPreviewDays: createFixedStartPreviewDays(),
      lastFullReview: createInMemoryLastFullReview(lastFullReviewAt),
    }),
    chat,
    clock,
    dayBoundary,
    uiLanguage: () => "Simplified Chinese",
    userInstructions: createReadUserInstructions({
      repository,
      setting: aiInstructions,
      warn: () => {},
    }),
  });
  return { repository, chat, aiInstructions, writeAiSummary };
}

const noSignal = () => new AbortController().signal;

/** Every piece the summary gives, in order. */
async function pieces(stream: AsyncIterable<string>): Promise<string[]> {
  const read: string[] = [];
  for await (const piece of stream) read.push(piece);
  return read;
}

describe("write AI summary: the text", () => {
  it("gives the AI's text piece by piece as it comes", async () => {
    const { writeAiSummary } = setup([
      streamReply("This period ", "you finished ", "two tasks."),
    ]);

    expect(await pieces(writeAiSummary(noSignal()))).toEqual([
      "This period ",
      "you finished ",
      "two tasks.",
    ]);
  });
});

const october = (day: number) => ({ year: 2026, month: 10, day });
const recorded = (at: string, kind?: "skip") => ({
  at: new Date(`${at}+08:00`),
  day: october(Number(at.slice(8, 10))),
  ...(kind && { kind }),
});
const history = (...entries: ReturnType<typeof recorded>[]) => ({
  completionHistory: { kind: "readable" as const, history: entries },
});

describe("write AI summary: what the AI is given", () => {
  it("gives the completions and skips since the last full review, with their day and project", async () => {
    const { repository, chat, writeAiSummary } = setup([streamReply("ok")]);
    repository.addProject({ id: 1, text: "Move house", status: "active" });
    repository.addTask(
      { id: 2, text: "Book the movers", status: "done" },
      { parentId: 1, ...history(recorded("2026-10-12T10:00:00")) },
    );
    repository.addTask(
      { id: 3, text: "Water the plants", status: "todo" },
      history(recorded("2026-10-11T10:00:00", "skip")),
    );
    // Before the last full review: not given.
    repository.addTask(
      { id: 4, text: "File the taxes", status: "done" },
      history(recorded("2026-10-08T10:00:00")),
    );

    await pieces(writeAiSummary(noSignal()));

    const sent = requestText(chat.requests()[0]);
    expect(sent).toContain(
      "Done:\n- Book the movers (2026-10-12; project: Move house)\n",
    );
    expect(sent).toContain("Skipped:\n- Water the plants (2026-10-11)\n");
    expect(sent).not.toContain("File the taxes");
  });

  it("gives the tasks planned but not done and the tasks created since the last full review", async () => {
    const { repository, chat, writeAiSummary } = setup([streamReply("ok")]);
    const created = (at: string) => ({ created: new Date(`${at}+08:00`) });
    repository.addTask(
      { id: 1, text: "Call the bank", status: "todo" },
      { myDay: { kind: "readable", entries: [{ day: october(12) }] } },
    );
    repository.addTask({
      id: 2,
      text: "Buy a lamp",
      status: "inbox",
      ...created("2026-10-13T08:00:00"),
    });
    // Created before the last full review: not given as created.
    repository.addTask({
      id: 3,
      text: "Fix the shelf",
      status: "todo",
      ...created("2026-10-09T19:00:00"),
    });

    await pieces(writeAiSummary(noSignal()));

    const sent = requestText(chat.requests()[0]);
    expect(sent).toContain(
      "Added to My Day but still not done:\n- Call the bank\n",
    );
    expect(sent).toContain("Tasks created in this period:\n- Buy a lamp\n");
    expect(sent).toContain("covering 2026-10-09 20:00 to today");
  });

  it("gives the overdue tasks, those due in the next 7 days, the waiting ones, the projects with problems and the count due for review", async () => {
    const { repository, chat, writeAiSummary } = setup([streamReply("ok")]);
    const longAgo = new Date("2026-09-01T10:00:00+08:00");
    repository.addTask({
      id: 1,
      text: "Pay the rent",
      status: "todo",
      due: october(15),
    });
    repository.addTask({
      id: 2,
      text: "Renew the passport",
      status: "todo",
      due: october(22),
    });
    // Due after the next 7 days: not due soon.
    repository.addTask({
      id: 3,
      text: "Send the cards",
      status: "todo",
      due: october(30),
    });
    repository.addTask({ id: 4, text: "Hear from Li", status: "waiting" });
    // Active, no task, created long ago: no next action, no progress.
    repository.addProject({
      id: 5,
      text: "Learn Spanish",
      status: "active",
      created: longAgo,
    });
    repository.addTask({
      id: 6,
      text: "Check the smoke alarm",
      status: "todo",
      review: {
        kind: "plan",
        plan: { interval: null, lastReviewed: null, reviewOn: october(17) },
      },
    });

    await pieces(writeAiSummary(noSignal()));

    const sent = requestText(chat.requests()[0]);
    expect(sent).toContain("Overdue:\n- Pay the rent (due 2026-10-15)\n");
    expect(sent).toContain(
      "Due in the next 7 days:\n- Renew the passport (due 2026-10-22)\n",
    );
    expect(sent).not.toContain("Send the cards");
    expect(sent).toContain("Waiting:\n- Hear from Li\n");
    expect(sent).toContain(
      "Projects with problems:\n- Learn Spanish (no next action; no recent progress)\n",
    );
    expect(sent).toContain("Tasks due for review: 1\n");
  });

  it("says where look back starts 7 days ago when no full review was completed", async () => {
    const { chat, writeAiSummary } = setup([streamReply("ok")], null);

    await pieces(writeAiSummary(noSignal()));

    // The logical day October 11 starts at 05:00, the default day boundary.
    expect(requestText(chat.requests()[0])).toContain(
      "covering 2026-10-11 05:00 to today",
    );
  });

  it("gives the user's AI instructions when they are set", async () => {
    const { repository, chat, aiInstructions, writeAiSummary } = setup([
      streamReply("ok"),
    ]);
    repository.addBlock(50, { text: "Keep it to three sentences" });
    aiInstructions.set(50);

    await pieces(writeAiSummary(noSignal()));

    expect(requestText(chat.requests()[0])).toContain(
      "<user_instructions>\n- Keep it to three sentences\n</user_instructions>",
    );
  });
});

describe("write AI summary: when it does not come", () => {
  it("fails as the AI chat does when the AI gives no text", async () => {
    const { writeAiSummary } = setup(["fail"]);

    await expect(pieces(writeAiSummary(noSignal()))).rejects.toBeInstanceOf(
      AiRequestFailedError,
    );
  });

  it("stops with a cancellation once the user cancels, giving no more text", async () => {
    const controller = new AbortController();
    const { writeAiSummary } = setup([
      {
        stream: ["This period ", "you finished ", "two tasks."],
        after: { index: 0, run: () => controller.abort() },
      },
    ]);
    const read: string[] = [];

    await expect(
      (async () => {
        for await (const piece of writeAiSummary(controller.signal)) {
          read.push(piece);
        }
      })(),
    ).rejects.toBeInstanceOf(AiCancelledError);
    expect(read).toEqual(["This period "]);
  });
});
