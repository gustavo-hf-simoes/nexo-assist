import { describe, expect, it } from "vitest";
import { transition, type ConversationEvent } from "../../src/server/conversations/conversation-state";
import { InvalidTransitionError } from "../../src/server/conversations/errors";

const handoff: ConversationEvent = { type: "handoff", reason: "user_request", summary: "resumo" };
const assume: ConversationEvent = { type: "assume", analystId: "rafael.lima" };
const back: ConversationEvent = { type: "return_to_agent" };
const close: ConversationEvent = { type: "close" };

describe("transition", () => {
  it.each([
    ["agent", handoff, "waiting_analyst"],
    ["waiting_analyst", assume, "analyst"],
    ["analyst", back, "agent"],
    ["waiting_analyst", back, "agent"],
    ["agent", close, "closed"],
    ["waiting_analyst", close, "closed"],
    ["analyst", close, "closed"],
  ] as const)("%s + %s.type -> %s", (state, event, expected) => {
    expect(transition(state, event)).toBe(expected);
  });

  it.each([
    ["agent", assume],
    ["analyst", handoff],
    ["agent", back],
    ["closed", handoff],
    ["closed", assume],
    ["closed", back],
    ["closed", close],
  ] as const)("%s + %s.type lança InvalidTransitionError", (state, event) => {
    expect(() => transition(state, event)).toThrow(InvalidTransitionError);
  });
});
