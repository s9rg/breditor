import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BreditorDomRenderer, type RenderedProjection } from "./dom_renderer.js";
import {
  MAX_BROWSER_COMMAND_TEXT_UTF16,
  issueEditorDeliveryToken,
  rangeSelectionSync,
  type EditorDeliveryToken,
  type EditorSelectionSync,
} from "./editor_command.js";
import { BaseDocumentProjection } from "./projection.js";
import { BaseRangeSelection } from "./selection.js";
import {
  translateBeforeInput,
  type BeforeInputSnapshot,
  type BeforeInputTranslation,
} from "./beforeinput.js";

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
    snapshot: { lineage: "beforeinput-translation-tests", revision: "0" },
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
      Symbol("beforeinput-test-authority"),
    ),
    selection: rangeSelectionSync(selectionResult.value),
    rendered: renderedResult.value.rendered,
    renderer,
  };
});

afterAll(() => {
  fixture.renderer.release(fixture.rendered);
});

function snapshot(
  inputType: string,
  data: string | null = null,
  isComposing = false,
): BeforeInputSnapshot {
  return { inputType, data, isComposing };
}

function translate(
  value: BeforeInputSnapshot,
  compositionActive = false,
): BeforeInputTranslation {
  return translateBeforeInput(
    value,
    compositionActive,
    fixture.delivery,
    fixture.selection,
  );
}

function command(value: BeforeInputSnapshot) {
  const result = translate(value);
  expect(result.kind).toBe("command");
  if (result.kind !== "command") throw new Error(`expected command, received ${result.kind}`);
  expect(result.request.delivery).toBe(fixture.delivery);
  expect(result.request.selection.kind).toBe("range");
  expect(result.request.requirements.selection).toBe("synchronize");
  return result.request;
}

