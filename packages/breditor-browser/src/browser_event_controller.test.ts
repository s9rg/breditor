import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { BreditorBrowserEventController } from "./browser_event_controller.js";
import { BreditorCommandQueue } from "./command_queue.js";
import {
  BreditorDomRenderer,
  type RenderedProjection,
} from "./dom_renderer.js";
import { BreditorDomSelectionBridge } from "./dom_selection.js";
import {
  editorDeliveryTokenMatches,
  issueEditorDeliveryAuthority,
  issueEditorDeliveryToken,
  type EditorCommandRequest,
  type EditorDeliveryToken,
} from "./editor_command.js";
import { createKeyboardShortcutManifest } from "./keyboard_shortcut_manifest.js";
import {
  compileKeyboardShortcutManifest,
  type BrowserCompiledKeyboardShortcuts,
} from "./keyboard_shortcut_profile_contract.js";
import { BaseDocumentProjection } from "./projection.js";
import type { BrowserProjectionResult } from "./result.js";
import { BaseRangeSelection } from "./selection.js";
import type { BrowserSelectionResult } from "./selection_result.js";
import {
  consumeWasmCompiledProfileDescriptor,
  type WasmCompiledProfileDescriptorView,
  type WasmProfileGenerationView,
} from "./wasm_profile_descriptor.js";

interface Fixture {
  readonly host: HTMLElement;
  readonly rendered: RenderedProjection;
  readonly delivery: EditorDeliveryToken;
  readonly bridge: BreditorDomSelectionBridge;
}

const TEST_TOKEN_AUTHORITY = Symbol("browser-event-tests");
const TEST_TARGET_RANGES = new WeakMap<
  InputEvent,
  readonly AbstractRange[]
>();
const ORIGINAL_GET_TARGET_RANGES = Object.getOwnPropertyDescriptor(
  InputEvent.prototype,
  "getTargetRanges",
);
const TEST_DELIVERY_AUTHORITY = issueEditorDeliveryAuthority((token) => {
  try {
    const candidate = token as EditorDeliveryToken;
    return editorDeliveryTokenMatches(
      token,
      candidate.rendered,
      candidate.observationEpoch,
      TEST_TOKEN_AUTHORITY,
    );
  } catch {
    return false;
  }
});

beforeAll(() => {
  Object.defineProperty(InputEvent.prototype, "getTargetRanges", {
    configurable: true,
    value(this: InputEvent): readonly AbstractRange[] {
      return TEST_TARGET_RANGES.get(this) ?? Object.freeze([]);
    },
  });
});

afterAll(() => {
  if (ORIGINAL_GET_TARGET_RANGES === undefined) {
    Reflect.deleteProperty(InputEvent.prototype, "getTargetRanges");
  } else {
    Object.defineProperty(
      InputEvent.prototype,
      "getTargetRanges",
      ORIGINAL_GET_TARGET_RANGES,
    );
  }
});

beforeEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});

