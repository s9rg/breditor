import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BreditorDomRenderer, type RenderedProjection } from "./dom_renderer.js";
import {
  issueEditorDeliveryToken,
  rangeSelectionSync,
  type EditorDeliveryToken,
  type EditorSelectionSync,
} from "./editor_command.js";
import {
  translateKeyDown,
  type KeyboardSnapshot,
  type KeyboardTranslationPolicy,
} from "./keyboard.js";
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
    snapshot: { lineage: "keyboard-translation-tests", revision: "0" },
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
      Symbol("keyboard-test-authority"),
    ),
    selection: rangeSelectionSync(selectionResult.value),
    rendered: renderedResult.value.rendered,
    renderer,
  };
});

afterAll(() => {
  fixture.renderer.release(fixture.rendered);
});

const BEFOREINPUT_POLICY: KeyboardTranslationPolicy = {
  editing: "beforeinputPrimary",
  primaryModifier: "control",
  shortcuts: "enabled",
};

const FALLBACK_POLICY: KeyboardTranslationPolicy = {
  editing: "structuralFallback",
  primaryModifier: "control",
  shortcuts: "enabled",
};

function keyboard(
  key: string,
  overrides: Partial<Omit<KeyboardSnapshot, "key">> = {},
): KeyboardSnapshot {
  return {
    key,
    code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
    keyCode: 0,
    altGraph: false,
    ...overrides,
  };
}

function translate(
  value: KeyboardSnapshot,
  policy: KeyboardTranslationPolicy = BEFOREINPUT_POLICY,
  compositionActive = false,
) {
  return translateKeyDown(
    value,
    policy,
    compositionActive,
    fixture.delivery,
    fixture.selection,
  );
}

function command(value: KeyboardSnapshot, policy: KeyboardTranslationPolicy) {
  const result = translate(value, policy);
  expect(result.kind).toBe("command");
  if (result.kind !== "command") throw new Error(`expected command, received ${result.kind}`);
  expect(result.request.delivery).toBe(fixture.delivery);
  expect(result.request.selection.kind).toBe("range");
  expect(result.request.requirements.selection).toBe("synchronize");
  return result.request;
}