describe("translateBeforeInput", () => {
  it.each([
    ["insertText", "breditor/insert-text", "string", "preserve"],
    ["insertReplacementText", "breditor/insert-text", "string", "preserve"],
    ["insertParagraph", "breditor/insert-paragraph-break", "none", "closeBefore"],
    ["deleteContentBackward", "breditor/delete-backward", "none", "preserve"],
    ["deleteContentForward", "breditor/delete-forward", "none", "preserve"],
    ["deleteContent", "breditor/delete-selection", "none", "closeBefore"],
    ["formatBold", "breditor/toggle-strong", "none", "closeBefore"],
  ] as const)(
    "maps the closed %s input to %s",
    (inputType, actionId, inputKind, history) => {
      const request = command(snapshot(inputType, inputKind === "string" ? "A" : null));
      expect(request.source).toEqual({ kind: "beforeinput", detail: inputType });
      expect(request.requirements.history).toBe(history);
      expect(request.command).toEqual(
        inputKind === "string"
          ? { kind: "action", actionId, input: { kind: "string", value: "A" } }
          : { kind: "action", actionId, input: { kind: "none" } },
      );
    },
  );

  it.each([
    ["historyUndo", "undo"],
    ["historyRedo", "redo"],
  ] as const)("maps %s to an exact history command", (inputType, operation) => {
    const request = command(snapshot(inputType));
    expect(request.source).toEqual({ kind: "beforeinput", detail: inputType });
    expect(request.requirements.history).toBe("closeBefore");
    expect(request.command).toEqual({ kind: "history", operation });
  });

  it.each([
    ["deleteByCut", "cut"],
    ["insertFromPaste", "paste"],
    ["insertFromPasteAsQuotation", "paste"],
  ] as const)("classifies %s only as a clipboard %s echo", (inputType, operation) => {
    expect(translate(snapshot(inputType))).toEqual({ kind: "clipboardEcho", operation });
  });

  it.each(["\n", "\r", "\r\n", "left\nright"])(
    "maps structural text %j to insert-plain-text and closes typing history",
    (data) => {
      const request = command(snapshot("insertText", data));
      expect(request.requirements.history).toBe("closeBefore");
      expect(request.command).toEqual({
        kind: "action",
        actionId: "breditor/insert-plain-text",
        input: { kind: "string", value: data },
      });
    },
  );

  it.each([
    ["insertCompositionText", "composition text"],
    ["deleteCompositionText", null],
    ["insertFromComposition", "committed composition"],
    ["deleteByComposition", null],
  ] as const)("keeps %s out of the direct command path", (inputType, data) => {
    expect(translate(snapshot(inputType, data))).toEqual({ kind: "composition" });
  });

  it("treats both event and controller composition state as authoritative", () => {
    expect(translate(snapshot("insertText", "x", true))).toEqual({ kind: "composition" });
    expect(translate(snapshot("deleteContentBackward"), true)).toEqual({
      kind: "composition",
    });
  });

  it.each(["insertLineBreak", "deleteWordBackward", "formatItalic", "unknownVendorEdit"])(
    "blocks unsupported input type %s instead of widening the protocol",
    (inputType) => {
      expect(translate(snapshot(inputType))).toEqual({
        kind: "blocked",
        reason: "unsupportedInputType",
      });
    },
  );

  it("accepts valid Unicode at both exact browser text ceilings", () => {
    const unicode = command(snapshot("insertText", "A😀é"));
    expect(unicode.command).toMatchObject({ input: { value: "A😀é" } });

    const utf16Boundary = "x".repeat(MAX_BROWSER_COMMAND_TEXT_UTF16);
    expect(command(snapshot("insertText", utf16Boundary)).command).toMatchObject({
      input: { value: utf16Boundary },
    });

    const utf8Boundary = "é".repeat(32_768);
    expect(command(snapshot("insertText", utf8Boundary)).command).toMatchObject({
      input: { value: utf8Boundary },
    });
  });

  it.each([
    ["empty", ""],
    ["null", null],
    ["UTF-16 overflow", "x".repeat(MAX_BROWSER_COMMAND_TEXT_UTF16 + 1)],
    ["UTF-8 overflow", "é".repeat(32_769)],
    ["lone high surrogate", "\ud800"],
    ["lone low surrogate", "\udc00"],
  ] as const)("blocks %s text before request construction", (_name, data) => {
    expect(translate(snapshot("insertText", data))).toEqual({
      kind: "blocked",
      reason: "invalidText",
    });
  });

  it("is total for accessor-backed, proxied, extra-field, and malformed snapshots", () => {
    let getterReads = 0;
    const accessor = Object.defineProperties({}, {
      inputType: {
        enumerable: true,
        get() {
          getterReads += 1;
          throw new Error("must not read browser getter");
        },
      },
      data: { enumerable: true, value: "x" },
      isComposing: { enumerable: true, value: false },
    });
    const hostileProxy = new Proxy({}, {
      ownKeys() {
        throw new Error("hostile ownKeys");
      },
    });
    const malformed: readonly unknown[] = [
      null,
      accessor,
      hostileProxy,
      { ...snapshot("insertText", "x"), extra: true },
      snapshot("x".repeat(257), null),
      { inputType: "insertText", data: 42, isComposing: false },
      { inputType: "insertText", data: "x", isComposing: "false" },
    ];

    for (const value of malformed) {
      expect(() =>
        translateBeforeInput(
          value as BeforeInputSnapshot,
          false,
          fixture.delivery,
          fixture.selection,
        ),
      ).not.toThrow();
      expect(
        translateBeforeInput(
          value as BeforeInputSnapshot,
          false,
          fixture.delivery,
          fixture.selection,
        ),
      ).toEqual({ kind: "invalid" });
    }
    expect(getterReads).toBe(0);
    expect(
      translateBeforeInput(
        snapshot("insertText", "x"),
        "false" as unknown as boolean,
        fixture.delivery,
        fixture.selection,
      ),
    ).toEqual({ kind: "invalid" });
  });
});