describe("BreditorBrowserEventController", () => {
  it("captures the exact shared-bridge range before admitting text", () => {
    const fixture = createFixture();
    const exact = selectionValue(
      BaseRangeSelection.create(fixture.rendered.projection, {
        kind: "range",
        anchor: textPoint(1, "before"),
        focus: textPoint(1, "after"),
      }),
    );
    expect(fixture.bridge.write(fixture.rendered, exact).ok).toBe(true);
    const delivered: EditorCommandRequest[] = [];
    const controller = createController(fixture.bridge, delivered);
    const event = inputEvent("beforeinput", "insertText", "x", []);

    const disposition = dispatch(fixture.host, event, (observed) =>
      controller.handleBeforeInput(
        observed as InputEvent,
        fixture.rendered,
        fixture.delivery,
      ),
    );

    expect(disposition.kind).toBe("handled");
    expect(event.defaultPrevented).toBe(true);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.selection).toEqual({ kind: "range", selection: exact });
    expect(
      delivered[0]?.selection.kind === "range"
        ? delivered[0].selection.selection
        : undefined,
    ).toBe(exact);
    expect(delivered[0]?.command).toEqual({
      kind: "action",
      actionId: "breditor/insert-text",
      input: { kind: "string", value: "x" },
    });
  });

  it("routes native formatRemove through the clear-inline-formatting intent", () => {
    const fixture = createFixture();
    installCollapsedDomSelection(fixture.host, 2);
    const delivered: EditorCommandRequest[] = [];
    const controller = createController(fixture.bridge, delivered);
    const event = inputEvent("beforeinput", "formatRemove", null, []);

    const disposition = dispatch(fixture.host, event, (observed) =>
      controller.handleBeforeInput(
        observed as InputEvent,
        fixture.rendered,
        fixture.delivery,
      ),
    );

    expect(disposition.kind).toBe("handled");
    expect(event.defaultPrevented).toBe(true);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.source).toEqual({
      kind: "beforeinput",
      detail: "formatRemove",
    });
    expect(delivered[0]?.requirements.history).toBe("closeBefore");
    expect(delivered[0]?.command).toEqual({
      kind: "intent",
      intentId: "breditor/clear-inline-formatting",
      input: { kind: "none" },
    });
  });

  it("executes a keyboard command once across keydown, beforeinput, and input", () => {
    const fixture = createFixture();
    installCollapsedDomSelection(fixture.host, 2);
    const delivered: EditorCommandRequest[] = [];
    const controller = createController(fixture.bridge, delivered);
    const keydown = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "b",
      code: "KeyB",
      ctrlKey: true,
    });

    const keyDisposition = dispatch(fixture.host, keydown, (observed) =>
      controller.handleKeyDown(
        observed as KeyboardEvent,
        fixture.rendered,
        fixture.delivery,
      ),
    );
    expect(keyDisposition.kind).toBe("handled");
    expect(keydown.defaultPrevented).toBe(true);

    const echoDelivery = issueEditorDeliveryToken(
      fixture.rendered.projection,
      fixture.rendered,
      1n,
      TEST_TOKEN_AUTHORITY,
    );
    const before = inputEvent("beforeinput", "formatBold", null, []);
    const beforeDisposition = dispatch(fixture.host, before, (observed) =>
      controller.handleBeforeInput(
        observed as InputEvent,
        fixture.rendered,
        echoDelivery,
      ),
    );
    expect(beforeDisposition).toMatchObject({
      kind: "keyboardEcho",
      defaultPrevented: true,
      inputType: "formatBold",
    });

    const input = inputEvent("input", "formatBold", null);
    const inputDisposition = dispatch(fixture.host, input, (observed) =>
      controller.handleInput(observed as InputEvent, fixture.rendered),
    );
    expect(inputDisposition).toEqual({
      kind: "inputPostcondition",
      expectedEcho: { kind: "keyboard", inputType: "formatBold" },
    });
    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.command).toMatchObject({
      kind: "intent",
      intentId: "breditor/format-strong",
    });
  });

  it("expires an unconsumed native keyboard echo at the task boundary", () => {
    const fixture = createFixture();
    installCollapsedDomSelection(fixture.host, 2);
    const delivered: EditorCommandRequest[] = [];
    const scheduled: Array<() => void> = [];
    const controller = new BreditorBrowserEventController(
      new BreditorCommandQueue((request) => {
        delivered.push(request);
        return request.source.detail;
      }),
      {
        keyboard: keyboardPolicy(),
        selectionBridge: fixture.bridge,
        deliveryAuthority: TEST_DELIVERY_AUTHORITY,
        scheduleTask: (callback) => {
          scheduled.push(callback);
        },
      },
    );
    const keydown = keyEvent("b", "KeyB", { ctrlKey: true });
    dispatch(fixture.host, keydown, (observed) =>
      controller.handleKeyDown(
        observed as KeyboardEvent,
        fixture.rendered,
        fixture.delivery,
      ),
    );
    expect(delivered).toHaveLength(1);
    expect(scheduled).toHaveLength(1);

    scheduled.shift()?.();
    const nextDelivery = issueEditorDeliveryToken(
      fixture.rendered.projection,
      fixture.rendered,
      1n,
      TEST_TOKEN_AUTHORITY,
    );
    const independent = inputEvent("beforeinput", "formatBold", null, []);
    const disposition = dispatch(fixture.host, independent, (observed) =>
      controller.handleBeforeInput(
        observed as InputEvent,
        fixture.rendered,
        nextDelivery,
      ),
    );

    expect(disposition.kind).toBe("handled");
    expect(disposition.kind).not.toBe("keyboardEcho");
    expect(delivered).toHaveLength(2);
  });

  it("expires a beforeinput-promoted keyboard receipt on its original task boundary", () => {
    const fixture = createFixture();
    installCollapsedDomSelection(fixture.host, 2);
    const delivered: EditorCommandRequest[] = [];
    const scheduled: Array<() => void> = [];
    const controller = new BreditorBrowserEventController(
      new BreditorCommandQueue((request) => {
        delivered.push(request);
        return request.source.detail;
      }),
      {
        keyboard: keyboardPolicy(),
        selectionBridge: fixture.bridge,
        deliveryAuthority: TEST_DELIVERY_AUTHORITY,
        scheduleTask: (callback) => {
          scheduled.push(callback);
        },
      },
    );
    dispatch(fixture.host, keyEvent("b", "KeyB", { ctrlKey: true }), (event) =>
      controller.handleKeyDown(
        event as KeyboardEvent,
        fixture.rendered,
        fixture.delivery,
      ),
    );
    const echoDelivery = issueEditorDeliveryToken(
      fixture.rendered.projection,
      fixture.rendered,
      1n,
      TEST_TOKEN_AUTHORITY,
    );
    const beforeDisposition = dispatch(
      fixture.host,
      inputEvent("beforeinput", "formatBold", null, []),
      (event) =>
        controller.handleBeforeInput(
          event as InputEvent,
          fixture.rendered,
          echoDelivery,
        ),
    );
    expect(beforeDisposition.kind).toBe("keyboardEcho");
    expect(scheduled).toHaveLength(1);

    scheduled.shift()?.();
    const inputDisposition = dispatch(
      fixture.host,
      inputEvent("input", "formatBold", null),
      (event) =>
        controller.handleInput(event as InputEvent, fixture.rendered),
    );

    expect(inputDisposition).toEqual({
      kind: "reconcileRequired",
      defaultPrevented: false,
      reason: "unexpectedInput",
    });
    expect(delivered).toHaveLength(1);
  });

  it.each([
    ["inline", (callback: () => void) => callback()],
    ["throwing", (_callback: () => void) => {
      throw new Error("scheduler failed");
    }],
    ["promise-returning", (_callback: () => void) =>
      Promise.reject(new Error("scheduler contract violation"))],
  ])("fails safe when the echo-expiry scheduler is %s", (_name, scheduleTask) => {
    const fixture = createFixture();
    installCollapsedDomSelection(fixture.host, 2);
    const delivered: EditorCommandRequest[] = [];
    const controller = new BreditorBrowserEventController(
      new BreditorCommandQueue((request) => {
        delivered.push(request);
        return request.source.detail;
      }),
      {
        keyboard: keyboardPolicy(),
        selectionBridge: fixture.bridge,
        deliveryAuthority: TEST_DELIVERY_AUTHORITY,
        scheduleTask,
      },
    );
    dispatch(fixture.host, keyEvent("b", "KeyB", { ctrlKey: true }), (event) =>
      controller.handleKeyDown(
        event as KeyboardEvent,
        fixture.rendered,
        fixture.delivery,
      ),
    );
    const nextDelivery = issueEditorDeliveryToken(
      fixture.rendered.projection,
      fixture.rendered,
      1n,
      TEST_TOKEN_AUTHORITY,
    );
    const disposition = dispatch(
      fixture.host,
      inputEvent("beforeinput", "formatBold", null, []),
      (event) =>
        controller.handleBeforeInput(
          event as InputEvent,
          fixture.rendered,
          nextDelivery,
        ),
    );

    expect(disposition.kind).toBe("handled");
    expect(delivered).toHaveLength(2);
  });

  it("routes an owned custom shortcut and suppresses repeated intent work", () => {
    const fixture = createFixture();
    installCollapsedDomSelection(fixture.host, 2);
    const delivered: EditorCommandRequest[] = [];
    const controller = new BreditorBrowserEventController(
      new BreditorCommandQueue((request) => {
        delivered.push(request);
        return request.source.detail;
      }),
      {
        keyboard: keyboardPolicy(),
        keyboardShortcuts: customKeyboardShortcuts(),
        selectionBridge: fixture.bridge,
        deliveryAuthority: TEST_DELIVERY_AUTHORITY,
      },
    );
    const first = keyEvent("i", "KeyI", { ctrlKey: true });
    const firstDisposition = dispatch(fixture.host, first, (observed) =>
      controller.handleKeyDown(
        observed as KeyboardEvent,
        fixture.rendered,
        fixture.delivery,
      ),
    );

    expect(firstDisposition.kind).toBe("handled");
    expect(first.defaultPrevented).toBe(true);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.requirements.history).toBe("closeBefore");
    expect(delivered[0]?.command).toEqual({
      kind: "intent",
      intentId: "example/format-emphasis",
      input: { kind: "none" },
    });

    const repeated = keyEvent("i", "KeyI", {
      ctrlKey: true,
      repeat: true,
    });
    const repeatDisposition = dispatch(fixture.host, repeated, (observed) =>
      controller.handleKeyDown(
        observed as KeyboardEvent,
        fixture.rendered,
        fixture.delivery,
      ),
    );
    expect(repeatDisposition).toMatchObject({
      kind: "blocked",
      reason: "repeatSuppressed",
    });
    expect(repeated.defaultPrevented).toBe(true);
    expect(delivered).toHaveLength(1);
  });

  it("blocks a custom non-native chord when shortcut routing is disabled", () => {
    const fixture = createFixture();
    installCollapsedDomSelection(fixture.host, 2);
    const delivered: EditorCommandRequest[] = [];
    const controller = new BreditorBrowserEventController(
      new BreditorCommandQueue((request) => {
        delivered.push(request);
        return request.source.detail;
      }),
      {
        keyboard: { ...keyboardPolicy(), shortcuts: "disabled" },
        keyboardShortcuts: customKeyboardShortcuts(),
        selectionBridge: fixture.bridge,
        deliveryAuthority: TEST_DELIVERY_AUTHORITY,
      },
    );
    const event = keyEvent("i", "KeyI", { ctrlKey: true });

    const disposition = dispatch(fixture.host, event, (observed) =>
      controller.handleKeyDown(
        observed as KeyboardEvent,
        fixture.rendered,
        fixture.delivery,
      ),
    );

    expect(disposition).toMatchObject({
      kind: "blocked",
      reason: "unsupportedEditingShortcut",
    });
    expect(event.defaultPrevented).toBe(true);
    expect(delivered).toHaveLength(0);
  });

  it("routes physical shortcuts independently of logical keys and ignores missing codes", () => {
    const fixture = createFixture();
    installCollapsedDomSelection(fixture.host, 2);
    const delivered: EditorCommandRequest[] = [];
    const controller = createController(fixture.bridge, delivered);
    const bold = keyEvent("Unidentified", "KeyB", { ctrlKey: true });

    const boldDisposition = dispatch(fixture.host, bold, (observed) =>
      controller.handleKeyDown(
        observed as KeyboardEvent,
        fixture.rendered,
        fixture.delivery,
      ),
    );

    expect(boldDisposition.kind).toBe("handled");
    expect(bold.defaultPrevented).toBe(true);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.command).toEqual({
      kind: "intent",
      intentId: "breditor/format-strong",
      input: { kind: "none" },
    });

    const unrelated = keyEvent("q", "", { ctrlKey: true });
    const unrelatedDisposition = dispatch(
      fixture.host,
      unrelated,
      (observed) =>
        controller.handleKeyDown(
          observed as KeyboardEvent,
          fixture.rendered,
          fixture.delivery,
        ),
    );
    expect(unrelatedDisposition).toEqual({
      kind: "ignored",
      defaultPrevented: false,
      reason: "selectionOrPageCommand",
    });
    expect(unrelated.defaultPrevented).toBe(false);
    expect(delivered).toHaveLength(1);
  });

  it("does not arm a native Bold echo for a non-native alias of the Bold state", () => {
    const fixture = createFixture();
    installCollapsedDomSelection(fixture.host, 2);
    const delivered: EditorCommandRequest[] = [];
    const controller = new BreditorBrowserEventController(
      new BreditorCommandQueue((request) => {
        delivered.push(request);
        return request.source.detail;
      }),
      {
        keyboard: keyboardPolicy(),
        keyboardShortcuts: customKeyboardShortcuts({
          stateId: "breditor/control-bold",
          intentId: "breditor/format-strong",
          chords: [
            { code: "KeyB", shift: false },
            { code: "KeyI", shift: false },
          ],
        }),
        selectionBridge: fixture.bridge,
        deliveryAuthority: TEST_DELIVERY_AUTHORITY,
      },
    );
    const alias = keyEvent("i", "KeyI", { ctrlKey: true });
    const aliasDisposition = dispatch(fixture.host, alias, (observed) =>
      controller.handleKeyDown(
        observed as KeyboardEvent,
        fixture.rendered,
        fixture.delivery,
      ),
    );

    expect(aliasDisposition.kind).toBe("handled");
    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.command).toMatchObject({
      kind: "intent",
      intentId: "breditor/format-strong",
    });

    const nextDelivery = issueEditorDeliveryToken(
      fixture.rendered.projection,
      fixture.rendered,
      1n,
      TEST_TOKEN_AUTHORITY,
    );
    const independent = inputEvent("beforeinput", "formatBold", null, []);
    const independentDisposition = dispatch(
      fixture.host,
      independent,
      (observed) =>
        controller.handleBeforeInput(
          observed as InputEvent,
          fixture.rendered,
          nextDelivery,
        ),
    );

    expect(independentDisposition.kind).toBe("handled");
    expect(independentDisposition.kind).not.toBe("keyboardEcho");
    expect(delivered).toHaveLength(2);
    expect(delivered[1]?.source).toEqual({
      kind: "beforeinput",
      detail: "formatBold",
    });
  });

  it("does not arm a native Undo echo for an arbitrary history alias", () => {
    const fixture = createFixture();
    installCollapsedDomSelection(fixture.host, 2);
    const delivered: EditorCommandRequest[] = [];
    const controller = new BreditorBrowserEventController(
      new BreditorCommandQueue((request) => {
        delivered.push(request);
        return request.source.detail;
      }),
      {
        keyboard: keyboardPolicy(),
        keyboardShortcuts: customKeyboardShortcuts({
          stateId: "example/control-undo",
          historyDirection: "undo",
          chords: [{ code: "KeyR", shift: false }],
        }),
        selectionBridge: fixture.bridge,
        deliveryAuthority: TEST_DELIVERY_AUTHORITY,
      },
    );
    const alias = keyEvent("r", "KeyR", { ctrlKey: true });
    dispatch(fixture.host, alias, (observed) =>
      controller.handleKeyDown(
        observed as KeyboardEvent,
        fixture.rendered,
        fixture.delivery,
      ),
    );
    expect(delivered[0]?.command).toEqual({
      kind: "history",
      operation: "undo",
    });

    const nextDelivery = issueEditorDeliveryToken(
      fixture.rendered.projection,
      fixture.rendered,
      1n,
      TEST_TOKEN_AUTHORITY,
    );
    const independent = inputEvent("beforeinput", "historyUndo", null, []);
    const disposition = dispatch(fixture.host, independent, (observed) =>
      controller.handleBeforeInput(
        observed as InputEvent,
        fixture.rendered,
        nextDelivery,
      ),
    );

    expect(disposition.kind).toBe("handled");
    expect(disposition.kind).not.toBe("keyboardEcho");
    expect(delivered).toHaveLength(2);
    expect(delivered[1]?.source).toEqual({
      kind: "beforeinput",
      detail: "historyUndo",
    });
  });

  it("does not treat Meta+Y as a native Redo echo", () => {
    const fixture = createFixture();
    installCollapsedDomSelection(fixture.host, 2);
    const delivered: EditorCommandRequest[] = [];
    const controller = new BreditorBrowserEventController(
      new BreditorCommandQueue((request) => {
        delivered.push(request);
        return request.source.detail;
      }),
      {
        keyboard: {
          editing: "structuralFallback",
          primaryModifier: "meta",
          shortcuts: "enabled",
        },
        selectionBridge: fixture.bridge,
        deliveryAuthority: TEST_DELIVERY_AUTHORITY,
      },
    );
    const alias = keyEvent("y", "KeyY", { metaKey: true });
    dispatch(fixture.host, alias, (observed) =>
      controller.handleKeyDown(
        observed as KeyboardEvent,
        fixture.rendered,
        fixture.delivery,
      ),
    );
    expect(delivered[0]?.command).toEqual({
      kind: "history",
      operation: "redo",
    });

    const nextDelivery = issueEditorDeliveryToken(
      fixture.rendered.projection,
      fixture.rendered,
      1n,
      TEST_TOKEN_AUTHORITY,
    );
    const independent = inputEvent("beforeinput", "historyRedo", null, []);
    const disposition = dispatch(fixture.host, independent, (observed) =>
      controller.handleBeforeInput(
        observed as InputEvent,
        fixture.rendered,
        nextDelivery,
      ),
    );

    expect(disposition.kind).toBe("handled");
    expect(disposition.kind).not.toBe("keyboardEcho");
    expect(delivered).toHaveLength(2);
    expect(delivered[1]?.source).toEqual({
      kind: "beforeinput",
      detail: "historyRedo",
    });
  });

  it("rejects a forged compiled shortcut table at construction", () => {
    const fixture = createFixture();
    expect(() =>
      new BreditorBrowserEventController(
        new BreditorCommandQueue(() => "unused"),
        {
          keyboard: keyboardPolicy(),
          keyboardShortcuts: Object.freeze({
            manifest: Object.freeze({ shortcuts: Object.freeze([]) }),
            profileDescriptor: undefined,
            bindings: Object.freeze([]),
          }) as unknown as BrowserCompiledKeyboardShortcuts,
          selectionBridge: fixture.bridge,
          deliveryAuthority: TEST_DELIVERY_AUTHORITY,
        },
      )
    ).toThrow(/options are invalid/u);
  });

  it("leaves a foreign-token event untouched without consuming a keyboard receipt", () => {
    const fixture = createFixture();
    installCollapsedDomSelection(fixture.host, 2);
    const delivered: EditorCommandRequest[] = [];
    const controller = createController(fixture.bridge, delivered);
    const keydown = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "b",
      code: "KeyB",
      ctrlKey: true,
    });
    dispatch(fixture.host, keydown, (observed) =>
      controller.handleKeyDown(
        observed as KeyboardEvent,
        fixture.rendered,
        fixture.delivery,
      ),
    );

    const foreign = issueEditorDeliveryToken(
      fixture.rendered.projection,
      fixture.rendered,
      1n,
      Symbol("foreign-adapter"),
    );
    const forgedEcho = inputEvent("beforeinput", "formatBold", null, []);
    expect(
      dispatch(fixture.host, forgedEcho, (observed) =>
        controller.handleBeforeInput(
          observed as InputEvent,
          fixture.rendered,
          foreign,
        ),
      ),
    ).toEqual({
      kind: "reconcileRequired",
      defaultPrevented: false,
      reason: "deliveryRejected",
    });
    expect(forgedEcho.defaultPrevented).toBe(false);

    const legitimate = issueEditorDeliveryToken(
      fixture.rendered.projection,
      fixture.rendered,
      1n,
      TEST_TOKEN_AUTHORITY,
    );
    const legitimateEcho = inputEvent("beforeinput", "formatBold", null, []);
    expect(
      dispatch(fixture.host, legitimateEcho, (observed) =>
        controller.handleBeforeInput(
          observed as InputEvent,
          fixture.rendered,
          legitimate,
        ),
      ).kind,
    ).toBe("keyboardEcho");
    expect(delivered).toHaveLength(1);
  });

  it("does not admit or cancel events for a disconnected render host", () => {
    const fixture = createFixture();
    installCollapsedDomSelection(fixture.host, 2);
    const delivered: EditorCommandRequest[] = [];
    const controller = createController(fixture.bridge, delivered);
    fixture.host.remove();
    const event = inputEvent("beforeinput", "insertText", "x", []);

    expect(
      dispatch(fixture.host, event, (observed) =>
        controller.handleBeforeInput(
          observed as InputEvent,
          fixture.rendered,
          fixture.delivery,
        ),
      ),
    ).toEqual({
      kind: "ignored",
      defaultPrevented: false,
      reason: "outsideHost",
    });
    expect(event.defaultPrevented).toBe(false);
    expect(delivered).toHaveLength(0);
  });

  it("rejects an unbound or stale keyboard echo after another delivery/render", () => {
    const fixture = createFixture();
    installCollapsedDomSelection(fixture.host, 2);
    const delivered: EditorCommandRequest[] = [];
    const controller = createController(fixture.bridge, delivered);
    const keydown = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "b",
      code: "KeyB",
      ctrlKey: true,
    });
    dispatch(fixture.host, keydown, (observed) =>
      controller.handleKeyDown(
        observed as KeyboardEvent,
        fixture.rendered,
        fixture.delivery,
      ),
    );

    const directInput = inputEvent("input", "formatBold", null);
    expect(
      dispatch(fixture.host, directInput, (observed) =>
        controller.handleInput(observed as InputEvent, fixture.rendered),
      ),
    ).toEqual({
      kind: "reconcileRequired",
      defaultPrevented: false,
      reason: "unexpectedInput",
    });

    const nextKeydown = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "b",
      code: "KeyB",
      ctrlKey: true,
    });
    const nextDelivery = issueEditorDeliveryToken(
      fixture.rendered.projection,
      fixture.rendered,
      1n,
      TEST_TOKEN_AUTHORITY,
    );
    dispatch(fixture.host, nextKeydown, (observed) =>
      controller.handleKeyDown(
        observed as KeyboardEvent,
        fixture.rendered,
        nextDelivery,
      ),
    );
    const intervenedDelivery = issueEditorDeliveryToken(
      fixture.rendered.projection,
      fixture.rendered,
      3n,
      TEST_TOKEN_AUTHORITY,
    );
    const staleBeforeInput = inputEvent("beforeinput", "formatBold", null, []);
    expect(
      dispatch(fixture.host, staleBeforeInput, (observed) =>
        controller.handleBeforeInput(
          observed as InputEvent,
          fixture.rendered,
          intervenedDelivery,
        ),
      ).kind,
    ).toBe("handled");

    const exactEchoDelivery = issueEditorDeliveryToken(
      fixture.rendered.projection,
      fixture.rendered,
      4n,
      TEST_TOKEN_AUTHORITY,
    );
    const thirdKeydown = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "b",
      code: "KeyB",
      ctrlKey: true,
    });
    dispatch(fixture.host, thirdKeydown, (observed) =>
      controller.handleKeyDown(
        observed as KeyboardEvent,
        fixture.rendered,
        exactEchoDelivery,
      ),
    );
    const exactBeforeInputDelivery = issueEditorDeliveryToken(
      fixture.rendered.projection,
      fixture.rendered,
      5n,
      TEST_TOKEN_AUTHORITY,
    );
    const exactBeforeInput = inputEvent("beforeinput", "formatBold", null, []);
    expect(
      dispatch(fixture.host, exactBeforeInput, (observed) =>
        controller.handleBeforeInput(
          observed as InputEvent,
          fixture.rendered,
          exactBeforeInputDelivery,
        ),
      ).kind,
    ).toBe("keyboardEcho");

    const replacementRenderer = new BreditorDomRenderer();
    const replacement = projectionValue(
      replacementRenderer.render(fixture.host, fixture.rendered.projection),
    ).rendered;
    const staleInput = inputEvent("input", "formatBold", null);
    expect(
      dispatch(fixture.host, staleInput, (observed) =>
        controller.handleInput(observed as InputEvent, replacement),
      ),
    ).toEqual({
      kind: "reconcileRequired",
      defaultPrevented: false,
      reason: "unexpectedInput",
    });
    expect(delivered).toHaveLength(4);
  });

  it("does not coalesce two independent beforeinput commands", () => {
    const fixture = createFixture();
    installCollapsedDomSelection(fixture.host, 2);
    const delivered: EditorCommandRequest[] = [];
    const controller = createController(fixture.bridge, delivered);

    for (const value of ["a", "b"]) {
      const event = inputEvent("beforeinput", "insertText", value, []);
      const disposition = dispatch(fixture.host, event, (observed) =>
        controller.handleBeforeInput(
          observed as InputEvent,
          fixture.rendered,
          fixture.delivery,
        ),
      );
      expect(disposition.kind).toBe("handled");
    }

    expect(delivered.map((request) =>
      request.command.kind === "action" && request.command.input.kind === "string"
        ? request.command.input.value
        : "",
    )).toEqual(["a", "b"]);
  });

  it("delegates clipboard beforeinput and input to the clipboard owner", () => {
    const fixture = createFixture();
    installDomSelection(fixture.host, 1, 4);
    const delivered: EditorCommandRequest[] = [];
    const controller = createController(fixture.bridge, delivered);

    const before = inputEvent("beforeinput", "deleteByCut", null, []);
    expect(
      dispatch(fixture.host, before, (observed) =>
        controller.handleBeforeInput(
          observed as InputEvent,
          fixture.rendered,
          fixture.delivery,
        ),
      ),
    ).toEqual({
      kind: "ignored",
      defaultPrevented: false,
      reason: "clipboardOwns",
    });
    expect(before.defaultPrevented).toBe(false);

    const input = inputEvent("input", "deleteByCut", null);
    expect(
      dispatch(fixture.host, input, (observed) =>
        controller.handleInput(observed as InputEvent, fixture.rendered),
      ),
    ).toEqual({
      kind: "ignored",
      defaultPrevented: false,
      reason: "clipboardOwns",
    });
    expect(delivered).toHaveLength(0);
  });

  it("delegates paste beforeinput without inspecting target ranges", () => {
    const fixture = createFixture();
    installCollapsedDomSelection(fixture.host, 1);
    const delivered: EditorCommandRequest[] = [];
    const controller = createController(fixture.bridge, delivered);
    const event = inputEvent("beforeinput", "insertFromPaste", null, []);

    const disposition = dispatch(fixture.host, event, (observed) =>
      controller.handleBeforeInput(
        observed as InputEvent,
        fixture.rendered,
        fixture.delivery,
      ),
    );
    expect(disposition).toEqual({
      kind: "ignored",
      defaultPrevented: false,
      reason: "clipboardOwns",
    });
    expect(event.defaultPrevented).toBe(false);
    expect(delivered).toHaveLength(0);
  });

  it("requires replacement target ranges to equal the captured selection", () => {
    const fixture = createFixture();
    installCollapsedDomSelection(fixture.host, 2);
    const delivered: EditorCommandRequest[] = [];
    const controller = createController(fixture.bridge, delivered);
    const text = canonicalText(fixture.host);
    const target = new StaticRange({
      startContainer: text,
      startOffset: 0,
      endContainer: text,
      endOffset: 4,
    });
    const event = inputEvent(
      "beforeinput",
      "insertReplacementText",
      "word",
      [target],
    );

    const disposition = dispatch(fixture.host, event, (observed) =>
      controller.handleBeforeInput(
        observed as InputEvent,
        fixture.rendered,
        fixture.delivery,
      ),
    );
    expect(disposition).toEqual({
      kind: "blocked",
      defaultPrevented: true,
      reason: "targetRangeMismatch",
    });
    expect(delivered).toHaveLength(0);
  });

  it("accepts Chromium's collapsed insert target before controlled trailing spaces", () => {
    const fixture = createFixture("text  ");
    installCollapsedDomSelection(fixture.host, 6);
    const delivered: EditorCommandRequest[] = [];
    const controller = createController(fixture.bridge, delivered);
    const text = canonicalText(fixture.host);
    const target = new StaticRange({
      startContainer: text,
      startOffset: 4,
      endContainer: text,
      endOffset: 4,
    });
    const event = inputEvent("beforeinput", "insertText", "x", [target]);

    const disposition = dispatch(fixture.host, event, (observed) =>
      controller.handleBeforeInput(
        observed as InputEvent,
        fixture.rendered,
        fixture.delivery,
      ),
    );

    expect(disposition.kind).toBe("handled");
    expect(event.defaultPrevented).toBe(true);
    expect(delivered).toHaveLength(1);
    expect(
      delivered[0]?.selection.kind === "range"
        ? delivered[0].selection.selection.anchor
        : undefined,
    ).toEqual(textPoint(6, "before"));
    expect(delivered[0]?.command).toEqual({
      kind: "action",
      actionId: "breditor/insert-text",
      input: { kind: "string", value: "x" },
    });
  });

  it.each([
    {
      name: "replacement input",
      text: "text  ",
      inputType: "insertReplacementText",
      selectionRun: 0,
      selectionStart: 6,
      selectionEnd: 6,
      targetRun: 0,
      targetStart: 4,
      targetEnd: 4,
    },
    {
      name: "noncollapsed captured selection",
      text: "text  ",
      inputType: "insertText",
      selectionRun: 0,
      selectionStart: 4,
      selectionEnd: 6,
      targetRun: 0,
      targetStart: 4,
      targetEnd: 4,
    },
    {
      name: "noncollapsed target range",
      text: "text  ",
      inputType: "insertText",
      selectionRun: 0,
      selectionStart: 6,
      selectionEnd: 6,
      targetRun: 0,
      targetStart: 4,
      targetEnd: 6,
    },
    {
      name: "different run path",
      text: "  ",
      followingText: "  ",
      inputType: "insertText",
      selectionRun: 1,
      selectionStart: 2,
      selectionEnd: 2,
      targetRun: 0,
      targetStart: 0,
      targetEnd: 0,
    },
    {
      name: "nonterminal formatted run",
      text: "text  ",
      followingText: "tail",
      inputType: "insertText",
      selectionRun: 0,
      selectionStart: 6,
      selectionEnd: 6,
      targetRun: 0,
      targetStart: 4,
      targetEnd: 4,
    },
    {
      name: "selection before run end",
      text: "text  tail",
      inputType: "insertText",
      selectionRun: 0,
      selectionStart: 6,
      selectionEnd: 6,
      targetRun: 0,
      targetStart: 4,
      targetEnd: 4,
    },
    {
      name: "target after selection",
      text: "text   ",
      inputType: "insertText",
      selectionRun: 0,
      selectionStart: 5,
      selectionEnd: 5,
      targetRun: 0,
      targetStart: 6,
      targetEnd: 6,
    },
    {
      name: "non-U+0020 whitespace gap",
      text: "text\u00a0",
      inputType: "insertText",
      selectionRun: 0,
      selectionStart: 5,
      selectionEnd: 5,
      targetRun: 0,
      targetStart: 4,
      targetEnd: 4,
    },
    {
      name: "semantic-content gap",
      text: "text x",
      inputType: "insertText",
      selectionRun: 0,
      selectionStart: 6,
      selectionEnd: 6,
      targetRun: 0,
      targetStart: 4,
      targetEnd: 4,
    },
  ])("rejects a near-match with $name", (testCase) => {
    const fixture = createFixture(testCase.text, testCase.followingText);
    installDomSelectionInText(
      fixture.host,
      testCase.selectionRun,
      testCase.selectionStart,
      testCase.selectionEnd,
    );
    const delivered: EditorCommandRequest[] = [];
    const controller = createController(fixture.bridge, delivered);
    const targetText = canonicalTextAt(fixture.host, testCase.targetRun);
    const target = new StaticRange({
      startContainer: targetText,
      startOffset: testCase.targetStart,
      endContainer: targetText,
      endOffset: testCase.targetEnd,
    });
    const event = inputEvent(
      "beforeinput",
      testCase.inputType,
      "x",
      [target],
    );

    expect(
      dispatch(fixture.host, event, (observed) =>
        controller.handleBeforeInput(
          observed as InputEvent,
          fixture.rendered,
          fixture.delivery,
        ),
      ),
    ).toEqual({
      kind: "blocked",
      defaultPrevented: true,
      reason: "targetRangeMismatch",
    });
    expect(delivered).toHaveLength(0);
  });

  it("does not read or copy attacker-sized multiple target ranges", () => {
    const fixture = createFixture();
    installCollapsedDomSelection(fixture.host, 2);
    const controller = createController(fixture.bridge, []);
    let firstRangeReads = 0;
    const ranges: AbstractRange[] = [];
    Object.defineProperty(ranges, "0", {
      configurable: true,
      get() {
        firstRangeReads += 1;
        throw new Error("must not read a rejected range");
      },
    });
    Object.defineProperty(ranges, "length", { value: 2 });
    const event = inputEvent("beforeinput", "insertText", "x", ranges);

    const disposition = dispatch(fixture.host, event, (observed) =>
      controller.handleBeforeInput(
        observed as InputEvent,
        fixture.rendered,
        fixture.delivery,
      ),
    );
    expect(disposition).toMatchObject({ kind: "blocked", reason: "targetRangeCount" });
    expect(firstRangeReads).toBe(0);
  });

  it("never executes a noncancelable mutation and marks reconciliation", () => {
    const fixture = createFixture();
    installCollapsedDomSelection(fixture.host, 2);
    const delivered: EditorCommandRequest[] = [];
    const controller = createController(fixture.bridge, delivered);
    const event = inputEvent("beforeinput", "insertText", "x", [], false);

    const disposition = dispatch(fixture.host, event, (observed) =>
      controller.handleBeforeInput(
        observed as InputEvent,
        fixture.rendered,
        fixture.delivery,
      ),
    );
    expect(disposition).toEqual({
      kind: "reconcileRequired",
      defaultPrevented: false,
      reason: "noncancelableMutation",
    });
    expect(delivered).toHaveLength(0);
  });

  it("leaves composition-owned input native and blocks unsupported mutations", () => {
    const fixture = createFixture();
    installCollapsedDomSelection(fixture.host, 2);
    const delivered: EditorCommandRequest[] = [];
    const controller = createController(fixture.bridge, delivered);
    const composition = inputEvent(
      "beforeinput",
      "insertCompositionText",
      "文",
      [],
    );
    expect(
      dispatch(fixture.host, composition, (observed) =>
        controller.handleBeforeInput(
          observed as InputEvent,
          fixture.rendered,
          fixture.delivery,
        ),
      ),
    ).toEqual({ kind: "compositionPending", defaultPrevented: false });
    expect(composition.defaultPrevented).toBe(false);

    const unsupported = inputEvent("beforeinput", "deleteWordBackward", null, []);
    expect(
      dispatch(fixture.host, unsupported, (observed) =>
        controller.handleBeforeInput(
          observed as InputEvent,
          fixture.rendered,
          fixture.delivery,
        ),
      ),
    ).toEqual({
      kind: "blocked",
      defaultPrevented: true,
      reason: "unsupportedInputType",
    });
    expect(delivered).toHaveLength(0);
  });

  it("ignores nested controls and fails closed when no range is available", () => {
    const fixture = createFixture();
    const delivered: EditorCommandRequest[] = [];
    const controller = createController(fixture.bridge, delivered);
    const button = document.createElement("button");
    fixture.host.append(button);
    const nested = inputEvent("beforeinput", "insertText", "x", []);
    expect(
      dispatch(button, nested, (observed) =>
        controller.handleBeforeInput(
          observed as InputEvent,
          fixture.rendered,
          fixture.delivery,
        ),
      ),
    ).toMatchObject({ kind: "ignored", reason: "nestedControl" });

    const fresh = createFixture();
    const secondController = createController(fresh.bridge, delivered);
    window.getSelection()?.removeAllRanges();
    const noSelection = inputEvent("beforeinput", "insertText", "x", []);
    expect(
      dispatch(fresh.host, noSelection, (observed) =>
        secondController.handleBeforeInput(
          observed as InputEvent,
          fresh.rendered,
          fresh.delivery,
        ),
      ),
    ).toMatchObject({ kind: "blocked", reason: "selectionUnavailable" });
    expect(delivered).toHaveLength(0);
  });

  it("turns queue uncertainty and hostile event access into controlled results", () => {
    const fixture = createFixture();
    installCollapsedDomSelection(fixture.host, 2);
    const queue = new BreditorCommandQueue<never>(() => {
      throw new Error("unknown publication point");
    });
    const controller = new BreditorBrowserEventController(queue, {
      keyboard: keyboardPolicy(),
      selectionBridge: fixture.bridge,
      deliveryAuthority: TEST_DELIVERY_AUTHORITY,
    });
    const event = inputEvent("beforeinput", "insertText", "x", []);
    expect(
      dispatch(fixture.host, event, (observed) =>
        controller.handleBeforeInput(
          observed as InputEvent,
          fixture.rendered,
          fixture.delivery,
        ),
      ),
    ).toEqual({
      kind: "reconcileRequired",
      defaultPrevented: true,
      reason: "queueFailure",
    });

    const hostile = Object.defineProperty({}, "type", {
      get() {
        throw new Error("hostile getter");
      },
    });
    expect(() =>
      controller.handleBeforeInput(
        hostile as InputEvent,
        fixture.rendered,
        fixture.delivery,
      ),
    ).not.toThrow();
    expect(
      controller.handleBeforeInput(
        hostile as InputEvent,
        fixture.rendered,
        fixture.delivery,
      ),
    ).toEqual({
      kind: "reconcileRequired",
      defaultPrevented: false,
      reason: "eventAccessFailed",
    });
  });

  it("uses native InputEvent facts and cancellation below own and local shadows", () => {
    for (const placement of ["own", "prototype"] as const) {
      const fixture = createFixture();
      installCollapsedDomSelection(fixture.host, 2);
      const delivered: EditorCommandRequest[] = [];
      const controller = createController(fixture.bridge, delivered);
      const event = inputEvent("beforeinput", "insertText", "x", []);
      const outside = document.createElement("button");
      document.body.append(outside);
      const shadow = installEventShadows(
        event,
        {
          type: "input",
          target: outside,
          cancelable: false,
          defaultPrevented: true,
          inputType: "deleteWordBackward",
          data: "attacker",
          isComposing: true,
        },
        {
          getTargetRanges: () => Object.freeze([{}, {}]),
          preventDefault: () => undefined,
        },
        placement,
      );

      let disposition;
      try {
        disposition = dispatchAs(
          fixture.host,
          "beforeinput",
          event,
          (observed) =>
            controller.handleBeforeInput(
              observed as InputEvent,
              fixture.rendered,
              fixture.delivery,
            ),
        );
      } finally {
        shadow.restore();
      }

      expect(disposition?.kind).toBe("handled");
      expect(shadow.accessCount()).toBe(0);
      expect(event.defaultPrevented).toBe(true);
      expect(delivered).toHaveLength(1);
      expect(delivered[0]?.command).toEqual({
        kind: "action",
        actionId: "breditor/insert-text",
        input: { kind: "string", value: "x" },
      });
    }
  });

  it("uses native KeyboardEvent fields below own and local shadows", () => {
    for (const placement of ["own", "prototype"] as const) {
      const fixture = createFixture();
      installCollapsedDomSelection(fixture.host, 2);
      const delivered: EditorCommandRequest[] = [];
      const controller = createController(fixture.bridge, delivered);
      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "b",
        code: "KeyB",
        ctrlKey: true,
      });
      const outside = document.createElement("button");
      document.body.append(outside);
      const shadow = installEventShadows(
        event,
        {
          type: "input",
          target: outside,
          cancelable: false,
          defaultPrevented: true,
          key: "x",
          code: "KeyX",
          altKey: true,
          ctrlKey: false,
          metaKey: true,
          shiftKey: true,
          repeat: true,
          isComposing: true,
          keyCode: 229,
        },
        {
          getModifierState: () => true,
          preventDefault: () => undefined,
        },
        placement,
      );

      let disposition;
      try {
        disposition = dispatchAs(
          fixture.host,
          "keydown",
          event,
          (observed) =>
            controller.handleKeyDown(
              observed as KeyboardEvent,
              fixture.rendered,
              fixture.delivery,
            ),
        );
      } finally {
        shadow.restore();
      }

      expect(disposition?.kind).toBe("handled");
      expect(shadow.accessCount()).toBe(0);
      expect(event.defaultPrevented).toBe(true);
      expect(delivered).toHaveLength(1);
      expect(delivered[0]?.command).toMatchObject({
        kind: "intent",
        intentId: "breditor/format-strong",
      });
    }
  });

  it("does not let a generic Event imitate an InputEvent", () => {
    const fixture = createFixture();
    installCollapsedDomSelection(fixture.host, 2);
    const delivered: EditorCommandRequest[] = [];
    const controller = createController(fixture.bridge, delivered);
    const event = new Event("beforeinput", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperties(event, {
      inputType: { configurable: true, value: "insertText" },
      data: { configurable: true, value: "x" },
      isComposing: { configurable: true, value: false },
      getTargetRanges: { configurable: true, value: () => [] },
    });

    const disposition = dispatchAs(
      fixture.host,
      "beforeinput",
      event,
      (observed) =>
        controller.handleBeforeInput(
          observed as InputEvent,
          fixture.rendered,
          fixture.delivery,
        ),
    );

    expect(disposition).toEqual({
      kind: "blocked",
      defaultPrevented: true,
      reason: "invalidEvent",
    });
    expect(event.defaultPrevented).toBe(true);
    expect(delivered).toHaveLength(0);
  });

  it("queue-routes real selection changes and ignores exact programmatic echoes", () => {
    const fixture = createFixture();
    const delivered: EditorCommandRequest[] = [];
    const controller = createController(fixture.bridge, delivered);
    installCollapsedDomSelection(fixture.host, 3);

    const synchronized = controller.handleSelectionChange(
      new Event("selectionchange"),
      fixture.rendered,
      fixture.delivery,
    );

    expect(synchronized.kind).toBe("synchronized");
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({
      source: { kind: "selectionchange", detail: "document-selection" },
      requirements: { selection: "synchronize", history: "preserve" },
      command: { kind: "selection", operation: "synchronize" },
    });

    const exact = selectionValue(
      BaseRangeSelection.create(fixture.rendered.projection, {
        kind: "range",
        anchor: textPoint(2, "before"),
        focus: textPoint(2, "before"),
      }),
    );
    expect(fixture.bridge.write(fixture.rendered, exact).ok).toBe(true);
    expect(
      controller.handleSelectionChange(
        new Event("selectionchange"),
        fixture.rendered,
        fixture.delivery,
      ),
    ).toEqual({ kind: "ignored", reason: "programmaticEcho" });
    expect(delivered).toHaveLength(1);
  });

  it("preserves semantic selection when the DOM range is absent or outside", () => {
    const fixture = createFixture();
    const delivered: EditorCommandRequest[] = [];
    const controller = createController(fixture.bridge, delivered);

    window.getSelection()?.removeAllRanges();
    expect(
      controller.handleSelectionChange(
        new Event("selectionchange"),
        fixture.rendered,
        fixture.delivery,
      ),
    ).toEqual({ kind: "ignored", reason: "noDomRange" });

    const outside = document.createElement("div");
    const outsideParagraph = document.createElement("p");
    outsideParagraph.textContent = "outside";
    outside.append(outsideParagraph);
    document.body.append(outside);
    installCollapsedDomSelection(outside, 2);
    expect(
      controller.handleSelectionChange(
        new Event("selectionchange"),
        fixture.rendered,
        fixture.delivery,
      ),
    ).toEqual({ kind: "ignored", reason: "outsideHost" });
    expect(delivered).toHaveLength(0);
  });

  it("fails closed for active composition, stale delivery, drift, and queue uncertainty", () => {
    const fixture = createFixture();
    installCollapsedDomSelection(fixture.host, 2);
    const event = new Event("selectionchange");
    const composing = new BreditorBrowserEventController(
      new BreditorCommandQueue(() => "unused"),
      {
        keyboard: keyboardPolicy(),
        selectionBridge: fixture.bridge,
        deliveryAuthority: TEST_DELIVERY_AUTHORITY,
        compositionActive: () => true,
      },
    );
    expect(
      composing.handleSelectionChange(event, fixture.rendered, fixture.delivery),
    ).toEqual({ kind: "blocked", reason: "compositionActive" });

    const delivered: EditorCommandRequest[] = [];
    const controller = createController(fixture.bridge, delivered);
    const foreign = issueEditorDeliveryToken(
      fixture.rendered.projection,
      fixture.rendered,
      0n,
      Symbol("foreign-selectionchange"),
    );
    expect(
      controller.handleSelectionChange(event, fixture.rendered, foreign),
    ).toEqual({ kind: "reconcileRequired", reason: "deliveryRejected" });

    fixture.host.firstChild?.appendChild(document.createTextNode("drift"));
    expect(
      controller.handleSelectionChange(event, fixture.rendered, fixture.delivery),
    ).toEqual({ kind: "reconcileRequired", reason: "domDrift" });

    const fresh = createFixture();
    installCollapsedDomSelection(fresh.host, 2);
    const uncertain = new BreditorBrowserEventController(
      new BreditorCommandQueue<never>(() => {
        throw new Error("unknown publication point");
      }),
      {
        keyboard: keyboardPolicy(),
        selectionBridge: fresh.bridge,
        deliveryAuthority: TEST_DELIVERY_AUTHORITY,
      },
    );
    expect(
      uncertain.handleSelectionChange(
        new Event("selectionchange"),
        fresh.rendered,
        fresh.delivery,
      ),
    ).toEqual({ kind: "reconcileRequired", reason: "queueFailure" });
  });
});

