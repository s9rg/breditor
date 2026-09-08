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
import { BaseDocumentProjection } from "./projection.js";
import type { BrowserProjectionResult } from "./result.js";
import { BaseRangeSelection } from "./selection.js";
import type { BrowserSelectionResult } from "./selection_result.js";

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

function createFixture(): Fixture {
  const projection = projectionValue(
    BaseDocumentProjection.create({
      schema: { name: "breditor/base", version: 1 },
      snapshot: { lineage: "browser-events", revision: "0" },
      paragraphs: [{ runs: [{ text: "hello", strong: false }] }],
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
  const text = canonicalText(host);
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
  const text = host.firstChild?.firstChild;
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
