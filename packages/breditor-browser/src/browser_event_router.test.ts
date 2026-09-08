import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BreditorBrowserEventController } from "./browser_event_controller.js";
import {
  BreditorBrowserEventRouter,
  MAX_BROWSER_EVENT_ROUTER_SUBSCRIBERS,
} from "./browser_event_router.js";
import { BreditorClipboardController } from "./clipboard_controller.js";
import { BreditorCommandQueue } from "./command_queue.js";
import type { CompositionDeliveryToken } from "./composition_delivery_token.js";
import { issueCompositionDeliveryToken } from "./composition_delivery_token.js";
import { BreditorCompositionController } from "./composition_controller.js";
import {
  BreditorDomRenderer,
  type DomCompositionLease,
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
import { BaseRangeSelection } from "./selection.js";
import type {
  BreditorWasmCommandAdapter,
  WasmCommandSequenceOutcome,
  WasmCompositionLeaseRestoreOutcome,
  WasmRenderReconciliationOutcome,
} from "./wasm_command_adapter.js";

interface ScheduledTask {
  readonly callback: () => void;
}

class TaskScheduler {
  readonly tasks: ScheduledTask[] = [];
  readonly schedule = (callback: () => void): void => {
    this.tasks.push(Object.freeze({ callback }));
  };

  runAll(): void {
    let remaining = 32;
    while (this.tasks.length > 0) {
      if (remaining === 0) throw new Error("scheduled task loop");
      remaining -= 1;
      this.tasks.shift()?.callback();
    }
  }
}

interface FakeCompositionLease {
  readonly token: CompositionDeliveryToken;
  readonly selection: BaseRangeSelection;
  readonly sessionId: bigint;
  readonly domLease: DomCompositionLease | undefined;
}

class FakeAdapter {
  readonly renderer = new BreditorDomRenderer();
  readonly selectionBridge = new BreditorDomSelectionBridge();
  readonly authority = Symbol("browser-event-router-test");
  readonly deliveryAuthority = issueEditorDeliveryAuthority((token) =>
    this.acceptsDeliveryToken(token),
  );
  readonly requests: EditorCommandRequest[] = [];
  readonly host: HTMLElement;
  rendered: RenderedProjection;
  state:
    | "live"
    | "composition"
    | "executing"
    | "reconcile"
    | "faulted"
    | "disposed" = "live";
  epoch = 1n;
  lease: FakeCompositionLease | undefined;
  restoreCalls = 0;
  canonicalRestoreFails = false;
  commandThrows = false;

  readonly commandExecutor = (
    request: EditorCommandRequest,
  ): WasmCommandSequenceOutcome => {
    this.requests.push(request);
    if (this.commandThrows) {
      this.state = "faulted";
      throw new Error("uncertain command");
    }
    this.epoch += 1n;
    const snapshot = this.rendered.projection.snapshot;
    const eventKind = request.command.kind === "control"
      ? "closeHistoryGroup" as const
      : "action" as const;
    const command = Object.freeze({
      status: "committed" as const,
      eventKind,
      snapshot,
      render: undefined,
    });
    return Object.freeze({
      status: "delivered" as const,
      selection: Object.freeze({ status: "unchanged" as const, snapshot }),
      boundary: undefined,
      command,
      rendered: this.rendered,
    });
  };

  constructor(
    readonly projection: BaseDocumentProjection,
    host: HTMLElement = document.createElement("div"),
  ) {
    this.host = host;
    this.host.contentEditable = "true";
    if (!this.host.isConnected) document.body.append(this.host);
    const rendered = this.renderer.render(this.host, projection);
    if (!rendered.ok) throw new Error(rendered.error.code);
    this.rendered = rendered.value.rendered;
  }

  deliveryToken(): EditorDeliveryToken {
    if (
      this.state !== "live" ||
      !this.host.isConnected ||
      !this.rendered.current ||
      !this.rendered.validateCanonicalDom()
    ) {
      throw new TypeError("delivery unavailable");
    }
    return issueEditorDeliveryToken(
      this.rendered.projection,
      this.rendered,
      this.epoch,
      this.authority,
    );
  }

  acceptsDeliveryToken(token: unknown): token is EditorDeliveryToken {
    return this.state === "live" && editorDeliveryTokenMatches(
      token,
      this.rendered,
      this.epoch,
      this.authority,
    );
  }

  beginCompositionLease(
    _delivery: EditorDeliveryToken,
    selected: BaseRangeSelection,
    sessionId: bigint,
  ): CompositionDeliveryToken {
    if (this.state !== "live") throw new TypeError("adapter is not live");
    this.epoch += 1n;
    const token = issueCompositionDeliveryToken(
      this.rendered.projection,
      this.rendered,
      selected,
      this.epoch,
      sessionId,
      this.authority,
    );
    this.lease = Object.freeze({
      token,
      selection: selected,
      sessionId,
      domLease: undefined,
    });
    this.state = "composition";
    return token;
  }

  refineCompositionLease(
    token: CompositionDeliveryToken,
    selected: BaseRangeSelection,
  ): CompositionDeliveryToken {
    const lease = this.requireLease(token);
    const replacement = issueCompositionDeliveryToken(
      this.rendered.projection,
      this.rendered,
      selected,
      this.epoch,
      lease.sessionId,
      this.authority,
    );
    this.lease = Object.freeze({ ...lease, token: replacement, selection: selected });
    return replacement;
  }

  openCompositionDomLease(token: CompositionDeliveryToken): boolean {
    const lease = this.requireLease(token);
    const domLease = this.renderer.beginCompositionDomLease(this.rendered);
    if (domLease === null) throw new TypeError("renderer refused composition lease");
    this.lease = Object.freeze({ ...lease, domLease });
    return true;
  }

  restoreCompositionLease(
    token: CompositionDeliveryToken,
  ): WasmCompositionLeaseRestoreOutcome {
    return this.finishLease(this.requireLease(token), false);
  }

  recoverCompositionLease(
    token: CompositionDeliveryToken,
  ): WasmCompositionLeaseRestoreOutcome {
    return this.finishLease(this.requireLease(token), true);
  }

  restoreCanonicalRender(): WasmRenderReconciliationOutcome {
    this.restoreCalls += 1;
    if (
      this.canonicalRestoreFails ||
      (this.state !== "live" && this.state !== "reconcile")
    ) {
      this.state = "reconcile";
      return Object.freeze({ ok: false, reason: "renderFailed" });
    }
    const rendered = this.renderer.render(this.host, this.projection);
    if (!rendered.ok) {
      this.state = "reconcile";
      return Object.freeze({ ok: false, reason: "renderFailed" });
    }
    this.rendered = rendered.value.rendered;
    this.state = "live";
    return Object.freeze({ ok: true, rendered: this.rendered });
  }

  private requireLease(token: CompositionDeliveryToken): FakeCompositionLease {
    if (this.state !== "composition" || this.lease?.token !== token) {
      throw new TypeError("composition lease is stale");
    }
    return this.lease;
  }

  private finishLease(
    lease: FakeCompositionLease,
    recover: boolean,
  ): WasmCompositionLeaseRestoreOutcome {
    if (recover && lease.domLease !== undefined) {
      this.renderer.discardCompositionDomLease(lease.domLease);
    }
    const rendered = !recover && lease.domLease !== undefined
      ? this.renderer.restoreCompositionDomLease(lease.domLease, this.projection)
      : this.renderer.render(this.host, this.projection);
    this.lease = undefined;
    this.epoch += 1n;
    if (!rendered.ok) {
      this.state = "reconcile";
      return Object.freeze({ ok: false, reason: "renderFailed" });
    }
    this.rendered = rendered.value.rendered;
    if (!this.selectionBridge.write(this.rendered, lease.selection).ok) {
      this.state = "reconcile";
      return Object.freeze({ ok: false, reason: "selectionWriteFailed" });
    }
    this.state = "live";
    return Object.freeze({
      ok: true,
      rendered: this.rendered,
      delivery: this.deliveryToken(),
      selection: lease.selection,
    });
  }
}

interface Fixture {
  readonly adapter: FakeAdapter;
  readonly queue: BreditorCommandQueue<WasmCommandSequenceOutcome>;
  readonly router: BreditorBrowserEventRouter;
  readonly scheduler: TaskScheduler;
}

const TEST_TARGET_RANGES = new WeakMap<
  InputEvent,
  readonly AbstractRange[]
>();
const ORIGINAL_GET_TARGET_RANGES = Object.getOwnPropertyDescriptor(
  InputEvent.prototype,
  "getTargetRanges",
);

beforeEach(() => {
  Object.defineProperty(InputEvent.prototype, "getTargetRanges", {
    configurable: true,
    value(this: InputEvent): readonly AbstractRange[] {
      return TEST_TARGET_RANGES.get(this) ?? Object.freeze([]);
    },
  });
  document.body.replaceChildren();
  window.getSelection()?.removeAllRanges();
});

afterEach(() => {
  if (ORIGINAL_GET_TARGET_RANGES === undefined) {
    Reflect.deleteProperty(InputEvent.prototype, "getTargetRanges");
  } else {
    Object.defineProperty(
      InputEvent.prototype,
      "getTargetRanges",
      ORIGINAL_GET_TARGET_RANGES,
    );
  }
  vi.restoreAllMocks();
});

describe("BreditorBrowserEventRouter", () => {
  it("routes beforeinput and input by exact composition then clipboard precedence", () => {
    const order: string[] = [];
    vi.spyOn(BreditorCompositionController.prototype, "handleBeforeInput")
      .mockImplementation(() => {
        order.push("composition-beforeinput");
        return Object.freeze({ kind: "ignored", reason: "notComposition" });
      });
    vi.spyOn(BreditorClipboardController.prototype, "handleBeforeInput")
      .mockImplementation(() => {
        order.push("clipboard-beforeinput");
        return Object.freeze({
          kind: "ignored",
          operation: "paste",
          defaultPrevented: false,
          reason: "notClipboardInput",
        });
      });
    vi.spyOn(BreditorBrowserEventController.prototype, "handleBeforeInput")
      .mockImplementation(() => {
        order.push("ordinary-beforeinput");
        return Object.freeze({
          kind: "blocked",
          defaultPrevented: true,
          reason: "unsupportedInputType",
        });
      });
    vi.spyOn(BreditorCompositionController.prototype, "handleInput")
      .mockImplementation(() => {
        order.push("composition-input");
        return Object.freeze({ kind: "ignored", reason: "notComposition" });
      });
    vi.spyOn(BreditorClipboardController.prototype, "handleInput")
      .mockImplementation(() => {
        order.push("clipboard-input");
        return Object.freeze({
          kind: "ignored",
          operation: "paste",
          defaultPrevented: false,
          reason: "notClipboardInput",
        });
      });
    vi.spyOn(BreditorBrowserEventController.prototype, "handleInput")
      .mockImplementation(() => {
        order.push("ordinary-input");
        return Object.freeze({ kind: "inputPostcondition", expectedEcho: undefined });
      });
    const fixture = setup();

    fixture.adapter.host.dispatchEvent(inputEvent("beforeinput", "insertText", "x"));
    fixture.adapter.host.dispatchEvent(inputEvent("input", "insertText", "x"));

    expect(order).toEqual([
      "composition-beforeinput",
      "clipboard-beforeinput",
      "ordinary-beforeinput",
      "composition-input",
      "clipboard-input",
      "ordinary-input",
    ]);
    fixture.router.dispose();
  });

  it("stops on any disposition other than the exact fallthrough variants", () => {
    const clipboard = vi.spyOn(
      BreditorClipboardController.prototype,
      "handleBeforeInput",
    );
    const ordinary = vi.spyOn(
      BreditorBrowserEventController.prototype,
      "handleBeforeInput",
    );
    vi.spyOn(BreditorCompositionController.prototype, "handleBeforeInput")
      .mockReturnValue(Object.freeze({ kind: "ignored", reason: "outsideHost" }));
    const fixture = setup();

    fixture.adapter.host.dispatchEvent(inputEvent("beforeinput", "insertText", "x"));

    expect(clipboard).not.toHaveBeenCalled();
    expect(ordinary).not.toHaveBeenCalled();
    fixture.router.dispose();
  });

  it("front-routes keydown through composition and uses ordinary only when inactive", () => {
    const order: string[] = [];
    vi.spyOn(BreditorCompositionController.prototype, "handleKeyDown")
      .mockImplementation(() => {
        order.push("composition");
        return Object.freeze({ kind: "ignored", reason: "inactive" });
      });
    vi.spyOn(BreditorBrowserEventController.prototype, "handleKeyDown")
      .mockImplementation(() => {
        order.push("ordinary");
        return Object.freeze({
          kind: "blocked",
          defaultPrevented: true,
          reason: "unsupportedEditingShortcut",
        });
      });
    const fixture = setup();

    fixture.adapter.host.dispatchEvent(keyEvent("x", "KeyX"));

    expect(order).toEqual(["composition", "ordinary"]);
    fixture.router.dispose();
  });

  it("preserves exact-once keyboard echoes across all three listener stages", () => {
    const fixture = setup();
    installDomSelection(fixture.adapter.host, 1);

    const key = keyEvent("b", "KeyB", { ctrlKey: true });
    const before = inputEvent("beforeinput", "formatBold", null);
    const input = inputEvent("input", "formatBold", null);
    fixture.adapter.host.dispatchEvent(key);
    fixture.adapter.host.dispatchEvent(before);
    fixture.adapter.host.dispatchEvent(input);

    expect(key.defaultPrevented).toBe(true);
    expect(before.defaultPrevented).toBe(true);
    expect(fixture.adapter.requests).toHaveLength(1);
    expect(fixture.adapter.requests[0]?.command).toMatchObject({
      kind: "action",
      actionId: "breditor/toggle-strong",
    });
    expect(fixture.router.status).toEqual({ kind: "live" });
    fixture.router.dispose();
  });

  it("owns deferred composition settlement and stays live after its late callback", () => {
    const fixture = setup();
    installDomSelection(fixture.adapter.host, 1);
    const paragraph = fixture.adapter.host.firstElementChild;
    const text = paragraph?.firstChild;
    if (!(paragraph instanceof HTMLParagraphElement) || !(text instanceof Text)) {
      throw new Error("composition fixture is unavailable");
    }
    const target = document.createRange();
    target.setStart(text, 1);
    target.setEnd(text, 1);

    paragraph.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true, data: "" }),
    );
    paragraph.dispatchEvent(
      inputEvent("beforeinput", "insertCompositionText", "x", [target], true),
    );
    paragraph.textContent = "axbc";
    paragraph.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "x" }),
    );
    fixture.scheduler.runAll();

    expect(fixture.adapter.requests).toHaveLength(1);
    expect(fixture.adapter.requests[0]?.command).toMatchObject({
      kind: "action",
      actionId: "breditor/insert-plain-text",
    });
    expect(fixture.router.status).toEqual({ kind: "live" });
    fixture.router.dispose();
  });

  it("keeps transient document selectionchange inert while composition owns the base", () => {
    const selection = vi.spyOn(
      BreditorBrowserEventController.prototype,
      "handleSelectionChange",
    );
    const fixture = setup();
    installDomSelection(fixture.adapter.host, 1);
    const paragraph = fixture.adapter.host.firstElementChild;
    if (!(paragraph instanceof HTMLParagraphElement)) {
      throw new Error("composition paragraph is unavailable");
    }
    paragraph.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true, data: "" }),
    );

    document.dispatchEvent(new Event("selectionchange"));

    expect(selection).not.toHaveBeenCalled();
    expect(fixture.adapter.state).toBe("composition");
    expect(fixture.router.status).toEqual({ kind: "live" });
    fixture.router.dispose();
  });

  it("routes clipboard events only to the clipboard controller", () => {
    const composition = vi.spyOn(
      BreditorCompositionController.prototype,
      "handleCompositionEvent",
    );
    const ordinary = vi.spyOn(BreditorBrowserEventController.prototype, "handleKeyDown");
    const copy = vi.spyOn(BreditorClipboardController.prototype, "handleCopy")
      .mockReturnValue(Object.freeze({
        kind: "blocked",
        operation: "copy",
        defaultPrevented: false,
        reason: "clipboardUnavailable",
        partial: Object.freeze({
          clipboard: "untouched",
          cancellation: "notAttempted",
          command: "notApplicable",
        }),
      }));
    const fixture = setup();

    fixture.adapter.host.dispatchEvent(new Event("copy", { bubbles: true }));

    expect(copy).toHaveBeenCalledOnce();
    expect(composition).not.toHaveBeenCalled();
    expect(ordinary).not.toHaveBeenCalled();
    fixture.router.dispose();
  });

  it("captures blur and routes document selectionchange", () => {
    const blur = vi.spyOn(BreditorCompositionController.prototype, "handleBlur")
      .mockReturnValue(Object.freeze({ kind: "ignored", reason: "inactive" }));
    const selection = vi.spyOn(
      BreditorBrowserEventController.prototype,
      "handleSelectionChange",
    ).mockReturnValue(Object.freeze({ kind: "ignored", reason: "noDomRange" }));
    const fixture = setup();

    fixture.adapter.host.firstElementChild?.dispatchEvent(
      new Event("blur", { bubbles: false }),
    );
    document.dispatchEvent(new Event("selectionchange"));

    expect(blur).toHaveBeenCalledOnce();
    expect(selection).toHaveBeenCalledOnce();
    fixture.router.dispose();
  });

  it("uses native host connectivity and owner document despite own shadows", () => {
    const adapter = new FakeAdapter(projection());
    const queue = new BreditorCommandQueue(adapter.commandExecutor);
    const scheduler = new TaskScheduler();
    const redirectedDocument = document.implementation.createHTMLDocument(
      "redirected selection listener",
    );
    const ownerDocumentShadow = vi.fn(() => redirectedDocument);
    const isConnectedShadow = vi.fn(() => false);
    Object.defineProperties(adapter.host, {
      ownerDocument: { configurable: true, get: ownerDocumentShadow },
      isConnected: { configurable: true, get: isConnectedShadow },
    });
    const listeners = observeSelectionListenerLifecycle();
    let router: BreditorBrowserEventRouter | undefined;
    try {
      router = new BreditorBrowserEventRouter(
        queue,
        adapter as unknown as BreditorWasmCommandAdapter,
        options(scheduler),
      );

      expect(listeners.added.map((listener) => listener.target)).toEqual([
        document,
      ]);
      expect(ownerDocumentShadow).not.toHaveBeenCalled();
      expect(isConnectedShadow).not.toHaveBeenCalled();
      router.dispose();
      expect(listeners.removed).toEqual(listeners.added);
    } finally {
      router?.dispose();
      Reflect.deleteProperty(adapter.host, "ownerDocument");
      Reflect.deleteProperty(adapter.host, "isConnected");
    }
  });

  it("does not derive listener intrinsics from an own document defaultView", () => {
    const adapter = new FakeAdapter(projection());
    const queue = new BreditorCommandQueue(adapter.commandExecutor);
    const scheduler = new TaskScheduler();
    const listeners = observeSelectionListenerLifecycle();
    const defaultViewShadow = vi.fn(() => {
      throw new Error("own defaultView must not select listener intrinsics");
    });
    const priorDescriptor = Object.getOwnPropertyDescriptor(document, "defaultView");
    let router: BreditorBrowserEventRouter | undefined;
    try {
      Object.defineProperty(document, "defaultView", {
        configurable: true,
        get: defaultViewShadow,
      });
      router = new BreditorBrowserEventRouter(
        queue,
        adapter as unknown as BreditorWasmCommandAdapter,
        options(scheduler),
      );

      expect(router.status).toEqual({ kind: "live" });
      expect(defaultViewShadow).not.toHaveBeenCalled();
      expect(listeners.added.map((listener) => listener.target)).toEqual([
        document,
      ]);
      router.dispose();
      expect(listeners.removed).toEqual(listeners.added);
    } finally {
      router?.dispose();
      if (priorDescriptor === undefined) {
        Reflect.deleteProperty(document, "defaultView");
      } else {
        Object.defineProperty(document, "defaultView", priorDescriptor);
      }
    }
  });

  it("routes and removes target-realm listeners for an adopted iframe host", () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const foreignDocument = iframe.contentDocument;
    if (foreignDocument === null) {
      throw new Error("iframe realm is unavailable");
    }
    const host = foreignDocument.createElement("div");
    const originalPrototype = Object.getPrototypeOf(host) as object;
    expect(originalPrototype === HTMLDivElement.prototype).toBe(false);
    document.adoptNode(host);
    document.body.append(host);
    expect(host.ownerDocument).toBe(document);
    expect(Object.getPrototypeOf(host) === originalPrototype).toBe(true);
    expect(host).not.toBeInstanceOf(HTMLElement);
    const addTrap = vi.fn(() => {
      throw new Error("host-only addEventListener prototype trap ran");
    });
    const removeTrap = vi.fn(() => {
      throw new Error("host-only removeEventListener prototype trap ran");
    });
    const nodeTypeTrap = vi.fn(() => 1);
    const ownerDocumentTrap = vi.fn(() => document);
    const hostilePrototype = Object.create(originalPrototype) as object;
    Object.defineProperties(hostilePrototype, {
      nodeType: { configurable: true, get: nodeTypeTrap },
      ownerDocument: { configurable: true, get: ownerDocumentTrap },
      addEventListener: { configurable: true, value: addTrap },
      removeEventListener: { configurable: true, value: removeTrap },
    });
    Object.setPrototypeOf(host, hostilePrototype);

    let router: BreditorBrowserEventRouter | undefined;
    try {
      const adapter = new FakeAdapter(projection(), host);
      installDomSelection(adapter.host, 1);
      const queue = new BreditorCommandQueue(adapter.commandExecutor);
      router = new BreditorBrowserEventRouter(
        queue,
        adapter as unknown as BreditorWasmCommandAdapter,
        options(new TaskScheduler()),
      );

      expect(router.status).toEqual({ kind: "live" });
      expect(
        adapter.host.dispatchEvent(keyEvent("b", "KeyB", { ctrlKey: true })),
      ).toBe(false);
      expect(adapter.requests).toHaveLength(1);

      expect(router.dispose()).toEqual({ kind: "disposed" });
      expect(
        adapter.host.dispatchEvent(keyEvent("b", "KeyB", { ctrlKey: true })),
      ).toBe(true);
      expect(adapter.requests).toHaveLength(1);
      expect(addTrap).not.toHaveBeenCalled();
      expect(removeTrap).not.toHaveBeenCalled();
    } finally {
      router?.dispose();
      Object.setPrototypeOf(host, originalPrototype);
      host.remove();
      iframe.remove();
    }
  });

  it("restores canonical DOM after a reconciliation disposition", () => {
    const fixture = setup();
    fixture.adapter.host.firstElementChild?.append("drift");

    fixture.adapter.host.dispatchEvent(inputEvent("input", "insertText", "x"));

    expect(fixture.adapter.restoreCalls).toBe(1);
    expect(fixture.adapter.rendered.validateCanonicalDom()).toBe(true);
    expect(fixture.router.status).toEqual({ kind: "live" });
    fixture.router.dispose();
  });

  it("defers unsafe beforeinput repair until native mutation has completed", () => {
    const fixture = setup();
    installDomSelection(fixture.adapter.host, 1);
    const before = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: false,
      inputType: "insertText",
      data: "x",
    });
    Object.defineProperty(before, "getTargetRanges", {
      configurable: true,
      value: () => [],
    });

    fixture.adapter.host.dispatchEvent(before);
    expect(fixture.adapter.restoreCalls).toBe(0);
    expect(fixture.scheduler.tasks).toHaveLength(1);
    fixture.adapter.host.firstElementChild?.append("native-drift");
    fixture.adapter.host.dispatchEvent(inputEvent("input", "insertText", "x"));

    expect(fixture.adapter.restoreCalls).toBe(1);
    expect(fixture.adapter.rendered.validateCanonicalDom()).toBe(true);
    expect(fixture.router.status).toEqual({ kind: "live" });
    fixture.scheduler.runAll();
    expect(fixture.adapter.restoreCalls).toBe(1);
    fixture.router.dispose();
  });

  it("faults closed, removes listeners, and publishes once when recovery fails", () => {
    const fixture = setup();
    fixture.adapter.canonicalRestoreFails = true;
    fixture.adapter.host.firstElementChild?.append("drift");
    const statuses: unknown[] = [];
    const listener = vi.fn((status: unknown) => {
      statuses.push(status);
      return Promise.reject(new Error("contained subscriber rejection"));
    });
    const first = fixture.router.subscribe(listener);
    const second = fixture.router.subscribe(listener);

    fixture.adapter.host.dispatchEvent(inputEvent("input", "insertText", "x"));
    fixture.adapter.host.dispatchEvent(keyEvent("b", "KeyB", { ctrlKey: true }));
    first();
    second();

    expect(fixture.router.status).toEqual({
      kind: "faulted",
      reason: "reconciliationFailed",
    });
    expect(listener).toHaveBeenCalledOnce();
    expect(statuses).toEqual([fixture.router.status]);
    expect(fixture.adapter.requests).toHaveLength(0);
  });

  it("reports queue uncertainty and never attempts a replay", () => {
    const fixture = setup();
    installDomSelection(fixture.adapter.host, 1);
    fixture.adapter.commandThrows = true;

    fixture.adapter.host.dispatchEvent(
      keyEvent("b", "KeyB", { ctrlKey: true }),
    );

    expect(fixture.adapter.requests).toHaveLength(1);
    expect(fixture.router.status).toEqual({
      kind: "faulted",
      reason: "queueUncertain",
    });
    fixture.adapter.host.dispatchEvent(
      keyEvent("b", "KeyB", { ctrlKey: true }),
    );
    expect(fixture.adapter.requests).toHaveLength(1);
  });

  it("rejects duplicate host ownership and releases it on teardown", () => {
    const fixture = setup();
    expect(() =>
      new BreditorBrowserEventRouter(
        fixture.queue,
        fixture.adapter as unknown as BreditorWasmCommandAdapter,
        options(fixture.scheduler),
      )
    ).toThrow(/already has an owner/u);

    expect(fixture.router.dispose()).toEqual({ kind: "disposed" });
    const replacement = new BreditorBrowserEventRouter(
      fixture.queue,
      fixture.adapter as unknown as BreditorWasmCommandAdapter,
      options(fixture.scheduler),
    );
    expect(replacement.status).toEqual({ kind: "live" });
    replacement.dispose();
  });

  it("rolls back a listener when platform installation succeeds and then throws", () => {
    const adapter = new FakeAdapter(projection());
    const queue = new BreditorCommandQueue(adapter.commandExecutor);
    const scheduler = new TaskScheduler();
    const composition = vi.spyOn(
      BreditorCompositionController.prototype,
      "handleCompositionEvent",
    );
    const original = EventTarget.prototype.addEventListener;
    const add = vi.spyOn(EventTarget.prototype, "addEventListener")
      .mockImplementation(function (
        this: EventTarget,
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | AddEventListenerOptions,
      ): void {
        Reflect.apply(original, this, [type, listener, options]);
        if (type === "compositionstart") {
          throw new Error("installed then threw");
        }
      });

    expect(() =>
      new BreditorBrowserEventRouter(
        queue,
        adapter as unknown as BreditorWasmCommandAdapter,
        options(scheduler),
      )
    ).toThrow(/installed then threw/u);
    add.mockRestore();

    adapter.host.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true, data: "" }),
    );
    expect(composition).not.toHaveBeenCalled();

    const replacement = new BreditorBrowserEventRouter(
      queue,
      adapter as unknown as BreditorWasmCommandAdapter,
      options(scheduler),
    );
    replacement.dispose();
  });

  it("makes an orphaned constructor listener inert even when platform removal throws", () => {
    const adapter = new FakeAdapter(projection());
    const queue = new BreditorCommandQueue(adapter.commandExecutor);
    const scheduler = new TaskScheduler();
    const captured: EventListener[] = [];
    const originalAdd = EventTarget.prototype.addEventListener;
    const add = vi.spyOn(EventTarget.prototype, "addEventListener")
      .mockImplementation(function (
        this: EventTarget,
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | AddEventListenerOptions,
      ): void {
        Reflect.apply(originalAdd, this, [type, listener, options]);
        if (type === "compositionstart" && typeof listener === "function") {
          captured.push(listener);
          throw new Error("installed then threw");
        }
      });
    const remove = vi.spyOn(EventTarget.prototype, "removeEventListener")
      .mockImplementation(() => {
        throw new Error("platform removal failed");
      });

    expect(() =>
      new BreditorBrowserEventRouter(
        queue,
        adapter as unknown as BreditorWasmCommandAdapter,
        options(scheduler),
      )
    ).toThrow(/installed then threw/u);
    expect(captured).toHaveLength(1);
    add.mockRestore();
    remove.mockRestore();

    expect(() =>
      Reflect.apply(captured[0] as EventListener, adapter.host, [
        new Proxy(new CompositionEvent("compositionstart"), {
          get() {
            throw new Error("orphan callback must not inspect its event");
          },
        }),
      ])
    ).not.toThrow();
    expect(adapter.requests).toHaveLength(0);

    const replacement = new BreditorBrowserEventRouter(
      queue,
      adapter as unknown as BreditorWasmCommandAdapter,
      options(scheduler),
    );
    replacement.dispose();
  });

  it("makes a browser-retained late callback inert before teardown effects", () => {
    const captured: EventListener[] = [];
    const original = EventTarget.prototype.addEventListener;
    vi.spyOn(EventTarget.prototype, "addEventListener")
      .mockImplementation(function (
        this: EventTarget,
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | AddEventListenerOptions,
      ): void {
        if (type === "keydown" && typeof listener === "function") {
          captured.push(listener);
        }
        Reflect.apply(original, this, [type, listener, options]);
      });
    const fixture = setup();
    expect(captured).toHaveLength(1);
    fixture.router.dispose();

    expect(() =>
      Reflect.apply(captured[0] as EventListener, fixture.adapter.host, [
        new Proxy(new Event("keydown"), {
          get() {
            throw new Error("late event must not be inspected");
          },
        }),
      ])
    ).not.toThrow();
    expect(fixture.router.status).toEqual({ kind: "disposed" });
    expect(fixture.adapter.requests).toHaveLength(0);
  });

  it("removes host and document listeners during idempotent teardown", () => {
    const fixture = setup();
    installDomSelection(fixture.adapter.host, 1);
    const notifications: unknown[] = [];
    fixture.router.subscribe((status) => notifications.push(status));

    expect(fixture.router.dispose()).toEqual({ kind: "disposed" });
    expect(fixture.router.dispose()).toEqual({ kind: "disposed" });
    fixture.adapter.host.dispatchEvent(
      keyEvent("b", "KeyB", { ctrlKey: true }),
    );
    document.dispatchEvent(new Event("selectionchange"));

    expect(fixture.adapter.requests).toHaveLength(0);
    expect(notifications).toEqual([{ kind: "disposed" }]);
  });

  it("bounds subscribers and ignores hostile own native event shadows", () => {
    const fixture = setup();
    for (let index = 0; index < MAX_BROWSER_EVENT_ROUTER_SUBSCRIBERS; index += 1) {
      fixture.router.subscribe(() => index);
    }
    expect(() => fixture.router.subscribe(() => {})).toThrow(/capacity/u);
    const event = inputEvent("beforeinput", "insertText", "x");
    Object.defineProperty(event, "inputType", {
      configurable: true,
      get: () => {
        throw new Error("hostile inputType");
      },
    });

    expect(() => fixture.adapter.host.dispatchEvent(event)).not.toThrow();
    expect(fixture.adapter.requests).toHaveLength(1);
    expect(event.defaultPrevented).toBe(true);
    expect(fixture.router.status.kind).toMatch(/live|faulted/u);
    fixture.router.dispose();
  });
});