function createFixture(text = "hello", followingText?: string): Fixture {
  const projection = projectionValue(
    BaseDocumentProjection.create({
      schema: { name: "breditor/base", version: 1 },
      snapshot: { lineage: "browser-events", revision: "0" },
      paragraphs: [{
        runs: [
          { text, strong: false },
          ...(followingText === undefined
            ? []
            : [{ text: followingText, strong: true }]),
        ],
      }],
    }),
  );
  const host = document.createElement("div");
  host.setAttribute("contenteditable", "true");
  document.body.append(host);
  const rendered = projectionValue(new BreditorDomRenderer().render(host, projection)).rendered;
  const delivery = issueEditorDeliveryToken(
    projection,
    rendered,
    0n,
    TEST_TOKEN_AUTHORITY,
  );
  return {
    host,
    rendered,
    delivery,
    bridge: new BreditorDomSelectionBridge(),
  };
}

function createController(
  bridge: BreditorDomSelectionBridge,
  delivered: EditorCommandRequest[],
): BreditorBrowserEventController<string> {
  return new BreditorBrowserEventController(
    new BreditorCommandQueue((request) => {
      delivered.push(request);
      return request.source.detail;
    }),
    {
      keyboard: keyboardPolicy(),
      selectionBridge: bridge,
      deliveryAuthority: TEST_DELIVERY_AUTHORITY,
    },
  );
}

