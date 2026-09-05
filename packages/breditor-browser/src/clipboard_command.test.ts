import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as clipboardCommands from "./clipboard_command.js";
import { cutDeleteRequest, pasteInsertRequest } from "./clipboard_command.js";
import { BreditorDomRenderer, type RenderedProjection } from "./dom_renderer.js";
import {
  MAX_BROWSER_COMMAND_TEXT_UTF16,
  isEditorCommandRequest,
  isEngineCommand,
  issueEditorDeliveryToken,
  rangeSelectionSync,
  type EditorDeliveryToken,
  type EditorSelectionSync,
} from "./editor_command.js";
import { BaseDocumentProjection } from "./projection.js";
import { BaseRangeSelection } from "./selection.js";

interface CommandFixture {
  readonly delivery: EditorDeliveryToken;
  readonly selection: EditorSelectionSync;
  readonly rendered: RenderedProjection;
  readonly renderer: BreditorDomRenderer;
}

let fixture: CommandFixture;

beforeAll(() => {
  const projectionResult = BaseDocumentProjection.create({
    schema: { name: "breditor/base", version: 1 },
    snapshot: { lineage: "clipboard-command-tests", revision: "0" },
    paragraphs: [{ runs: [] }],
  });
  if (!projectionResult.ok) throw new Error("projection fixture failed");

  const renderer = new BreditorDomRenderer();
  const renderedResult = renderer.render(document.createElement("div"), projectionResult.value);
  if (!renderedResult.ok) throw new Error("render fixture failed");

  const selectionResult = BaseRangeSelection.create(projectionResult.value, {
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
  if (!selectionResult.ok) throw new Error("selection fixture failed");

  fixture = {
    delivery: issueEditorDeliveryToken(
      projectionResult.value,
      renderedResult.value.rendered,
      0n,
      Symbol("clipboard-test-authority"),
    ),
    selection: rangeSelectionSync(selectionResult.value),
    rendered: renderedResult.value.rendered,
    renderer,
  };
});

afterAll(() => {
  fixture.renderer.release(fixture.rendered);
});

describe("clipboard engine command factories", () => {
  it("creates only the exact post-write cut deletion", () => {
    const request = cutDeleteRequest(fixture.delivery, fixture.selection);

    expect(request.delivery).toBe(fixture.delivery);
    expect(request.selection.kind).toBe("range");
    expect(request.source).toEqual({ kind: "clipboard", detail: "cut" });
    expect(request.requirements).toEqual({
      selection: "synchronize",
      history: "closeBefore",
    });
    expect(request.command).toEqual({
      kind: "action",
      actionId: "breditor/delete-selection",
      input: { kind: "none" },
    });
    expect(Reflect.ownKeys(request)).toEqual([
      "delivery",
      "selection",
      "source",
      "requirements",
      "command",
    ]);
    expect(Reflect.ownKeys(request.command)).toEqual(["kind", "actionId", "input"]);
    expect(isEngineCommand(request.command)).toBe(true);
    expect(isEditorCommandRequest(request)).toBe(true);
    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(request.command)).toBe(true);
    expect(request).not.toHaveProperty("event");
    expect(request).not.toHaveProperty("clipboardData");
  });

  it("preserves admitted plain text exactly in one paste insertion", () => {
    const text = "first\r\nsecond 😀";
    const request = pasteInsertRequest(fixture.delivery, fixture.selection, text);

    expect(request.delivery).toBe(fixture.delivery);
    expect(request.source).toEqual({ kind: "clipboard", detail: "paste" });
    expect(request.requirements).toEqual({
      selection: "synchronize",
      history: "closeBefore",
    });
    expect(request.command).toEqual({
      kind: "action",
      actionId: "breditor/insert-plain-text",
      input: { kind: "string", value: text },
    });
    expect(Reflect.ownKeys(request.command)).toEqual(["kind", "actionId", "input"]);
    expect(isEngineCommand(request.command)).toBe(true);
    expect(isEditorCommandRequest(request)).toBe(true);
    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(request.command)).toBe(true);
    expect(request).not.toHaveProperty("event");
    expect(request).not.toHaveProperty("clipboardData");
  });

  it.each([
    ["empty", ""],
    ["unpaired surrogate", "\ud800"],
    ["oversized", "x".repeat(MAX_BROWSER_COMMAND_TEXT_UTF16 + 1)],
  ])("rejects %s paste text before constructing a request", (_label, pastedText) => {
    expect(() =>
      pasteInsertRequest(fixture.delivery, fixture.selection, pastedText),
    ).toThrow(RangeError);
  });

  it("rejects forged delivery tokens and accessor-backed selections", () => {
    const forgedDelivery = { ...fixture.delivery } as unknown as EditorDeliveryToken;
    expect(() => cutDeleteRequest(forgedDelivery, fixture.selection)).toThrow(TypeError);

    let reads = 0;
    const hostileSelection = Object.defineProperties({}, {
      kind: { enumerable: true, value: "range" },
      selection: {
        enumerable: true,
        get() {
          reads += 1;
          return fixture.selection.kind === "range" ? fixture.selection.selection : undefined;
        },
      },
    }) as unknown as EditorSelectionSync;
    expect(() => cutDeleteRequest(fixture.delivery, hostileSelection)).toThrow(TypeError);
    expect(reads).toBe(0);
  });

  it("exposes no request factory for copy and no staged translation API", () => {
    expect("copyRequest" in clipboardCommands).toBe(false);
    expect("translateClipboardCommand" in clipboardCommands).toBe(false);
  });
});