function setup(): Fixture {
  const adapter = new FakeAdapter(projection());
  const selection = BaseRangeSelection.create(adapter.projection, {
    kind: "range",
    anchor: textPoint(1),
    focus: textPoint(1),
  });
  if (!selection.ok || !adapter.selectionBridge.write(adapter.rendered, selection.value).ok) {
    throw new Error("selection fixture failed");
  }
  const queue = new BreditorCommandQueue<WasmCommandSequenceOutcome>(
    adapter.commandExecutor,
  );
  const scheduler = new TaskScheduler();
  const router = new BreditorBrowserEventRouter(
    queue,
    adapter as unknown as BreditorWasmCommandAdapter,
    options(scheduler),
  );
  return { adapter, queue, router, scheduler };
}

function options(scheduler: TaskScheduler) {
  return {
    keyboard: {
      editing: "structuralFallback",
      primaryModifier: "control",
      shortcuts: "enabled",
    },
    scheduleTask: scheduler.schedule,
  } as const;
}

function projection(): BaseDocumentProjection {
  const result = BaseDocumentProjection.create({
    schema: { name: "breditor/base", version: 1 },
    snapshot: { lineage: "browser-event-router", revision: "1" },
    paragraphs: [{ runs: [{ text: "abc", strong: false }] }],
  });
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

function textPoint(offset: number) {
  return {
    kind: "text" as const,
    textPath: [0, 0] as const,
    utf16Offset: offset,
    affinity: "before" as const,
  };
}

function inputEvent(
  type: "beforeinput" | "input",
  inputType: string,
  data: string | null,
  ranges: readonly AbstractRange[] = [],
  isComposing = false,
): InputEvent {
  const event = new InputEvent(type, {
    bubbles: true,
    cancelable: type === "beforeinput",
    inputType,
    data,
    isComposing,
  });
  TEST_TARGET_RANGES.set(event, ranges);
  return event;
}

function keyEvent(
  key: string,
  code: string,
  modifiers: Readonly<{ ctrlKey?: boolean }> = {},
): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key,
    code,
    ...(modifiers.ctrlKey === undefined ? {} : { ctrlKey: modifiers.ctrlKey }),
  });
}