function keyboardPolicy() {
  return {
    editing: "structuralFallback",
    primaryModifier: "control",
    shortcuts: "enabled",
  } as const;
}

function keyEvent(
  key: string,
  code: string,
  init: KeyboardEventInit = {},
): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key,
    code,
    ...init,
  });
}

function customKeyboardShortcuts(
  options: Readonly<{
    stateId: string;
    intentId?: string;
    historyDirection?: "undo" | "redo";
    chords: readonly Readonly<{ code: string; shift: boolean }>[];
  }> = {
    stateId: "example/emphasis",
    intentId: "example/format-emphasis",
    chords: Object.freeze([{ code: "KeyI", shift: false }]),
  },
): BrowserCompiledKeyboardShortcuts {
  const intentId = options.intentId;
  const historyDirection = options.historyDirection;
  if ((intentId === undefined) === (historyDirection === undefined)) {
    throw new Error("shortcut target fixture is invalid");
  }
  const generation: WasmProfileGenerationView = {
    matches(other): boolean {
      return other === generation;
    },
    free(): void {},
  };
  const view: WasmCompiledProfileDescriptorView = {
    schemaName: "example/document",
    schemaVersion: 1,
    schemaFingerprint: `sha256:${"a".repeat(64)}`,
    formatCount: 0,
    intentCount: intentId === undefined ? 0 : 1,
    actionStateCount: 1,
    inlineFormatSetCount: 0,
    formatKind: () => undefined,
    formatRevision: () => undefined,
    formatPropertyCount: () => undefined,
    formatPropertyName: () => undefined,
    formatPropertyPresence: () => undefined,
    formatPropertyValueType: () => undefined,
    formatPropertyIntegerMinimum: () => undefined,
    formatPropertyIntegerMaximum: () => undefined,
    formatPropertyStringMinimumUtf8Bytes: () => undefined,
    formatPropertyStringMaximumUtf8Bytes: () => undefined,
    intentId: (index) => index === 0 ? intentId : undefined,
    intentInputKind: (index) =>
      index === 0 && intentId !== undefined ? "none" : undefined,
    intentInputContractName: () => undefined,
    intentInputContractVersion: () => undefined,
    intentActivationContract: (index) =>
      index === 0 && intentId !== undefined ? "tracked" : undefined,
    intentValueContractName: () => undefined,
    intentValueContractVersion: () => undefined,
    actionStateId: (index) => index === 0 ? options.stateId : undefined,
    actionStateSourceKind: (index) =>
      index === 0
        ? historyDirection === undefined ? "routed" : "history"
        : undefined,
    actionStateSourceActionId: () => undefined,
    actionStateSourceIntentId: (index) =>
      index === 0 ? intentId : undefined,
    actionStateHistoryDirection: (index) =>
      index === 0 ? historyDirection : undefined,
    actionStateActivationContract: (index) =>
      index === 0
        ? historyDirection === undefined ? "tracked" : "stateless"
        : undefined,
    actionStateValueContractName: () => undefined,
    actionStateValueContractVersion: () => undefined,
    inlineFormatSetFormatKind: () => undefined,
    inlineFormatSetIntentId: () => undefined,
    inlineFormatSetActionStateId: () => undefined,
    matchesProfileGeneration: (candidate) => candidate === generation,
    free(): void {},
  };
  const consumed = consumeWasmCompiledProfileDescriptor(generation, view);
  if (!consumed.ok) throw new Error("shortcut descriptor fixture failed");
  return compileKeyboardShortcutManifest(
    createKeyboardShortcutManifest({
      shortcuts: [{
        stateId: options.stateId,
        chords: options.chords,
      }],
    }),
    consumed.descriptor,
  );
}

