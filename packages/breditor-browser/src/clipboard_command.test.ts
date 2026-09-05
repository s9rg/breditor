import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BreditorDomRenderer, type RenderedProjection } from "./dom_renderer.js";
import {
  issueEditorDeliveryToken,
  rangeSelectionSync,
  type EditorDeliveryToken,
  type EditorSelectionSync,
} from "./editor_command.js";
import { translateClipboardCommand, type ClipboardOperation } from "./clipboard_command.js";
import { BaseDocumentProjection } from "./projection.js";
import { BaseRangeSelection } from "./selection.js";

interface TranslationFixture {
  readonly delivery: EditorDeliveryToken;
  readonly selection: EditorSelectionSync;
  readonly rendered: RenderedProjection;
  readonly renderer: BreditorDomRenderer;
}

let fixture: TranslationFixture;

beforeAll(() => {
  const projectionResult = BaseDocumentProjection.create({
    schema: { name: "breditor/base", version: 1 },
    snapshot: { lineage: "clipboard-translation-tests", revision: "0" },
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

describe("translateClipboardCommand", () => {
  it.each([
    ["copy", "preserve"],
    ["cut", "closeBefore"],
    ["paste", "closeBefore"],
  ] as const)("creates only the staged %s request", (operation, history) => {
    const request = translateClipboardCommand(operation, fixture.delivery, fixture.selection);
    expect(request.delivery).toBe(fixture.delivery);
    expect(request.selection.kind).toBe("range");
    expect(request.source).toEqual({ kind: "clipboard", detail: operation });
    expect(request.requirements).toEqual({ selection: "synchronize", history });
    expect(request.command).toEqual({ kind: "clipboard", operation, stage: "request" });
    expect(Reflect.ownKeys(request.command)).toEqual(["kind", "operation", "stage"]);
    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(request.command)).toBe(true);
  });

  it("does not encode an eager deletion, action, payload, or browser object for cut", () => {
    const request = translateClipboardCommand("cut", fixture.delivery, fixture.selection);
    expect(request.command.kind).toBe("clipboard");
    expect(request.command).not.toHaveProperty("actionId");
    expect(request.command).not.toHaveProperty("input");
    expect(request.command).not.toHaveProperty("delete");
    expect(request.command).not.toHaveProperty("payload");
    expect(request.command).not.toHaveProperty("event");
    expect(request).not.toHaveProperty("clipboardData");
  });

  it("rejects operations outside the closed staged clipboard set", () => {
    expect(() =>
      translateClipboardCommand(
        "drop" as ClipboardOperation,
        fixture.delivery,
        fixture.selection,
      ),
    ).toThrow(TypeError);
  });
});