describe("translateKeyDown", () => {
  it.each([
    ["controller state", keyboard("a"), true],
    ["event state", keyboard("a", { isComposing: true }), false],
    ["legacy IME 229", keyboard("a", { keyCode: 229 }), false],
    ["Dead key", keyboard("Dead"), false],
    ["Process key", keyboard("Process"), false],
  ] as const)("keeps %s out of direct command delivery", (_name, event, active) => {
    expect(translate(event, BEFOREINPUT_POLICY, active)).toEqual({ kind: "composition" });
  });

  it("does not interpret AltGraph as a primary editing shortcut", () => {
    expect(
      translate(keyboard("b", { ctrlKey: true, altKey: true, altGraph: true })),
    ).toEqual({ kind: "native", reason: "selectionOrPageCommand" });
  });

  it.each(["c", "C", "x", "X", "v", "V"])(
    "leaves primary-%s to the clipboard owner",
    (key) => {
      expect(translate(keyboard(key, { ctrlKey: true }))).toEqual({
        kind: "native",
        reason: "clipboardOwns",
      });
    },
  );

  it("leaves select-all native and blocks unsupported editing shortcuts", () => {
    expect(translate(keyboard("a", { ctrlKey: true }))).toEqual({
      kind: "native",
      reason: "selectionOrPageCommand",
    });
    expect(translate(keyboard("i", { ctrlKey: true }))).toEqual({
      kind: "blocked",
      reason: "unsupportedEditingShortcut",
    });
    expect(translate(keyboard("u", { ctrlKey: true }))).toEqual({
      kind: "blocked",
      reason: "unsupportedEditingShortcut",
    });
  });

  it("maps enabled bold and history shortcuts with exact history boundaries", () => {
    const bold = command(keyboard("b", { ctrlKey: true }), BEFOREINPUT_POLICY);
    expect(bold.command).toEqual({
      kind: "action",
      actionId: "breditor/toggle-strong",
      input: { kind: "none" },
    });
    expect(bold.requirements.history).toBe("closeBefore");
    expect(bold.source).toEqual({ kind: "keyboard", detail: "Ctrl+KeyB" });

    expect(command(keyboard("z", { ctrlKey: true }), BEFOREINPUT_POLICY).command).toEqual({
      kind: "history",
      operation: "undo",
    });
    expect(
      command(
        keyboard("z", { ctrlKey: true, shiftKey: true }),
        BEFOREINPUT_POLICY,
      ).command,
    ).toEqual({ kind: "history", operation: "redo" });
    expect(command(keyboard("y", { ctrlKey: true }), BEFOREINPUT_POLICY).command).toEqual({
      kind: "history",
      operation: "redo",
    });
  });

  it("uses only the host-selected primary modifier", () => {
    const metaPolicy: KeyboardTranslationPolicy = {
      ...BEFOREINPUT_POLICY,
      primaryModifier: "meta",
    };
    expect(command(keyboard("b", { metaKey: true }), metaPolicy).command).toMatchObject({
      actionId: "breditor/toggle-strong",
    });
    expect(translate(keyboard("b", { ctrlKey: true }), metaPolicy)).toEqual({
      kind: "native",
      reason: "beforeinputOwns",
    });
    expect(translate(keyboard("b", { ctrlKey: true, metaKey: true }), metaPolicy)).toEqual({
      kind: "native",
      reason: "beforeinputOwns",
    });
  });

  it.each(["b", "z", "y", "i", "u"])(
    "blocks primary-%s when editor shortcuts are disabled",
    (key) => {
    expect(
      translate(keyboard(key, { ctrlKey: true }), {
        ...BEFOREINPUT_POLICY,
        shortcuts: "disabled",
      }),
    ).toEqual({ kind: "blocked", reason: "unsupportedEditingShortcut" });
    },
  );

  it("suppresses repeating bold commands", () => {
    expect(translate(keyboard("b", { ctrlKey: true, repeat: true }))).toEqual({
      kind: "blocked",
      reason: "repeatSuppressed",
    });
  });

  it.each([
    ["Backspace", "breditor/delete-backward", "preserve"],
    ["Delete", "breditor/delete-forward", "preserve"],
    ["Enter", "breditor/insert-paragraph-break", "closeBefore"],
  ] as const)("maps structural fallback %s without deriving text", (key, actionId, history) => {
    const request = command(keyboard(key), FALLBACK_POLICY);
    expect(request.command).toEqual({
      kind: "action",
      actionId,
      input: { kind: "none" },
    });
    expect(request.requirements.history).toBe(history);
  });

  it("does not claim structural keys in beforeinput-primary mode", () => {
    for (const key of ["Backspace", "Delete", "Enter"]) {
      expect(translate(keyboard(key))).toEqual({ kind: "native", reason: "beforeinputOwns" });
    }
  });

  it("blocks unsupported Shift+Enter and never turns key identity into inserted text", () => {
    expect(translate(keyboard("Enter", { shiftKey: true }), FALLBACK_POLICY)).toEqual({
      kind: "blocked",
      reason: "unsupportedLineBreak",
    });
    for (const key of ["a", "A", " ", "Unidentified", "😀"]) {
      const result = translate(keyboard(key), FALLBACK_POLICY);
      expect(result.kind).not.toBe("command");
      if (key.length === 1 || key === "Unidentified") {
        expect(result).toEqual({ kind: "blocked", reason: "textRequiresBeforeInput" });
      }
    }
  });

  it("leaves modified fallback keys and navigation keys native", () => {
    expect(translate(keyboard("Backspace", { altKey: true }), FALLBACK_POLICY)).toEqual({
      kind: "native",
      reason: "selectionOrPageCommand",
    });
    expect(translate(keyboard("ArrowLeft"), FALLBACK_POLICY)).toEqual({
      kind: "native",
      reason: "selectionOrPageCommand",
    });
  });

  it("is total for hostile snapshots and policies without invoking accessors", () => {
    const valid = keyboard("b", { ctrlKey: true });
    let getterReads = 0;
    const accessor = Object.defineProperties({}, {
      ...Object.fromEntries(
        Object.entries(valid)
          .filter(([key]) => key !== "key")
          .map(([key, value]) => [key, { enumerable: true, value }]),
      ),
      key: {
        enumerable: true,
        get() {
          getterReads += 1;
          throw new Error("must not read browser getter");
        },
      },
    });
    const hostileProxy = new Proxy({}, {
      ownKeys() {
        throw new Error("hostile ownKeys");
      },
    });
    const malformedSnapshots: readonly unknown[] = [
      null,
      accessor,
      hostileProxy,
      { ...valid, extra: true },
      keyboard("x".repeat(129)),
      { ...valid, keyCode: 1.5 },
      { ...valid, altGraph: "false" },
    ];
    for (const value of malformedSnapshots) {
      expect(() =>
        translateKeyDown(
          value as KeyboardSnapshot,
          BEFOREINPUT_POLICY,
          false,
          fixture.delivery,
          fixture.selection,
        ),
      ).not.toThrow();
      expect(
        translateKeyDown(
          value as KeyboardSnapshot,
          BEFOREINPUT_POLICY,
          false,
          fixture.delivery,
          fixture.selection,
        ),
      ).toEqual({ kind: "invalid" });
    }

    const policyAccessor = Object.defineProperties({}, {
      editing: { enumerable: true, value: "beforeinputPrimary" },
      primaryModifier: { enumerable: true, value: "control" },
      shortcuts: {
        enumerable: true,
        get() {
          getterReads += 1;
          throw new Error("must not read policy getter");
        },
      },
    });
    expect(
      translateKeyDown(
        valid,
        policyAccessor as KeyboardTranslationPolicy,
        false,
        fixture.delivery,
        fixture.selection,
      ),
    ).toEqual({ kind: "invalid" });
    expect(
      translateKeyDown(
        valid,
        { ...BEFOREINPUT_POLICY, extra: true } as KeyboardTranslationPolicy,
        false,
        fixture.delivery,
        fixture.selection,
      ),
    ).toEqual({ kind: "invalid" });
    expect(getterReads).toBe(0);
  });
});