function inputEvent(
  type: "beforeinput" | "input",
  inputType: string,
  data: string | null,
  ranges?: readonly AbstractRange[],
  cancelable = true,
): InputEvent {
  const event = new InputEvent(type, {
    bubbles: true,
    cancelable,
    inputType,
    data,
  });
  if (ranges !== undefined) {
    TEST_TARGET_RANGES.set(event, ranges);
  }
  return event;
}

function dispatch<TResult>(
  target: Element,
  event: Event,
  callback: (event: Event) => TResult,
): TResult {
  let result: TResult | undefined;
  target.addEventListener(
    event.type,
    (observed) => {
      result = callback(observed);
    },
    { once: true },
  );
  target.dispatchEvent(event);
  if (result === undefined) {
    throw new Error("test event was not observed");
  }
  return result;
}

function dispatchAs<TResult>(
  target: Element,
  type: string,
  event: Event,
  callback: (event: Event) => TResult,
): TResult {
  let result: TResult | undefined;
  target.addEventListener(
    type,
    (observed) => {
      result = callback(observed);
    },
    { once: true },
  );
  target.dispatchEvent(event);
  if (result === undefined) {
    throw new Error("test event was not observed");
  }
  return result;
}

function installEventShadows(
  event: Event,
  fields: Readonly<Record<string, unknown>>,
  methods: Readonly<Record<string, (...args: readonly unknown[]) => unknown>>,
  placement: "own" | "prototype",
): Readonly<{ accessCount: () => number; restore: () => void }> {
  let accesses = 0;
  const originalPrototype = Object.getPrototypeOf(event) as object;
  const target = placement === "own" ? event : Object.create(originalPrototype) as object;
  for (const [name, value] of Object.entries(fields)) {
    Object.defineProperty(target, name, {
      configurable: true,
      get() {
        accesses += 1;
        return value;
      },
    });
  }
  for (const [name, method] of Object.entries(methods)) {
    Object.defineProperty(target, name, {
      configurable: true,
      value(...args: readonly unknown[]) {
        accesses += 1;
        return method(...args);
      },
    });
  }
  if (placement === "prototype") {
    Object.setPrototypeOf(event, target);
  }
  return Object.freeze({
    accessCount: () => accesses,
    restore: () => {
      if (placement === "prototype") {
        Object.setPrototypeOf(event, originalPrototype);
        return;
      }
      for (const name of [...Object.keys(fields), ...Object.keys(methods)]) {
        Reflect.deleteProperty(event, name);
      }
    },
  });
}

