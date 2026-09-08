import { describe, expect, it } from "vitest";

import { BaseDocumentProjection } from "./projection.js";
import { BreditorDomRenderer } from "./dom_renderer.js";
import { BaseRangeSelection } from "./selection.js";
import {
  BASE_INTENT_IDS,
  MAX_BROWSER_COMMAND_TEXT_UTF16,
  browserCommandTextIsAdmissible,
  canonicalEditorCommandRequest,
  closeHistoryGroupRequest,
  isEditorCommandRequest,
  isEngineCommand,
  issueEditorDeliveryToken,
  noInputActionRequest,
  noInputIntentRequest,
  preserveSelectionSync,
  rangeSelectionSync,
  selectionSynchronizationRequest,
  stringActionRequest,
} from "./editor_command.js";

function delivery() {
  const projectionResult = BaseDocumentProjection.create({
    schema: { name: "breditor/base", version: 1 },
    snapshot: { lineage: "command-tests", revision: "0" },
    paragraphs: [{ runs: [] }],
  });
  if (!projectionResult.ok) throw new Error("projection fixture failed");
  const renderedResult = new BreditorDomRenderer().render(
    document.createElement("div"),
    projectionResult.value,
  );
  if (!renderedResult.ok) throw new Error("render fixture failed");
  const token = issueEditorDeliveryToken(
    projectionResult.value,
    renderedResult.value.rendered,
    0n,
    Symbol("test-authority"),
  );
  const selection = BaseRangeSelection.create(projectionResult.value, {
    kind: "range",
    anchor: {
      kind: "children",
      parentPath: [0],
      childIndex: 0,
      affinity: "after",
    },
    focus: {
      kind: "children",
      parentPath: [0],
      childIndex: 0,
      affinity: "after",
    },
  });
  if (!selection.ok) throw new Error("selection fixture failed");
  return {
    token,
    range: selection.value,
    selection: rangeSelectionSync(selection.value),
  };
}

