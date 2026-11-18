import { describe, expect, it } from "vitest";
import { classifyPriority, type Impact, type Priority, type TicketType } from "../src/index";

interface Case {
  type: TicketType;
  impact: Impact;
  blocksWork: boolean;
  sameDayDeadline: boolean;
}

const cases: Array<[Case, Priority]> = [
  [{ type: "INC", impact: "team", blocksWork: true, sameDayDeadline: false }, "critica"],
  [{ type: "INC", impact: "company", blocksWork: true, sameDayDeadline: false }, "critica"],
  [{ type: "INC", impact: "individual", blocksWork: true, sameDayDeadline: false }, "alta"],
  [{ type: "INC", impact: "individual", blocksWork: false, sameDayDeadline: true }, "alta"],
  [{ type: "REQ", impact: "individual", blocksWork: false, sameDayDeadline: true }, "alta"],
  [{ type: "INC", impact: "team", blocksWork: false, sameDayDeadline: false }, "media"],
  [{ type: "REQ", impact: "individual", blocksWork: false, sameDayDeadline: false }, "baixa"],
];

describe("classifyPriority", () => {
  it.each(cases)("classifica %o como %s", (input, expected) => {
    const result = classifyPriority(input);
    expect(result.priority).toBe(expected);
    expect(result.reason.trim().length).toBeGreaterThan(0);
  });
});