function installDomSelection(host: HTMLElement, offset: number): void {
  const text = host.firstElementChild?.firstChild;
  if (!(text instanceof Text)) throw new Error("canonical text is unavailable");
  const range = host.ownerDocument.createRange();
  range.setStart(text, offset);
  range.setEnd(text, offset);
  const selection = host.ownerDocument.defaultView?.getSelection();
  if (selection === undefined || selection === null) {
    throw new Error("DOM selection is unavailable");
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

interface ObservedSelectionListener {
  readonly target: EventTarget;
  readonly listener: EventListenerOrEventListenerObject | null;
  readonly capture: boolean;
}

function observeSelectionListenerLifecycle(): Readonly<{
  added: ObservedSelectionListener[];
  removed: ObservedSelectionListener[];
}> {
  const added: ObservedSelectionListener[] = [];
  const removed: ObservedSelectionListener[] = [];
  const nativeAdd = EventTarget.prototype.addEventListener;
  const nativeRemove = EventTarget.prototype.removeEventListener;
  vi.spyOn(EventTarget.prototype, "addEventListener").mockImplementation(function (
    this: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (type === "selectionchange") {
      added.push({
        target: this,
        listener,
        capture: listenerCapture(options),
      });
    }
    Reflect.apply(nativeAdd, this, [type, listener, options]);
  });
  vi.spyOn(EventTarget.prototype, "removeEventListener").mockImplementation(function (
    this: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void {
    if (type === "selectionchange") {
      removed.push({
        target: this,
        listener,
        capture: listenerCapture(options),
      });
    }
    Reflect.apply(nativeRemove, this, [type, listener, options]);
  });
  return Object.freeze({ added, removed });
}

function listenerCapture(options?: boolean | EventListenerOptions): boolean {
  return typeof options === "boolean" ? options : options?.capture === true;
}
