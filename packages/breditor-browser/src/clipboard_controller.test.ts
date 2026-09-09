import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BreditorCommandQueue,
  openCommandQueueLeasePort,
} from "./command_queue.js";
import {
  BreditorClipboardController,
  type ClipboardControllerDisposition,
} from "./clipboard_controller.js";
import { BreditorDomRenderer, type RenderedProjection } from "./dom_renderer.js";
import { BreditorDomSelectionBridge } from "./dom_selection.js";
import {
  editorDeliveryTokenMatches,
  issueEditorDeliveryToken,
  type EditorCommandRequest,
  type EditorDeliveryToken,
} from "./editor_command.js";
import {
  BaseDocumentProjection,
  createProfiledDocumentProjection,
} from "./projection.js";
import { BaseRangeSelection } from "./selection.js";
import {
  compileBrowserPresentation,
  type BrowserCompiledPresentation,
} from "./compiled_browser_presentation.js";
import { createInlineFormatRenderManifest } from "./inline_format_render_manifest.js";
import {
  consumeWasmCompiledProfileDescriptor,
  type BrowserCompiledProfileDescriptor,
  type WasmCompiledProfileDescriptorView,
  type WasmProfileGenerationView,
} from "./wasm_profile_descriptor.js";
import type {
  BreditorWasmCommandAdapter,
  WasmCommandSequenceOutcome,
} from "./wasm_command_adapter.js";

class FakeAdapter {
  readonly renderer: BreditorDomRenderer;
  readonly selectionBridge = new BreditorDomSelectionBridge();
  readonly authority = Symbol("clipboard-controller-test");
  readonly requests: EditorCommandRequest[] = [];
  readonly host: HTMLElement;
  rendered: RenderedProjection;
  state: "live" | "faulted" | "disposed" = "live";
  epoch = 1n;
  commandThrows = false;
  commandStatus: "committed" | "unchanged" = "committed";
  onExecute: ((request: EditorCommandRequest) => void) | undefined;

