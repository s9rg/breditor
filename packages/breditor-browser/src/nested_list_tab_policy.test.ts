import {describe, expect, it} from "vitest";
import {nestedListTabCandidate, nestedListTabDecision} from "./nested_list_tab_policy.js";

const event = (overrides: KeyboardEventInit = {}) => new KeyboardEvent("keydown", {key: "Tab", code: "Tab", ...overrides});

describe("nested Tab policy", () => {
  it("names the exact profile-owned intents in each direction", () => {
    expect(nestedListTabCandidate(event(), true, false)).toEqual({stateId: "breditor/control-indent-list-items", intentId: "breditor/indent-list-items", repeat: false});
    expect(nestedListTabCandidate(event({shiftKey: true}), true, false)).toEqual({stateId: "breditor/control-outdent-list-items", intentId: "breditor/outdent-list-items", repeat: false});
  });
  it.each([
    {ctrlKey: true}, {metaKey: true}, {altKey: true}, {isComposing: true},
    {keyCode: 229}, {key: "Dead"}, {key: "Process"}, {key: "x"}, {code: "KeyX"},
  ])("leaves modified, composing and non-Tab keys native: %j", overrides => {
    expect(nestedListTabCandidate(event(overrides), true, false)).toBeUndefined();
  });
  it("honors host shortcut policy and authoritative composition phase", () => {
    expect(nestedListTabCandidate(event(), false, false)).toBeUndefined();
    expect(nestedListTabCandidate(event(), true, true)).toBeUndefined();
    expect(nestedListTabCandidate(null, true, false)).toBeUndefined();
  });
  it("does not execute from property shadows on another native key", () => {
    const key = event({key: "x", code: "KeyX"});
    Object.defineProperties(key, {key: {value: "Tab"}, code: {value: "Tab"}});
    expect(nestedListTabCandidate(key, true, false)).toBeUndefined();
  });
  it.each(["disabled", "blocked", "unhandled", "faulted", undefined] as const)("keeps focus navigation for %s", availability => {
    for (const repeat of [false, true]) {
      const candidate = nestedListTabCandidate(event({repeat}), true, false)!;
      expect(nestedListTabDecision(candidate, availability)).toBe("native");
    }
  });
  it("executes once and suppresses enabled repeats without another transaction", () => {
    expect(nestedListTabDecision(nestedListTabCandidate(event(), true, false)!, "enabled")).toBe("execute");
    expect(nestedListTabDecision(nestedListTabCandidate(event({repeat: true}), true, false)!, "enabled")).toBe("suppressRepeat");
  });
});