function installCollapsedDomSelection(host: HTMLElement, offset: number): void {
  installDomSelection(host, offset, offset);
}

function installDomSelection(host: HTMLElement, start: number, end: number): void {
  installDomSelectionInText(host, 0, start, end);
}

function installDomSelectionInText(
  host: HTMLElement,
  textIndex: number,
  start: number,
  end: number,
): void {
  const text = canonicalTextAt(host, textIndex);
  const range = host.ownerDocument.createRange();
  range.setStart(text, start);
  range.setEnd(text, end);
  const selection = host.ownerDocument.defaultView?.getSelection();
  if (selection === undefined || selection === null) {
    throw new Error("test window has no Selection");
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

function canonicalText(host: HTMLElement): Text {
  return canonicalTextAt(host, 0);
}

function canonicalTextAt(host: HTMLElement, textIndex: number): Text {
  const walker = host.ownerDocument.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  let text: Node | null = null;
  for (let index = 0; index <= textIndex; index += 1) {
    text = walker.nextNode();
  }
  if (!(text instanceof Text)) {
    throw new Error("canonical test text is missing");
  }
  return text;
}

function textPoint(offset: number, affinity: "before" | "after") {
  return {
    kind: "text",
    textPath: [0, 0],
    utf16Offset: offset,
    affinity,
  } as const;
}

function projectionValue<T>(result: BrowserProjectionResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error.code);
  }
  return result.value;
}

function selectionValue<T>(result: BrowserSelectionResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error.code);
  }
  return result.value;
}