describe("editor command contract", () => {
  it("admits exact bounded Unicode and rejects non-exact JS strings", () => {
    expect(browserCommandTextIsAdmissible("x".repeat(MAX_BROWSER_COMMAND_TEXT_UTF16))).toBe(true);
    expect(browserCommandTextIsAdmissible("x".repeat(MAX_BROWSER_COMMAND_TEXT_UTF16 + 1))).toBe(false);
    expect(browserCommandTextIsAdmissible("é".repeat(32_768))).toBe(true);
    expect(browserCommandTextIsAdmissible(`é${"x".repeat(65_535)}`)).toBe(false);
    expect(browserCommandTextIsAdmissible("😀")).toBe(true);
    expect(browserCommandTextIsAdmissible("\ud800")).toBe(false);
    expect(browserCommandTextIsAdmissible("\udc00")).toBe(false);
    expect(browserCommandTextIsAdmissible("")).toBe(false);
  });

  it("deeply freezes reusable action requests with exact delivery correlation", () => {
    const { token, selection } = delivery();
    const request = stringActionRequest(
      token,
      selection,
      { kind: "toolbar", detail: "bold-snippet" },
      "breditor/insert-text",
      "hello",
    );
    expect(request.delivery).toBe(token);
    expect(request.command).toEqual({
      kind: "action",
      actionId: "breditor/insert-text",
      input: { kind: "string", value: "hello" },
    });
    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(request.source)).toBe(true);
    expect(Object.isFrozen(request.requirements)).toBe(true);
    expect(Object.isFrozen(request.command)).toBe(true);
  });

  it("represents a closed no-input semantic intent with explicit queue policy", () => {
    const { token } = delivery();
    const request = noInputIntentRequest(
      token,
      preserveSelectionSync(),
      { kind: "toolbar", detail: "breditor/control-bold" },
      BASE_INTENT_IDS.formatStrong,
      "closeBefore",
    );

    expect(request).toMatchObject({
      delivery: token,
      selection: { kind: "preserve" },
      source: { kind: "toolbar", detail: "breditor/control-bold" },
      requirements: { selection: "preserve", history: "closeBefore" },
      command: {
        kind: "intent",
        intentId: "breditor/format-strong",
        input: { kind: "none" },
      },
    });
    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(request.command)).toBe(true);
    expect(
      request.command.kind === "intent" && Object.isFrozen(request.command.input),
    ).toBe(true);
    expect(isEngineCommand(request.command)).toBe(true);
    expect(canonicalEditorCommandRequest(request)).toEqual(request);
  });

  it("rejects malformed or widened semantic intent envelopes without getters", () => {
    const { token, selection } = delivery();
    const base = {
      delivery: token,
      selection,
      source: { kind: "api", detail: "intent-test" },
      requirements: { selection: "synchronize", history: "preserve" },
    };
    let reads = 0;
    const accessorInput = Object.defineProperty({}, "kind", {
      enumerable: true,
      get() {
        reads += 1;
        return "none";
      },
    });

    for (const command of [
      { kind: "intent", intentId: "missing-slash", input: { kind: "none" } },
      {
        kind: "intent",
        intentId: "example/format-mark",
        input: { kind: "none", value: "forbidden" },
      },
      {
        kind: "intent",
        intentId: "example/format-mark",
        input: accessorInput,
      },
      {
        kind: "intent",
        intentId: "example/format-mark",
        input: { kind: "string", value: "forbidden" },
      },
      {
        kind: "intent",
        intentId: "example/format-mark",
        input: { kind: "none" },
        actionId: "example/forged",
      },
    ]) {
      expect(isEngineCommand(command)).toBe(false);
      expect(canonicalEditorCommandRequest({ ...base, command })).toBeNull();
    }
    expect(reads).toBe(0);

    expect(() =>
      noInputIntentRequest(
        token,
        selection,
        { kind: "api", detail: "bad-intent" },
        "Example/format-mark",
      ),
    ).toThrow(/intent ID/u);
  });

  it("represents a history boundary as an explicit executable control command", () => {
    const { token, selection } = delivery();
    const request = closeHistoryGroupRequest(
      token,
      selection,
      { kind: "api", detail: "composition-cancelled" },
    );

    expect(request.requirements).toEqual({
      selection: "synchronize",
      history: "preserve",
    });
    expect(request.command).toEqual({
      kind: "control",
      operation: "closeHistoryGroup",
    });
    expect(isEngineCommand(request.command)).toBe(true);
    expect(canonicalEditorCommandRequest(request)).toEqual(request);
    expect(
      canonicalEditorCommandRequest({
        ...request,
        requirements: { selection: "synchronize", history: "closeBefore" },
      }),
    ).toBeNull();
  });

  it("distinguishes selection preservation from queue-routed synchronization", () => {
    const { token, range } = delivery();
    const preserved = noInputActionRequest(
      token,
      preserveSelectionSync(),
      { kind: "toolbar", detail: "bold" },
      "breditor/toggle-strong",
    );
    expect(preserved.selection).toEqual({ kind: "preserve" });
    expect(preserved.requirements).toEqual({
      selection: "preserve",
      history: "preserve",
    });
    expect(canonicalEditorCommandRequest(preserved)).toEqual(preserved);

    const synchronized = selectionSynchronizationRequest(
      token,
      range,
      { kind: "selectionchange", detail: "document-selection" },
    );
    expect(synchronized).toMatchObject({
      selection: { kind: "range", selection: range },
      source: { kind: "selectionchange", detail: "document-selection" },
      requirements: { selection: "synchronize", history: "preserve" },
      command: { kind: "selection", operation: "synchronize" },
    });
    expect(isEngineCommand(synchronized.command)).toBe(true);
    expect(canonicalEditorCommandRequest(synchronized)).toEqual(synchronized);
    expect(
      canonicalEditorCommandRequest({
        ...preserved,
        requirements: { selection: "synchronize", history: "preserve" },
      }),
    ).toBeNull();
    expect(
      canonicalEditorCommandRequest({
        ...synchronized,
        selection: preserveSelectionSync(),
        requirements: { selection: "preserve", history: "preserve" },
      }),
    ).toBeNull();
  });

  it.each([
    ["copy", "preserve"],
    ["cut", "closeBefore"],
    ["paste", "closeBefore"],
  ] as const)("rejects the removed staged clipboard %s shape at runtime", (operation, history) => {
    const { token, selection } = delivery();
    const staged = {
      delivery: token,
      selection,
      source: { kind: "clipboard", detail: operation },
      requirements: { selection: "synchronize", history },
      command: { kind: "clipboard", operation, stage: "request" },
    };

    expect(isEngineCommand(staged.command)).toBe(false);
    expect(isEditorCommandRequest(staged)).toBe(false);
    expect(canonicalEditorCommandRequest(staged)).toBeNull();
  });

  it("rejects staged clipboard accessors without invoking them", () => {
    const { token, selection } = delivery();
    let reads = 0;
    const command = Object.defineProperties({}, {
      kind: { enumerable: true, value: "clipboard" },
      operation: {
        enumerable: true,
        get() {
          reads += 1;
          return "cut";
        },
      },
      stage: { enumerable: true, value: "request" },
    });

    expect(
      canonicalEditorCommandRequest({
        delivery: token,
        selection,
        source: { kind: "clipboard", detail: "cut" },
        requirements: { selection: "synchronize", history: "closeBefore" },
        command,
      }),
    ).toBeNull();
    expect(reads).toBe(0);
  });

  it("makes public guards total and rejects accessors, proxies, and extra fields", () => {
    const { token, selection } = delivery();
    const valid = noInputActionRequest(
      token,
      selection,
      { kind: "api", detail: "test" },
      "breditor/delete-backward",
    );
    expect(isEditorCommandRequest(valid)).toBe(true);
    expect(canonicalEditorCommandRequest(valid)).not.toBe(valid);

    const accessor = {
      delivery: token,
      selection,
      get source() {
        throw new Error("must not invoke");
      },
      requirements: valid.requirements,
      command: valid.command,
    };
    expect(() => isEditorCommandRequest(accessor)).not.toThrow();
    expect(isEditorCommandRequest(accessor)).toBe(false);

    const proxy = new Proxy(valid, {
      ownKeys() {
        throw new Error("hostile proxy");
      },
    });
    expect(() => canonicalEditorCommandRequest(proxy)).not.toThrow();
    expect(canonicalEditorCommandRequest(proxy)).toBeNull();
    expect(isEditorCommandRequest({ ...valid, extra: true })).toBe(false);
  });

  it("snapshots factory sources once and rejects mutable accessors", () => {
    const { token, selection } = delivery();
    let reads = 0;
    const source = Object.defineProperties({}, {
      kind: { enumerable: true, value: "api" },
      detail: {
        enumerable: true,
        get() {
          reads += 1;
          return reads === 1 ? "first" : "second";
        },
      },
    });
    expect(() =>
      noInputActionRequest(
        token,
        selection,
        source as { kind: "api"; detail: string },
        "breditor/delete-forward",
      ),
    ).toThrow(TypeError);
    expect(reads).toBe(0);
  });
});
