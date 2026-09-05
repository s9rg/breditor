import { describe, expect, it } from "vitest";

import { BaseDocumentProjection } from "./projection.js";
import { BreditorDomRenderer } from "./dom_renderer.js";
import { BaseRangeSelection } from "./selection.js";
import {
  MAX_BROWSER_COMMAND_TEXT_UTF16,
  browserCommandTextIsAdmissible,
  canonicalEditorCommandRequest,
  isEditorCommandRequest,
  issueEditorDeliveryToken,
  noInputActionRequest,
  rangeSelectionSync,
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
  return { token, selection: rangeSelectionSync(selection.value) };
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