  readonly commandExecutor = (
    request: EditorCommandRequest,
  ): WasmCommandSequenceOutcome => {
    this.requests.push(request);
    this.onExecute?.(request);
    if (this.commandThrows) {
      this.state = "faulted";
      throw new Error("uncertain command");
    }
    this.epoch += 1n;
    const snapshot = this.rendered.projection.snapshot;
    const command = this.commandStatus === "committed"
      ? Object.freeze({
          status: "committed" as const,
          eventKind: "action" as const,
          snapshot,
          render: undefined,
        })
      : Object.freeze({ status: "unchanged" as const, snapshot });
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
    presentation?: BrowserCompiledPresentation,
  ) {
    this.renderer = new BreditorDomRenderer(presentation);
    this.host = document.createElement("div");
    this.host.contentEditable = "true";
    document.body.append(this.host);
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

  advanceEpoch(): void {
    this.epoch += 1n;
  }

  dispose(): void {
    this.state = "disposed";
  }
}

interface FakeDataTransfer {
  readonly calls: string[];
  readonly values: Readonly<Record<string, string>>;
  readonly types: readonly string[];
  clearData(): void;
  setData(type: string, value: string): void;
  getData(type: string): string;
}

interface FakeCancelableEvent {
  readonly type: string;
  readonly target: EventTarget;
  readonly cancelable: boolean;
  readonly clipboardData?: object;
  readonly inputType?: string;
  readonly data?: string | null;
  readonly isComposing?: boolean;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

interface Fixture {
  readonly adapter: FakeAdapter;
  readonly queue: BreditorCommandQueue<WasmCommandSequenceOutcome>;
  readonly controller: BreditorClipboardController;
  readonly target: HTMLParagraphElement;
}

beforeEach(() => {
  document.body.replaceChildren();
  window.getSelection()?.removeAllRanges();
});

describe("BreditorClipboardController", () => {
  it("copies the exact semantic selection as plain text and closed safe HTML", () => {
    const fixture = setup(0, 3);
    const transfer = dataTransfer();
    const event = clipboardEvent("copy", fixture.target, transfer);

    const result = fixture.controller.handleCopy(event);

    expect(result).toEqual({
      kind: "handled",
      operation: "copy",
      defaultPrevented: true,
      partial: {
        clipboard: "representationsWritten",
        cancellation: "confirmed",
        command: "notApplicable",
      },
    });
    expect(transfer.calls).toEqual([
      "clear",
      "set:text/plain:abc",
      "set:text/html:<p>abc</p>",
    ]);
    expect(event.defaultPrevented).toBe(true);
    expect(fixture.adapter.requests).toEqual([]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("abc");
  });

  it("uses native ClipboardEvent and DataTransfer capabilities below own shadows", () => {
    const priorClipboardEvent = Object.getOwnPropertyDescriptor(
      globalThis,
      "ClipboardEvent",
    );
    const priorDataTransfer = Object.getOwnPropertyDescriptor(
      globalThis,
      "DataTransfer",
    );
    const transferState = new WeakMap<object, Map<string, string>>();
    const eventTransfer = new WeakMap<object, object>();
    const nativeCalls: string[] = [];

    class PlatformDataTransfer {
      constructor() {
        transferState.set(this, new Map());
      }

      get types(): readonly string[] {
        const values = transferState.get(this);
        if (values === undefined) throw new TypeError("illegal invocation");
        nativeCalls.push("types");
        return Object.freeze([...values.keys()]);
      }

      clearData(type?: string): void {
        const values = transferState.get(this);
        if (values === undefined) throw new TypeError("illegal invocation");
        nativeCalls.push("clear");
        if (type === undefined) values.clear();
        else values.delete(type);
      }

      getData(type: string): string {
        const values = transferState.get(this);
        if (values === undefined) throw new TypeError("illegal invocation");
        nativeCalls.push(`get:${type}`);
        return values.get(type) ?? "";
      }

      setData(type: string, value: string): void {
        const values = transferState.get(this);
        if (values === undefined) throw new TypeError("illegal invocation");
        nativeCalls.push(`set:${type}`);
        values.set(type, value);
      }
    }

    class PlatformClipboardEvent extends Event {
      constructor(type: string, transfer: object) {
        super(type, { bubbles: true, cancelable: true });
        eventTransfer.set(this, transfer);
      }

      get clipboardData(): object {
        const transfer = eventTransfer.get(this);
        if (transfer === undefined) throw new TypeError("illegal invocation");
        return transfer;
      }
    }

    Object.defineProperties(globalThis, {
      DataTransfer: { configurable: true, value: PlatformDataTransfer },
      ClipboardEvent: { configurable: true, value: PlatformClipboardEvent },
    });
    try {
      const fixture = setup(0, 2);
      const transfer = new PlatformDataTransfer();
      const event = new PlatformClipboardEvent("cut", transfer);
      const shadow = vi.fn(() => {
        throw new Error("own browser capability shadow must not run");
      });
      for (const name of [
        "type",
        "target",
        "cancelable",
        "defaultPrevented",
        "clipboardData",
      ]) {
        Object.defineProperty(event, name, {
          configurable: true,
          get: shadow,
        });
      }
      Object.defineProperty(event, "preventDefault", {
        configurable: true,
        value: shadow,
      });
      Object.defineProperties(transfer, {
        types: { configurable: true, get: shadow },
        clearData: { configurable: true, value: shadow },
        getData: { configurable: true, value: shadow },
        setData: { configurable: true, value: shadow },
      });
      let result: ClipboardControllerDisposition | undefined;
      fixture.target.addEventListener(
        "cut",
        (observed) => {
          result = fixture.controller.handleCut(observed);
        },
        { once: true },
      );

      expect(fixture.target.dispatchEvent(event)).toBe(false);
      expect(result).toMatchObject({
        kind: "handled",
        operation: "cut",
        defaultPrevented: true,
      });
      expect(shadow).not.toHaveBeenCalled();
      expect(nativeCalls).toEqual([
        "types",
        "clear",
        "types",
        "set:text/plain",
        "types",
        "set:text/html",
      ]);
      expect(transferState.get(transfer)).toEqual(new Map([
        ["text/plain", "ab"],
        ["text/html", "<p>ab</p>"],
      ]));
      expect(fixture.adapter.requests).toHaveLength(1);
    } finally {
      restoreGlobalConstructor("ClipboardEvent", priorClipboardEvent);
      restoreGlobalConstructor("DataTransfer", priorDataTransfer);
    }
  });

  it("uses the rendered profile presentation for safe copy and HTML-only plain paste", () => {
    const fixture = profiledSetup(0, 3);
    const copyTransfer = dataTransfer();

    expect(
      fixture.controller.handleCopy(
        clipboardEvent("copy", fixture.target, copyTransfer),
      ),
    ).toMatchObject({ kind: "handled", operation: "copy" });
    expect(copyTransfer.calls).toEqual([
      "clear",
      "set:text/plain:abc",
      'set:text/html:<p><span class="highlight">abc</span></p>',
    ]);

    const pasteTransfer = dataTransfer({
      types: ["text/html"],
      values: {
        "text/html": '<p><span class="highlight">pasted</span></p>',
      },
    });
    expect(
      fixture.controller.handlePaste(
        clipboardEvent("paste", fixture.target, pasteTransfer),
      ),
    ).toMatchObject({ kind: "handled", operation: "paste" });
    expect(fixture.adapter.requests[0]?.command).toEqual({
      kind: "action",
      actionId: "breditor/insert-plain-text",
      input: { kind: "string", value: "pasted" },
    });

    const invalidTransfer = dataTransfer({
      types: ["text/html"],
      values: {
        "text/html": '<p><span class="highlight" title="secret">x</span></p>',
      },
    });
    expect(
      fixture.controller.handlePaste(
        clipboardEvent("paste", fixture.target, invalidTransfer),
      ),
    ).toMatchObject({
      kind: "blocked",
      operation: "paste",
      reason: "invalidHtml",
    });
    expect(fixture.adapter.requests).toHaveLength(1);
  });

  it("writes both cut representations and confirms cancellation before deletion", () => {
    const fixture = setup(1, 2);
    const transfer = dataTransfer();
    const event = clipboardEvent("cut", fixture.target, transfer);
    fixture.adapter.onExecute = (request) => {
      expect(event.defaultPrevented).toBe(true);
      expect(transfer.calls).toEqual([
        "clear",
        "set:text/plain:b",
        "set:text/html:<p>b</p>",
      ]);
      expect(request.command).toEqual({
        kind: "action",
        actionId: "breditor/delete-selection",
        input: { kind: "none" },
      });
    };

    expect(fixture.controller.handleCut(event)).toMatchObject({
      kind: "handled",
      operation: "cut",
      defaultPrevented: true,
      sequence: 1n,
      partial: {
        clipboard: "representationsWritten",
        cancellation: "confirmed",
        command: "completed",
      },
    });
    expect(fixture.adapter.requests).toHaveLength(1);
  });

  it("uses advertised plain text authoritatively for one paste command", () => {
    const fixture = setup(2);
    const transfer = dataTransfer({
      types: ["text/html", "text/plain"],
      values: {
        "text/plain": "plain 😀",
        "text/html": "<p>ignored</p>",
      },
    });
    const event = clipboardEvent("paste", fixture.target, transfer);

    expect(fixture.controller.handlePaste(event)).toMatchObject({
      kind: "handled",
      operation: "paste",
      sequence: 1n,
    });
    expect(transfer.calls).toEqual(["get:text/plain"]);
    expect(fixture.adapter.requests[0]?.command).toEqual({
      kind: "action",
      actionId: "breditor/insert-plain-text",
      input: { kind: "string", value: "plain 😀" },
    });
  });

  it("inserts a collapsed paste at the semantic caret", () => {
    const fixture = setup(2);
    const event = clipboardEvent(
      "paste",
      fixture.target,
      dataTransfer({
        types: ["text/plain"],
        values: { "text/plain": "at-caret" },
      }),
    );

    expect(fixture.controller.handlePaste(event)).toMatchObject({
      kind: "handled",
      operation: "paste",
      sequence: 1n,
    });
    expect(fixture.adapter.requests[0]).toMatchObject({
      selection: {
        kind: "range",
        selection: { order: "collapsed" },
      },
      command: { input: { kind: "string", value: "at-caret" } },
    });
  });

  it("never falls back to HTML when advertised plain text is empty", () => {
    const fixture = setup(2);
    const transfer = dataTransfer({
      types: ["text/plain", "text/html"],
      values: {
        "text/plain": "",
        "text/html": "<p>must not be used</p>",
      },
    });
    const event = clipboardEvent("paste", fixture.target, transfer);

    expect(fixture.controller.handlePaste(event)).toMatchObject({
      kind: "blocked",
      operation: "paste",
      defaultPrevented: true,
      reason: "invalidPlainText",
      partial: {
        clipboard: "readAttempted",
        cancellation: "confirmed",
        command: "notAttempted",
      },
    });
    expect(transfer.calls).toEqual(["get:text/plain"]);
    expect(fixture.adapter.requests).toEqual([]);
  });

  it("sanitizes supported HTML only when plain text was not advertised", () => {
    const fixture = setup(2);
    const transfer = dataTransfer({
      types: ["text/html"],
      values: { "text/html": "<p>hello <strong>world</strong></p>" },
    });

    expect(
      fixture.controller.handlePaste(
        clipboardEvent("paste", fixture.target, transfer),
      ),
    ).toMatchObject({ kind: "handled", operation: "paste" });
    expect(transfer.calls).toEqual(["get:text/html"]);
    expect(fixture.adapter.requests[0]?.command).toMatchObject({
      input: { kind: "string", value: "hello world" },
    });
  });

  it("cancels unsupported owned paste without admitting a command", () => {
    const fixture = setup(2);
    const transfer = dataTransfer({
      types: ["image/png"],
      values: {},
    });
    const event = clipboardEvent("paste", fixture.target, transfer);

    expect(fixture.controller.handlePaste(event)).toMatchObject({
      kind: "blocked",
      reason: "unsupportedClipboardPayload",
      defaultPrevented: true,
    });
    expect(event.defaultPrevented).toBe(true);
    expect(transfer.calls).toEqual([]);
    expect(fixture.adapter.requests).toEqual([]);
  });

  it.each(["copy", "cut"] as const)(
    "cancels collapsed %s without accessing DataTransfer or Rust",
    (operation) => {
      const fixture = setup(2);
      let clipboardReads = 0;
      const event = clipboardEvent(operation, fixture.target, dataTransfer());
      Object.defineProperty(event, "clipboardData", {
        get() {
          clipboardReads += 1;
          throw new Error("must not read");
        },
      });

      const result = operation === "copy"
        ? fixture.controller.handleCopy(event)
        : fixture.controller.handleCut(event);
      expect(result).toMatchObject({
        kind: "handled",
        operation,
        partial: {
          clipboard: "untouched",
          cancellation: "confirmed",
        },
      });
      expect(clipboardReads).toBe(0);
      expect(fixture.adapter.requests).toEqual([]);
    },
  );

  it("leaves outside events native and rejects a drifted nested control", () => {
    const fixture = setup(0, 1);
    const outside = document.createElement("div");
    document.body.append(outside);
    const nested = document.createElement("textarea");
    let clipboardReads = 0;
    const unavailable = {
      get types() {
        clipboardReads += 1;
        return [];
      },
    };

    expect(
      fixture.controller.handlePaste(
        clipboardEvent("paste", outside, unavailable),
      ),
    ).toEqual({
      kind: "ignored",
      operation: "paste",
      defaultPrevented: false,
      reason: "outsideHost",
    });
    fixture.adapter.host.append(nested);
    expect(
      fixture.controller.handlePaste(
        clipboardEvent("paste", nested, unavailable),
      ),
    ).toMatchObject({
      kind: "reconcileRequired",
      operation: "paste",
      reason: "adapterUnavailable",
    });
    expect(clipboardReads).toBe(0);
  });

  it("holds the exact queue lease through types, data, writes, and cancellation", () => {
    const fixture = setup(0, 2);
    const reentrant: string[] = [];
    const probe = () => {
      const result = fixture.queue.submit({ bad: true } as never);
      reentrant.push(
        result.status === "rejected" ? result.reason : result.status,
      );
    };
    const transfer = dataTransfer({
      types: ["text/plain"],
      values: { "text/plain": "x" },
      onTypes: probe,
      onGet: probe,
    });
    const event = clipboardEvent("paste", fixture.target, transfer, {
      onPrevent: probe,
    });

    expect(fixture.controller.handlePaste(event).kind).toBe("handled");
    expect(reentrant).toEqual(["leased", "leased", "leased"]);

    const copyTransfer = dataTransfer({ onClear: probe, onSet: probe });
    expect(
      fixture.controller.handleCopy(
        clipboardEvent("copy", fixture.target, copyTransfer, {
          onPrevent: probe,
        }),
      ).kind,
    ).toBe("handled");
    expect(reentrant.slice(3)).toEqual([
      "leased",
      "leased",
      "leased",
      "leased",
    ]);
  });

  it("reports exact partial clipboard progress when a write throws", () => {
    const fixture = setup(0, 2);
    const transfer = dataTransfer({
      onSet: (_type, call) => {
        if (call === 2) throw new Error("HTML write failed");
      },
    });
    const event = clipboardEvent("cut", fixture.target, transfer);

    expect(fixture.controller.handleCut(event)).toEqual({
      kind: "blocked",
      operation: "cut",
      defaultPrevented: true,
      reason: "clipboardWriteFailed",
      partial: {
        clipboard: "writeUncertain",
        cancellation: "confirmed",
        command: "notAttempted",
      },
    });
    expect(fixture.adapter.requests).toEqual([]);
  });

  it("never deletes after cancellation fails, even after both writes", () => {
    const fixture = setup(0, 2);
    const transfer = dataTransfer();
    const event = clipboardEvent("cut", fixture.target, transfer, {
      preventSucceeds: false,
    });

    expect(fixture.controller.handleCut(event)).toEqual({
      kind: "reconcileRequired",
      operation: "cut",
      defaultPrevented: false,
      reason: "cancellationFailed",
      partial: {
        clipboard: "representationsWritten",
        cancellation: "failed",
        command: "notAttempted",
      },
    });
    expect(fixture.adapter.requests).toEqual([]);
  });

  it("detects direct adapter reentrancy after a clipboard side effect", () => {
    const fixture = setup(0, 2);
    const transfer = dataTransfer({
      onClear: () => fixture.adapter.advanceEpoch(),
    });
    const event = clipboardEvent("cut", fixture.target, transfer);

    expect(fixture.controller.handleCut(event)).toMatchObject({
      kind: "reconcileRequired",
      operation: "cut",
      reason: "staleBase",
      partial: { clipboard: "cleared", command: "notAttempted" },
    });
    expect(event.defaultPrevented).toBe(true);
    expect(fixture.adapter.requests).toEqual([]);
  });

  it("does not hide base drift behind an outside target returned by a getter", () => {
    const fixture = setup(2);
    const outside = document.createElement("div");
    document.body.append(outside);
    let clipboardReads = 0;
    const event = {
      type: "paste",
      get target(): EventTarget {
        fixture.adapter.advanceEpoch();
        return outside;
      },
      cancelable: true,
      defaultPrevented: false,
      get clipboardData(): never {
        clipboardReads += 1;
        throw new Error("must not read");
      },
      preventDefault(): void {},
    };

    expect(fixture.controller.handlePaste(event)).toMatchObject({
      kind: "reconcileRequired",
      operation: "paste",
      reason: "staleBase",
      defaultPrevented: false,
    });
    expect(clipboardReads).toBe(0);
  });

  it("rejects a detached host without consulting a forged connection shadow", () => {
    const fixture = setup(0, 2);
    const connectedShadow = vi.fn(() => true);
    fixture.adapter.host.remove();
    Object.defineProperty(fixture.adapter.host, "isConnected", {
      configurable: true,
      get: connectedShadow,
    });
    const event = clipboardEvent("copy", fixture.target, dataTransfer());

    expect(fixture.controller.handleCopy(event)).toMatchObject({
      kind: "reconcileRequired",
      operation: "copy",
      reason: "adapterUnavailable",
      defaultPrevented: false,
    });
    expect(event.defaultPrevented).toBe(false);
    expect(connectedShadow).not.toHaveBeenCalled();
  });

  it("rejects a detached host without consulting a forged connection shadow", () => {
    const fixture = setup(0, 2);
    const connectedShadow = vi.fn(() => true);
    fixture.adapter.host.remove();
    Object.defineProperty(fixture.adapter.host, "isConnected", {
      configurable: true,
      get: connectedShadow,
    });
    const event = clipboardEvent("copy", fixture.target, dataTransfer());

    expect(fixture.controller.handleCopy(event)).toMatchObject({
      kind: "reconcileRequired",
      operation: "copy",
      reason: "adapterUnavailable",
      defaultPrevented: false,
    });
    expect(event.defaultPrevented).toBe(false);
    expect(connectedShadow).not.toHaveBeenCalled();
  });

  it("rechecks the base before ignoring a nonclipboard beforeinput snapshot", () => {
    const fixture = setup(2);
    let prevented = false;
    const event = {
      type: "beforeinput",
      target: fixture.target,
      cancelable: true,
      get defaultPrevented(): boolean {
        return prevented;
      },
      preventDefault(): void {
        prevented = true;
      },
      get inputType(): string {
        fixture.adapter.advanceEpoch();
        return "insertText";
      },
      isComposing: false,
    };

    expect(fixture.controller.handleBeforeInput(event)).toMatchObject({
      kind: "reconcileRequired",
      reason: "staleBase",
      defaultPrevented: true,
    });
    expect(prevented).toBe(true);
  });

  it("does not trust structural ownership after an event metadata trap", () => {
    const fixture = setup(0, 2);
    const event = clipboardEvent("cut", fixture.target, dataTransfer());
    Object.defineProperty(event, "cancelable", {
      get() {
        throw new Error("hostile cancelable getter");
      },
    });

    expect(fixture.controller.handleCut(event)).toMatchObject({
      kind: "blocked",
      operation: "cut",
      reason: "invalidEvent",
      defaultPrevented: false,
      partial: { cancellation: "notAttempted", command: "notAttempted" },
    });
    expect(event.defaultPrevented).toBe(false);
  });

  it("does not hide partial effects when disposal is reentrant", () => {
    const fixture = setup(0, 2);
    const transfer = dataTransfer({
      onClear: () => fixture.controller.dispose(),
    });

    expect(
      fixture.controller.handleCut(
        clipboardEvent("cut", fixture.target, transfer),
      ),
    ).toMatchObject({
      kind: "reconcileRequired",
      operation: "cut",
      reason: "staleBase",
      partial: { clipboard: "cleared", command: "notAttempted" },
    });
    expect(fixture.controller.handleCopy({})).toEqual({ kind: "disposed" });
  });

  it("marks a throwing leased command uncertain and never retries it", () => {
    const fixture = setup(0, 2);
    fixture.adapter.commandThrows = true;
    const event = clipboardEvent("cut", fixture.target, dataTransfer());

    expect(fixture.controller.handleCut(event)).toMatchObject({
      kind: "reconcileRequired",
      reason: "queueFailure",
      partial: {
        clipboard: "representationsWritten",
        cancellation: "confirmed",
        command: "uncertain",
      },
    });
    expect(fixture.adapter.requests).toHaveLength(1);
    expect(fixture.queue.failure?.code).toBe("command_queue.executor_threw");
  });

  it("binds cut beforeinput/input echoes to the fresh post-command base", () => {
    const fixture = setup(0, 2);
    fixture.controller.handleCut(
      clipboardEvent("cut", fixture.target, dataTransfer()),
    );
    const before = inputEvent(
      "beforeinput",
      "deleteByCut",
      fixture.target,
      true,
    );

    expect(fixture.controller.handleBeforeInput(before)).toEqual({
      kind: "beforeinputEcho",
      operation: "cut",
      defaultPrevented: true,
    });
    expect(before.defaultPrevented).toBe(true);
    expect(
      fixture.controller.handleInput(
        inputEvent("input", "deleteByCut", fixture.target, false),
      ),
    ).toEqual({ kind: "inputPostcondition", operation: "cut" });
    expect(
      fixture.controller.handleInput(
        inputEvent("input", "deleteByCut", fixture.target, false),
      ),
    ).toMatchObject({
      kind: "reconcileRequired",
      operation: "cut",
      reason: "unexpectedInput",
    });
  });

  it("reports confirmed echo cancellation when reentrancy prevents lease release", () => {
    const fixture = setup(0, 2);
    fixture.controller.handleCut(
      clipboardEvent("cut", fixture.target, dataTransfer()),
    );
    const before = inputEvent(
      "beforeinput",
      "deleteByCut",
      fixture.target,
      true,
      { onPrevent: () => fixture.queue.dispose() },
    );

    expect(fixture.controller.handleBeforeInput(before)).toEqual({
      kind: "reconcileRequired",
      operation: "cut",
      defaultPrevented: true,
      reason: "leaseReleaseFailed",
      partial: {
        clipboard: "untouched",
        cancellation: "confirmed",
        command: "notApplicable",
      },
    });
  });

  it("accepts a direct paste input postcondition and spends its receipt once", () => {
    const fixture = setup(2);
    fixture.controller.handlePaste(
      clipboardEvent(
        "paste",
        fixture.target,
        dataTransfer({
          types: ["text/plain"],
          values: { "text/plain": "x" },
        }),
      ),
    );

    expect(
      fixture.controller.handleInput(
        inputEvent("input", "insertFromPaste", fixture.target, false),
      ),
    ).toEqual({ kind: "inputPostcondition", operation: "paste" });
    expect(
      fixture.controller.handleInput(
        inputEvent("input", "insertFromPaste", fixture.target, false),
      ),
    ).toMatchObject({ reason: "unexpectedInput" });
  });

  it("invalidates an old receipt before a new clipboard operation fails to lease", () => {
    const fixture = setup(2);
    fixture.controller.handlePaste(
      clipboardEvent(
        "paste",
        fixture.target,
        dataTransfer({
          types: ["text/plain"],
          values: { "text/plain": "x" },
        }),
      ),
    );
    const port = openCommandQueueLeasePort(
      fixture.queue,
      fixture.adapter.commandExecutor,
    );
    if (port === undefined) throw new Error("queue port fixture failed");
    const lease = port.acquireLease();
    if (lease === undefined) throw new Error("queue lease fixture failed");

    expect(
      fixture.controller.handlePaste(
        new Proxy({}, { get: () => { throw new Error("must not read"); } }),
      ),
    ).toMatchObject({ kind: "reconcileRequired", reason: "queueUnavailable" });
    expect(port.releaseLease(lease)).toBe(true);
    expect(
      fixture.controller.handleInput(
        inputEvent("input", "insertFromPaste", fixture.target, false),
      ),
    ).toMatchObject({ kind: "reconcileRequired", reason: "unexpectedInput" });
  });

  it("spends an echo receipt when the routed echo cannot acquire the queue", () => {
    const fixture = setup(2);
    fixture.controller.handlePaste(
      clipboardEvent(
        "paste",
        fixture.target,
        dataTransfer({
          types: ["text/plain"],
          values: { "text/plain": "x" },
        }),
      ),
    );
    const port = openCommandQueueLeasePort(
      fixture.queue,
      fixture.adapter.commandExecutor,
    );
    if (port === undefined) throw new Error("queue port fixture failed");
    const lease = port.acquireLease();
    if (lease === undefined) throw new Error("queue lease fixture failed");
    const unavailable = inputEvent(
      "beforeinput",
      "insertFromPaste",
      fixture.target,
      true,
    );

    expect(fixture.controller.handleBeforeInput(unavailable)).toMatchObject({
      kind: "reconcileRequired",
      reason: "queueUnavailable",
      defaultPrevented: false,
    });
    expect(port.releaseLease(lease)).toBe(true);
    const replay = inputEvent(
      "beforeinput",
      "insertFromPaste",
      fixture.target,
      true,
    );
    expect(fixture.controller.handleBeforeInput(replay)).toMatchObject({
      kind: "blocked",
      reason: "echoWithoutReceipt",
      defaultPrevented: true,
    });
  });

  it("cancels a clipboard beforeinput whose receipt is stale or absent", () => {
    const fixture = setup(0, 2);
    fixture.controller.handleCut(
      clipboardEvent("cut", fixture.target, dataTransfer()),
    );
    fixture.adapter.advanceEpoch();
    const stale = inputEvent(
      "beforeinput",
      "deleteByCut",
      fixture.target,
      true,
    );

    expect(fixture.controller.handleBeforeInput(stale)).toMatchObject({
      kind: "blocked",
      operation: "cut",
      reason: "echoWithoutReceipt",
      defaultPrevented: true,
    });
    expect(stale.defaultPrevented).toBe(true);
  });

  it("clears receipts explicitly and becomes inert on disposal", () => {
    const fixture = setup(0, 2);
    fixture.controller.handleCut(
      clipboardEvent("cut", fixture.target, dataTransfer()),
    );
    fixture.controller.forgetEchoReceipt();
    const before = inputEvent(
      "beforeinput",
      "deleteByCut",
      fixture.target,
      true,
    );
    expect(fixture.controller.handleBeforeInput(before)).toMatchObject({
      reason: "echoWithoutReceipt",
    });

    fixture.controller.dispose();
    expect(
      fixture.controller.handleCopy(
        new Proxy({}, { get: () => { throw new Error("must not read"); } }),
      ),
    ).toEqual({ kind: "disposed" });
  });

  it("is total for hostile clipboard and event accessors", () => {
    const fixture = setup(0, 2);
    const hostileEvent = new Proxy({}, {
      get() {
        throw new Error("hostile event");
      },
    });
    expect(() => fixture.controller.handleCut(hostileEvent)).not.toThrow();
    expect(fixture.controller.handleCut(hostileEvent)).toMatchObject({
      kind: "blocked",
      reason: "invalidEvent",
    });

    const event = clipboardEvent("paste", fixture.target, new Proxy({}, {
      get() {
        throw new Error("hostile transfer");
      },
    }));
    let result: ClipboardControllerDisposition | undefined;
    expect(() => {
      result = fixture.controller.handlePaste(event);
    }).not.toThrow();
    expect(result).toMatchObject({
      kind: "blocked",
      reason: "clipboardReadFailed",
      defaultPrevented: true,
    });
  });

  it("cancels after an expected clipboard type when target access traps", () => {
    const fixture = setup(2);
    let prevented = false;
    const event = {
      type: "paste",
      cancelable: true,
      get target(): never {
        throw new Error("hostile target");
      },
      get defaultPrevented(): boolean {
        return prevented;
      },
      preventDefault(): void {
        prevented = true;
      },
    };

    expect(fixture.controller.handlePaste(event)).toMatchObject({
      kind: "blocked",
      operation: "paste",
      reason: "invalidEvent",
      defaultPrevented: true,
    });
    expect(prevented).toBe(true);
    expect(fixture.adapter.requests).toEqual([]);
  });

  it("cancels an expected beforeinput echo when target access traps", () => {
    const fixture = setup(2);
    fixture.controller.handlePaste(
      clipboardEvent(
        "paste",
        fixture.target,
        dataTransfer({
          types: ["text/plain"],
          values: { "text/plain": "x" },
        }),
      ),
    );
    let prevented = false;
    const event = {
      type: "beforeinput",
      cancelable: true,
      get target(): never {
        throw new Error("hostile target");
      },
      get defaultPrevented(): boolean {
        return prevented;
      },
      preventDefault(): void {
        prevented = true;
      },
    };

    expect(fixture.controller.handleBeforeInput(event)).toMatchObject({
      kind: "blocked",
      operation: "paste",
      reason: "invalidEvent",
      defaultPrevented: true,
    });
    expect(prevented).toBe(true);
  });

  it("rejects a queue whose constructor executor is not the adapter executor", () => {
    const documentProjection = projection();
    const adapter = new FakeAdapter(documentProjection);
    const queue = new BreditorCommandQueue<WasmCommandSequenceOutcome>(() => {
      throw new Error("not used");
    });

    expect(() => new BreditorClipboardController(
      queue,
      adapter as unknown as BreditorWasmCommandAdapter,
    )).toThrow(/must own the adapter executor/u);
  });
});

function setup(start: number, end = start): Fixture {
  const documentProjection = projection();
  const adapter = new FakeAdapter(documentProjection);
  const selected = selection(documentProjection, start, end);
  if (!adapter.selectionBridge.write(adapter.rendered, selected).ok) {
    throw new Error("selection fixture failed");
  }
  const queue = new BreditorCommandQueue<WasmCommandSequenceOutcome>(
    adapter.commandExecutor,
  );
  const controller = new BreditorClipboardController(
    queue,
    adapter as unknown as BreditorWasmCommandAdapter,
  );
  const target = adapter.host.firstElementChild;
  if (!(target instanceof HTMLParagraphElement)) {
    throw new Error("paragraph fixture failed");
  }
  return { adapter, queue, controller, target };
}

function profiledSetup(start: number, end = start): Fixture {
  const generation = new ControllerProfileGeneration();
  const descriptor = controllerProfileDescriptor(generation);
  const manifest = createInlineFormatRenderManifest({
    recipes: [
      { formatKind: "breditor/strong", element: "strong" },
      {
        formatKind: "example/highlight",
        element: "span",
        classes: ["highlight"],
        before: ["breditor/strong"],
      },
    ],
  });
  const presentation = compileBrowserPresentation(
    generation,
    descriptor,
    manifest,
  );
  const projectionResult = createProfiledDocumentProjection(
    {
      schema: {
        name: descriptor.schema.name,
        version: descriptor.schema.version,
        fingerprint: descriptor.schema.fingerprint,
      },
      snapshot: { lineage: "clipboard-controller-profile", revision: "1" },
      paragraphs: [
        {
          runs: [{
            text: "abc",
            formatDetails: [{ kind: "example/highlight", properties: [] }],
          }],
        },
      ],
    },
    generation,
    descriptor,
  );
  if (!projectionResult.ok) throw new Error(projectionResult.error.code);
  const adapter = new FakeAdapter(projectionResult.value, presentation);
  const selected = selection(projectionResult.value, start, end);
  if (!adapter.selectionBridge.write(adapter.rendered, selected).ok) {
    throw new Error("profiled selection fixture failed");
  }
  const queue = new BreditorCommandQueue<WasmCommandSequenceOutcome>(
    adapter.commandExecutor,
  );
  const controller = new BreditorClipboardController(
    queue,
    adapter as unknown as BreditorWasmCommandAdapter,
  );
  const target = adapter.host.firstElementChild;
  if (!(target instanceof HTMLParagraphElement)) {
    throw new Error("profiled paragraph fixture failed");
  }
  return { adapter, queue, controller, target };
}

const CONTROLLER_PROFILE_FINGERPRINT =
  "sha256:3123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

class ControllerProfileGeneration implements WasmProfileGenerationView {
  matches(other: WasmProfileGenerationView): boolean {
    return other === this;
  }

  free(): void {}
}

function controllerProfileDescriptor(
  generation: WasmProfileGenerationView,
): BrowserCompiledProfileDescriptor {
  const formats = ["breditor/strong", "example/highlight"] as const;
  const absent = (): undefined => undefined;
  const view: WasmCompiledProfileDescriptorView = {
    schemaName: "example/document",
    schemaVersion: 1,
    schemaFingerprint: CONTROLLER_PROFILE_FINGERPRINT,
    formatCount: formats.length,
    intentCount: 0,
    actionStateCount: 0,
    matchesProfileGeneration: (candidate) => generation.matches(candidate),
    formatKind: (index) => formats[index],
    formatRevision: (index) =>
      index >= 0 && index < formats.length ? 1 : undefined,
    formatPropertyCount: (index) =>
      index >= 0 && index < formats.length ? 0 : undefined,
    formatPropertyName: absent,
    formatPropertyPresence: absent,
    formatPropertyValueType: absent,
    formatPropertyIntegerMinimum: absent,
    formatPropertyIntegerMaximum: absent,
    formatPropertyStringMinimumUtf8Bytes: absent,
    formatPropertyStringMaximumUtf8Bytes: absent,
    intentId: absent,
    intentInputKind: absent,
    intentInputContractName: absent,
    intentInputContractVersion: absent,
    intentActivationContract: absent,
    intentValueContractName: absent,
    intentValueContractVersion: absent,
    actionStateId: absent,
    actionStateSourceKind: absent,
    actionStateSourceActionId: absent,
    actionStateSourceIntentId: absent,
    actionStateHistoryDirection: absent,
    actionStateActivationContract: absent,
    actionStateValueContractName: absent,
    actionStateValueContractVersion: absent,
    free: () => undefined,
  };
  const result = consumeWasmCompiledProfileDescriptor(generation, view);
  if (!result.ok) throw new Error("controller profile descriptor was rejected");
  return result.descriptor;
}

function projection(): BaseDocumentProjection {
  const result = BaseDocumentProjection.create({
    schema: { name: "breditor/base", version: 1 },
    snapshot: { lineage: "clipboard-controller", revision: "1" },
    paragraphs: [{ runs: [{ text: "abc", strong: false }] }],
  });
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

function selection(
  documentProjection: BaseDocumentProjection,
  start: number,
  end: number,
): BaseRangeSelection {
  const result = BaseRangeSelection.create(documentProjection, {
    kind: "range",
    anchor: {
      kind: "text",
      textPath: [0, 0],
      utf16Offset: start,
      affinity: "before",
    },
    focus: {
      kind: "text",
      textPath: [0, 0],
      utf16Offset: end,
      affinity: "before",
    },
  });
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

function dataTransfer(
  options: Readonly<{
    types?: readonly string[];
    values?: Readonly<Record<string, string>>;
    onTypes?: () => void;
    onGet?: (type: string) => void;
    onClear?: () => void;
    onSet?: (type: string, call: number) => void;
  }> = {},
): FakeDataTransfer {
  const calls: string[] = [];
  const values = options.values ?? {};
  let setCalls = 0;
  const transfer = {
    calls,
    values,
    get types(): readonly string[] {
      options.onTypes?.();
      return options.types ?? [];
    },
    clearData(): void {
      options.onClear?.();
      calls.push("clear");
    },
    setData(type: string, value: string): void {
      setCalls += 1;
      options.onSet?.(type, setCalls);
      calls.push(`set:${type}:${value}`);
    },
    getData(type: string): string {
      options.onGet?.(type);
      calls.push(`get:${type}`);
      return values[type] ?? "";
    },
  };
  return transfer;
}

function clipboardEvent(
  type: "copy" | "cut" | "paste",
  target: EventTarget,
  clipboardData: object,
  options: Readonly<{
    onPrevent?: () => void;
    preventSucceeds?: boolean;
  }> = {},
): FakeCancelableEvent {
  let prevented = false;
  return {
    type,
    target,
    cancelable: true,
    clipboardData,
    get defaultPrevented() {
      return prevented;
    },
    preventDefault(): void {
      options.onPrevent?.();
      if (options.preventSucceeds !== false) prevented = true;
    },
  };
}

function inputEvent(
  type: "beforeinput" | "input",
  inputType: string,
  target: EventTarget,
  cancelable: boolean,
  options: Readonly<{ onPrevent?: () => void }> = {},
): FakeCancelableEvent {
  let prevented = false;
  return {
    type,
    inputType,
    data: null,
    isComposing: false,
    target,
    cancelable,
    get defaultPrevented() {
      return prevented;
    },
    preventDefault(): void {
      options.onPrevent?.();
      if (cancelable) prevented = true;
    },
  };
}

function expectRedacted(_value: ClipboardControllerDisposition): void {
  // Compile-time assertion: dispositions expose progress, never payload data.
}

function restoreGlobalConstructor(
  name: "ClipboardEvent" | "DataTransfer",
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor === undefined) {
    Reflect.deleteProperty(globalThis, name);
  } else {
    Object.defineProperty(globalThis, name, descriptor);
  }
}

void expectRedacted;
