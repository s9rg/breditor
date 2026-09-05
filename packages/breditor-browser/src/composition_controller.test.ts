import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BreditorCommandQueue,
  openCommandQueueLeasePort,
} from "./command_queue.js";
import {
  issueCompositionDeliveryToken,
  type CompositionDeliveryToken,
} from "./composition_delivery_token.js";
import {
  BreditorCompositionController,
  type CompositionControllerDisposition,
  type CompositionControllerNotification,
} from "./composition_controller.js";
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
    this.tasks.push({ callback });
  };

  runNext(): void {
    const task = this.tasks.shift();
    if (task === undefined) throw new Error("no scheduled task");
    task.callback();
  }

  runAll(): void {
    let remaining = 32;
    while (this.tasks.length > 0) {
      if (remaining <= 0) throw new Error("scheduled task loop");
      remaining -= 1;
      this.runNext();
    }
  }
}

interface FakeCompositionLease {
  token: CompositionDeliveryToken;
  selection: BaseRangeSelection;
  sessionId: bigint;
  domLease: DomCompositionLease | undefined;
}

class FakeAdapter {
  readonly renderer = new BreditorDomRenderer();
  readonly selectionBridge = new BreditorDomSelectionBridge();
  readonly authority = Symbol("composition-controller-test");
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
  strictRestoreThrows = false;
  strictRestoreFails = false;
  canonicalRestoreFails = false;
  openFails = false;
  commandThrows = false;
  commandStatus: "committed" | "unchanged" | "disabled" = "committed";
  restoreCalls = 0;
  recoverCalls = 0;
  openCalls = 0;
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
    const committedEventKind = request.command.kind === "control"
      ? "closeHistoryGroup" as const
      : "action" as const;
    const command = this.commandStatus === "committed"
      ? {
          status: "committed" as const,
          eventKind: committedEventKind,
          snapshot,
          render: undefined,
        }
      : this.commandStatus === "unchanged"
        ? { status: "unchanged" as const, snapshot }
        : {
            status: "disabled" as const,
            actionId: request.command.kind === "action"
              ? request.command.actionId
              : "breditor/unsupported",
            reasonCode: "breditor/not-enabled",
            activation: "inactive" as const,
            snapshot,
          };
    return Object.freeze({
      status: "delivered" as const,
      selection: Object.freeze({ status: "unchanged" as const, snapshot }),
      boundary: undefined,
      command: Object.freeze(command),
      rendered: this.rendered,
    });
  };

  constructor(readonly projection: BaseDocumentProjection) {
    this.host = document.createElement("div");
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
    return editorDeliveryTokenMatches(
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
    if (this.state !== "live") throw new TypeError("not live");
    this.epoch += 1n;
    const token = issueCompositionDeliveryToken(
      this.rendered.projection,
      this.rendered,
      selected,
      this.epoch,
      sessionId,
      this.authority,
    );
    this.lease = { token, selection: selected, sessionId, domLease: undefined };
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
    this.lease = { ...lease, token: replacement, selection: selected };
    return replacement;
  }

  openCompositionDomLease(token: CompositionDeliveryToken): boolean {
    this.openCalls += 1;
    const lease = this.requireLease(token);
    if (this.openFails) {
      this.lease = undefined;
      this.state = "reconcile";
      return false;
    }
    const domLease = this.renderer.beginCompositionDomLease(this.rendered);
    if (domLease === null) throw new TypeError("renderer refused lease");
    this.lease = { ...lease, domLease };
    return true;
  }

  restoreCompositionLease(
    token: CompositionDeliveryToken,
  ): WasmCompositionLeaseRestoreOutcome {
    this.restoreCalls += 1;
    const lease = this.requireLease(token);
    if (this.strictRestoreThrows) throw new TypeError("renderer lease superseded");
    if (this.strictRestoreFails) {
      if (lease.domLease !== undefined) {
        this.renderer.discardCompositionDomLease(lease.domLease);
      }
      this.lease = undefined;
      this.state = "reconcile";
      return Object.freeze({ ok: false, reason: "renderFailed" });
    }
    return this.finishLease(lease, false);
  }

  recoverCompositionLease(
    token: CompositionDeliveryToken,
  ): WasmCompositionLeaseRestoreOutcome {
    this.recoverCalls += 1;
    const lease = this.requireLease(token);
    return this.finishLease(lease, true);
  }

  restoreCanonicalRender(): WasmRenderReconciliationOutcome {
    if (this.state !== "live" && this.state !== "reconcile") {
      return Object.freeze({ ok: false, reason: "adapterUnavailable" });
    }
    if (this.canonicalRestoreFails) {
      this.state = "reconcile";
      return Object.freeze({ ok: false, reason: "renderFailed" });
    }
    if (this.lease?.domLease !== undefined) {
      this.renderer.discardCompositionDomLease(this.lease.domLease);
    }
    const rendered = this.renderer.render(this.host, this.projection);
    if (!rendered.ok) return Object.freeze({ ok: false, reason: "renderFailed" });
    this.rendered = rendered.value.rendered;
    this.state = "live";
    return Object.freeze({ ok: true, rendered: this.rendered });
  }

  interveneWithRender(): void {
    const rendered = this.renderer.render(this.host, this.projection);
    if (!rendered.ok) throw new Error(rendered.error.code);
    this.rendered = rendered.value.rendered;
    this.epoch += 1n;
  }

  private requireLease(token: CompositionDeliveryToken): FakeCompositionLease {
    if (this.state !== "composition" || this.lease?.token !== token) {
      throw new TypeError("foreign lease");
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
  readonly controller: BreditorCompositionController;
  readonly scheduler: TaskScheduler;
  readonly terminals: CompositionControllerNotification[];
  readonly paragraph: HTMLParagraphElement;
}

beforeEach(() => {
  document.body.replaceChildren();
  window.getSelection()?.removeAllRanges();
});

describe("BreditorCompositionController", () => {
  it("accepts W3C update-before-beforeinput order and commits Korean Unicode through one adapter delivery", () => {
    const fixture = setup(selection(1));
    expect(start(fixture).kind).toBe("native");
    expect(update(fixture, "ㅎ")).toEqual({ kind: "native", phase: "leased" });

    expect(beforeInput(fixture, "insertCompositionText", "ㅎ", targetRange(fixture, 1, 2)))
      .toEqual({ kind: "native", phase: "mutating" });
    fixture.paragraph.textContent = "a한c";
    expect(end(fixture, "한")).toEqual({ kind: "scheduled", phase: "ending" });
    fixture.scheduler.runNext();

    expect(fixture.terminals[0]?.kind).toBe("settled");
    expect(fixture.adapter.requests).toHaveLength(1);
    expect(fixture.adapter.requests[0]).toMatchObject({
      requirements: { history: "closeBefore" },
      command: {
        kind: "action",
        actionId: "breditor/insert-plain-text",
        input: { kind: "string", value: "한" },
      },
    });
    expect(fixture.controller.phase).toBe("idle");
  });

  it("starts implicitly only from beforeinput and coalesces the later compositionstart", () => {
    const fixture = setup(selection(1));
    const result = beforeInput(
      fixture,
      "insertCompositionText",
      "に",
      targetRange(fixture, 1, 1),
    );
    expect(result).toEqual({ kind: "native", phase: "mutating" });
    expect(fixture.controller.active).toBe(true);

    expect(start(fixture)).toEqual({ kind: "native", phase: "mutating" });
    fixture.paragraph.textContent = "aにbc";
    end(fixture, "に");
    fixture.scheduler.runNext();
    expect(fixture.terminals[0]?.kind).toBe("settled");
  });

  it("supports Safari-style reconversion delete aliases before compositionstart", () => {
    const fixture = setup(selection(1, 2));
    expect(beforeInput(
      fixture,
      "deleteByComposition",
      null,
      targetRange(fixture, 1, 2),
    )).toEqual({ kind: "native", phase: "mutating" });
    fixture.paragraph.textContent = "ac";
    expect(start(fixture)).toEqual({ kind: "native", phase: "mutating" });
    beforeInput(fixture, "deleteCompositionText", null, targetRange(fixture, 1, 2));
    fixture.paragraph.textContent = "aβc";
    expect(input(fixture, "insertFromComposition", "β", false)).toEqual({
      kind: "scheduled",
      phase: "ending",
    });
    fixture.scheduler.runNext();
    expect(fixture.adapter.requests[0]).toMatchObject({
      command: { actionId: "breditor/insert-plain-text", input: { value: "β" } },
    });
  });

  it("distinguishes cancellation from a noncollapsed empty deletion", () => {
    const cancelled = setup(selection(1, 2));
    start(cancelled);
    end(cancelled, "");
    cancelled.scheduler.runNext();
    expect(cancelled.terminals[0]).toMatchObject({
      kind: "settled",
      settlement: { kind: "cancelled" },
    });
    expect(cancelled.adapter.requests).toHaveLength(1);
    expect(cancelled.adapter.requests[0]).toMatchObject({
      requirements: { history: "preserve" },
      command: { kind: "control", operation: "closeHistoryGroup" },
    });

    const deleted = setup(selection(1, 2));
    start(deleted);
    beforeInput(deleted, "deleteCompositionText", null, targetRange(deleted, 1, 2));
    deleted.paragraph.textContent = "ac";
    end(deleted, "");
    deleted.scheduler.runNext();
    expect(deleted.adapter.requests[0]).toMatchObject({
      command: {
        kind: "action",
        actionId: "breditor/delete-selection",
        input: { kind: "none" },
      },
    });
  });

  it("delivers a same-text reconversion over a noncollapsed range", () => {
    const fixture = setup(selection(1, 2));
    start(fixture);
    beforeInput(fixture, "insertCompositionText", "b", targetRange(fixture, 1, 2));
    fixture.paragraph.textContent = "abc";
    end(fixture, "b");
    fixture.scheduler.runNext();

    expect(fixture.adapter.requests[0]).toMatchObject({
      command: {
        actionId: "breditor/insert-plain-text",
        input: { kind: "string", value: "b" },
      },
    });
    expect(fixture.terminals[0]?.kind).toBe("settled");
  });

  it("refines exactly once from the mapped target range", () => {
    const fixture = setup(selection(3));
    start(fixture);
    beforeInput(fixture, "insertCompositionText", "X", targetRange(fixture, 1, 2));
    fixture.paragraph.textContent = "aXc";
    end(fixture, "X");
    fixture.scheduler.runNext();

    const selected = fixture.adapter.requests[0]?.selection;
    expect(selected?.kind).toBe("range");
    if (selected?.kind === "range") {
      expect(selected.selection.anchor).toMatchObject({ utf16Offset: 1 });
      expect(selected.selection.focus).toMatchObject({ utf16Offset: 2 });
    }
  });

  it("quarantines conflicting evidence without restoring inside the native callback", () => {
    const fixture = setup(selection(1, 2));
    start(fixture);
    beforeInput(fixture, "insertCompositionText", "x", targetRange(fixture, 1, 2));
    fixture.paragraph.textContent = "ayc";
    end(fixture, "x");
    fixture.scheduler.runNext();

    expect(fixture.terminals[0]).toEqual({
      kind: "recoveryRequired",
      reason: "unexpectedMutation",
    });
    expect(fixture.controller.phase).toBe("quarantined");
    expect(fixture.adapter.state).toBe("composition");
    expect(fixture.queue.submit(fixture.adapter.requests[0] as EditorCommandRequest))
      .toMatchObject({ status: "rejected", reason: "leased" });

    fixture.scheduler.runNext();
    expect(fixture.controller.phase).toBe("idle");
    expect(fixture.adapter.state).toBe("live");
    expect(fixture.adapter.host.textContent).toBe("abc");
    expect(fixture.terminals.at(-1)?.kind).toBe("recovered");
  });

  it("lets an exit key settle synchronously and suppresses the stale settlement callback", () => {
    const fixture = setup(selection(1));
    start(fixture);
    beforeInput(fixture, "insertCompositionText", "X", targetRange(fixture, 1, 1));
    fixture.paragraph.textContent = "aXbc";
    end(fixture, "X");

    const settled = fixture.controller.handleKeyDown(keyEvent(fixture.paragraph, "Enter"));
    expect(settled.kind).toBe("settled");
    expect(fixture.controller.phase).toBe("idle");
    start(fixture);
    expect(fixture.controller.phase).toBe("leased");

    fixture.scheduler.runNext();
    expect(fixture.controller.phase).toBe("leased");
    fixture.controller.dispose();
  });

  it("suppresses one exact late terminal input echo and expires the receipt", () => {
    const fixture = completedInsertion("X");
    expect(input(fixture, "insertFromComposition", "X", false)).toEqual({
      kind: "lateInputEcho",
    });
    expect(input(fixture, "insertFromComposition", "X", false)).toEqual({
      kind: "recoveryRequired",
      reason: "orphanInput",
    });

    const expired = completedInsertion("Y");
    expired.scheduler.runNext();
    expect(input(expired, "insertFromComposition", "Y", false)).toEqual({
      kind: "recoveryRequired",
      reason: "orphanInput",
    });
  });

  it("does not suppress a late input after an intervening render generation", () => {
    const fixture = completedInsertion("X");
    fixture.adapter.interveneWithRender();
    expect(input(fixture, "insertFromComposition", "X", false)).toEqual({
      kind: "recoveryRequired",
      reason: "orphanInput",
    });
  });

  it("invalidates a late receipt when an owned ordinary edit starts", () => {
    const fixture = completedInsertion("X");
    const paragraph = fixture.adapter.host.firstElementChild;
    if (!(paragraph instanceof HTMLParagraphElement)) {
      throw new Error("ordinary edit fixture failed");
    }
    expect(fixture.controller.handleBeforeInput(inputEvent(
      "beforeinput",
      "insertText",
      "y",
      false,
      paragraph,
      [],
    ))).toEqual({ kind: "ignored", reason: "notComposition" });

    fixture.adapter.interveneWithRender();
    const renderedParagraph = fixture.adapter.host.firstElementChild;
    if (!(renderedParagraph instanceof HTMLParagraphElement)) {
      throw new Error("ordinary input fixture failed");
    }
    expect(fixture.controller.handleInput(inputEvent(
      "input",
      "insertText",
      "y",
      false,
      renderedParagraph,
      [],
    ))).toEqual({ kind: "ignored", reason: "notComposition" });
  });

  it("recovers changed blur without committing and cancels an unchanged blur", () => {
    const changed = setup(selection(1, 2));
    start(changed);
    beforeInput(changed, "insertCompositionText", "x", targetRange(changed, 1, 2));
    changed.paragraph.textContent = "axc";
    expect(changed.controller.handleBlur(basicEvent("blur", changed.adapter.host)))
      .toEqual({ kind: "scheduled", phase: "ending" });
    changed.scheduler.runNext();
    expect(changed.terminals[0]).toEqual({
      kind: "recoveryRequired",
      reason: "domReconcileFailed",
    });
    expect(changed.adapter.requests).toHaveLength(0);

    const unchanged = setup(selection(1, 2));
    start(unchanged);
    unchanged.controller.handleBlur(basicEvent("blur", unchanged.adapter.host));
    unchanged.scheduler.runNext();
    expect(unchanged.terminals[0]).toMatchObject({
      kind: "settled",
      settlement: { kind: "cancelled" },
    });
  });

  it("keeps orphan, foreign, nested, and disconnected events inert or recoverable", () => {
    const fixture = setup(selection(1));
    expect(input(fixture, "insertFromComposition", "x", false)).toEqual({
      kind: "recoveryRequired",
      reason: "orphanInput",
    });

    const outside = document.createElement("div");
    document.body.append(outside);
    expect(fixture.controller.handleCompositionEvent(
      compositionEvent("compositionstart", "", outside),
    )).toEqual({ kind: "ignored", reason: "outsideHost" });

    const button = document.createElement("button");
    fixture.paragraph.append(button);
    expect(fixture.controller.handleCompositionEvent(
      compositionEvent("compositionstart", "", button),
    )).toEqual({ kind: "ignored", reason: "nestedControl" });

    const disconnected = setup(selection(1));
    start(disconnected);
    disconnected.adapter.host.remove();
    expect(update(disconnected, "x")).toEqual({
      kind: "recoveryRequired",
      reason: "staleBase",
    });
    expect(disconnected.controller.phase).toBe("quarantined");
  });

  it("handles queue rejection, executor failure, and reentrant ordinary work", () => {
    const rejected = setup(selection(1));
    const rejectedPort = openCommandQueueLeasePort(
      rejected.queue,
      rejected.adapter.commandExecutor,
    );
    if (rejectedPort === undefined) throw new Error("lease port fixture failed");
    const external = rejectedPort.acquireLease();
    expect(external).toBeDefined();
    const rejectedStart = compositionEvent(
      "compositionstart",
      "",
      rejected.paragraph,
      true,
    );
    expect(rejected.controller.handleCompositionEvent(rejectedStart)).toEqual({
      kind: "recoveryRequired",
      reason: "queueRejected",
    });
    expect(rejectedStart.defaultPrevented).toBe(true);
    expect(rejected.controller.phase).toBe("idle");
    expect(rejectedPort.releaseLease(external as NonNullable<typeof external>)).toBe(true);

    const failed = setup(selection(1));
    failed.adapter.commandThrows = true;
    start(failed);
    beforeInput(failed, "insertCompositionText", "x", targetRange(failed, 1, 1));
    failed.paragraph.textContent = "axbc";
    end(failed, "x");
    failed.scheduler.runNext();
    expect(failed.terminals[0]).toEqual({
      kind: "recoveryRequired",
      reason: "uncertain",
    });

    const reentrant = setup(selection(1));
    let nested: ReturnType<typeof reentrant.queue.submit> | undefined;
    reentrant.adapter.onExecute = (request) => {
      nested = reentrant.queue.submit(request);
    };
    start(reentrant);
    beforeInput(reentrant, "insertCompositionText", "x", targetRange(reentrant, 1, 1));
    reentrant.paragraph.textContent = "axbc";
    end(reentrant, "x");
    reentrant.scheduler.runNext();
    expect(nested).toMatchObject({ status: "rejected", reason: "leased" });
    expect(reentrant.terminals[0]?.kind).toBe("settled");
  });

  it("rejects a foreign queue executor before acquiring any composition authority", () => {
    const selected = selection(1);
    const adapter = new FakeAdapter(selected.projection);
    adapter.selectionBridge.write(adapter.rendered, selected);
    const forwardingExecutor = (request: EditorCommandRequest) =>
      adapter.commandExecutor(request);
    const queue = new BreditorCommandQueue<WasmCommandSequenceOutcome>(
      forwardingExecutor,
    );
    expect(() => new BreditorCompositionController(
      queue,
      adapter as unknown as BreditorWasmCommandAdapter,
    )).toThrow(/must own the adapter executor/u);
    expect(adapter.state).toBe("live");
  });

  it("rejects a foreign executor despite hostile own-property queue proofs", () => {
    const selected = selection(1);
    const adapter = new FakeAdapter(selected.projection);
    adapter.selectionBridge.write(adapter.rendered, selected);
    const forwardingExecutor = (request: EditorCommandRequest) =>
      adapter.commandExecutor(request);
    const queue = new BreditorCommandQueue<WasmCommandSequenceOutcome>(
      forwardingExecutor,
    );
    const fakeAcquire = vi.fn(() => Object.freeze({}));
    const fakeSubmit = vi.fn(() => Object.freeze({
      status: "completed" as const,
      sequence: 900n,
      result: Object.freeze({}),
    }));
    const fakeRelease = vi.fn(() => true);
    Object.defineProperties(queue, {
      usesExecutor: { value: vi.fn(() => true) },
      acquireLease: { value: fakeAcquire },
      submitLeased: { value: fakeSubmit },
      releaseLease: { value: fakeRelease },
    });

    expect(() => new BreditorCompositionController(
      queue,
      adapter as unknown as BreditorWasmCommandAdapter,
    )).toThrow(/must own the adapter executor/u);
    expect(fakeAcquire).not.toHaveBeenCalled();
    expect(fakeSubmit).not.toHaveBeenCalled();
    expect(fakeRelease).not.toHaveBeenCalled();
    expect(adapter.state).toBe("live");
  });

  it("uses private queue intrinsics despite hostile subclass overrides", () => {
    class HostileQueue extends BreditorCommandQueue<WasmCommandSequenceOutcome> {
      override get failure(): never {
        throw new Error("shadowed failure getter must stay unreachable");
      }

      usesExecutor(): boolean {
        return false;
      }

      acquireLease(): never {
        throw new Error("shadowed acquire must stay unreachable");
      }

      submitLeased(): never {
        throw new Error("shadowed submit must stay unreachable");
      }

      releaseLease(): never {
        throw new Error("shadowed release must stay unreachable");
      }
    }

    const selected = selection(1);
    const adapter = new FakeAdapter(selected.projection);
    if (!adapter.selectionBridge.write(adapter.rendered, selected).ok) {
      throw new Error("selection fixture failed");
    }
    const queue = new HostileQueue(adapter.commandExecutor);
    const fixture = assembleFixture(adapter, queue);

    expect(start(fixture).kind).toBe("native");
    beforeInput(fixture, "insertCompositionText", "x", targetRange(fixture, 1, 1));
    fixture.paragraph.textContent = "axbc";
    end(fixture, "x");
    fixture.scheduler.runNext();

    expect(fixture.terminals[0]?.kind).toBe("settled");
    expect(adapter.requests).toHaveLength(1);
  });

  it("keeps a terminally failed observer delivery quarantined without stale recovery", () => {
    const fixture = setup(selection(1), () => {
      throw new Error("observer failed after commit");
    });
    const oldDelivery = fixture.adapter.deliveryToken();
    start(fixture);
    beforeInput(fixture, "insertCompositionText", "x", targetRange(fixture, 1, 1));
    fixture.paragraph.textContent = "axbc";
    end(fixture, "x");
    fixture.scheduler.runNext();

    expect(fixture.terminals[0]).toEqual({
      kind: "recoveryRequired",
      reason: "uncertain",
    });
    expect(fixture.queue.failure?.code).toBe("command_queue.observer_threw");
    expect(fixture.adapter.requests).toHaveLength(1);
    expect(fixture.adapter.acceptsDeliveryToken(oldDelivery)).toBe(false);
    expect(fixture.adapter.state).toBe("live");
    expect(fixture.adapter.host.textContent).toBe("abc");

    fixture.scheduler.runNext();
    expect(fixture.controller.phase).toBe("quarantined");
    expect(fixture.controller.active).toBe(true);
    expect(fixture.terminals.at(-1)).toEqual({
      kind: "recoveryRequired",
      reason: "uncertain",
    });
    expect(fixture.controller.dispose()).toEqual({ kind: "disposed" });
    expect(fixture.controller.phase).toBe("disposed");
    expect(fixture.queue.failure?.code).toBe("command_queue.observer_threw");
  });

  it("accepts bounded mobile composition aliases and closes false-isComposing input", () => {
    const inserted = setup(selection(1));
    start(inserted);
    expect(inserted.controller.handleBeforeInput(inputEvent(
      "beforeinput",
      "insertText",
      "📱",
      true,
      inserted.paragraph,
      [targetRange(inserted, 1, 1)],
    ))).toEqual({ kind: "native", phase: "mutating" });
    inserted.paragraph.textContent = "a📱bc";
    expect(inserted.controller.handleInput(inputEvent(
      "input",
      "insertText",
      "📱",
      false,
      inserted.paragraph,
      [],
    ))).toEqual({ kind: "scheduled", phase: "ending" });
    inserted.scheduler.runNext();
    expect(inserted.adapter.requests[0]).toMatchObject({
      command: { actionId: "breditor/insert-plain-text", input: { value: "📱" } },
    });

    const deleted = setup(selection(1, 2));
    start(deleted);
    deleted.controller.handleBeforeInput(inputEvent(
      "beforeinput",
      "deleteContentBackward",
      null,
      true,
      deleted.paragraph,
      [targetRange(deleted, 1, 2)],
    ));
    deleted.paragraph.textContent = "ac";
    deleted.controller.handleInput(inputEvent(
      "input",
      "deleteContentBackward",
      null,
      false,
      deleted.paragraph,
      [],
    ));
    deleted.scheduler.runNext();
    expect(deleted.adapter.requests[0]).toMatchObject({
      command: { actionId: "breditor/delete-selection" },
    });

    const forwardDeleted = setup(selection(1, 2));
    start(forwardDeleted);
    expect(forwardDeleted.controller.handleBeforeInput(inputEvent(
      "beforeinput",
      "deleteContentForward",
      null,
      true,
      forwardDeleted.paragraph,
      [targetRange(forwardDeleted, 1, 2)],
    ))).toEqual({ kind: "native", phase: "mutating" });
    forwardDeleted.paragraph.textContent = "ac";
    expect(forwardDeleted.controller.handleInput(inputEvent(
      "input",
      "deleteContentForward",
      null,
      false,
      forwardDeleted.paragraph,
      [],
    ))).toEqual({ kind: "scheduled", phase: "ending" });
    forwardDeleted.scheduler.runNext();
    expect(forwardDeleted.adapter.requests[0]).toMatchObject({
      command: { actionId: "breditor/delete-selection" },
    });

    const ordinary = setup(selection(1));
    expect(ordinary.controller.handleBeforeInput(inputEvent(
      "beforeinput",
      "insertText",
      "x",
      false,
      ordinary.paragraph,
      [targetRange(ordinary, 1, 1)],
    ))).toEqual({ kind: "ignored", reason: "notComposition" });
    expect(ordinary.controller.handleInput(inputEvent(
      "input",
      "insertText",
      "x",
      false,
      ordinary.paragraph,
      [],
    ))).toEqual({ kind: "ignored", reason: "notComposition" });
    expect(ordinary.controller.handleInput(inputEvent(
      "input",
      "deleteContentBackward",
      null,
      false,
      ordinary.paragraph,
      [],
    ))).toEqual({ kind: "ignored", reason: "notComposition" });
  });

  it("quarantines hostile active ownership instead of treating it as outside", () => {
    const fixture = setup(selection(1));
    start(fixture);
    const hostile = new Proxy({} as EventTarget, {
      get() {
        throw new Error("hostile target");
      },
    });
    expect(fixture.controller.handleCompositionEvent(
      compositionEvent("compositionupdate", "x", hostile),
    )).toEqual({ kind: "recoveryRequired", reason: "invalidEvent" });
    expect(fixture.controller.phase).toBe("quarantined");
  });

  it("rejects a cross-paragraph target before opening native DOM ownership", () => {
    const documentProjection = projectionWithParagraphs(["ab", "cd"]);
    const selected = selectionForProjection(documentProjection, 0, 1, 1);
    const fixture = setup(selected);
    start(fixture);
    const first = fixture.adapter.host.children[0]?.firstChild;
    const second = fixture.adapter.host.children[1]?.firstChild;
    if (!(first instanceof Text) || !(second instanceof Text)) {
      throw new Error("cross-paragraph fixture failed");
    }
    const range = document.createRange();
    range.setStart(first, 1);
    range.setEnd(second, 1);
    const event = inputEvent(
      "beforeinput",
      "insertCompositionText",
      "x",
      true,
      fixture.paragraph,
      [range],
    );

    expect(fixture.controller.handleBeforeInput(event)).toEqual({
      kind: "recoveryRequired",
      reason: "targetInvalid",
    });
    expect(event.defaultPrevented).toBe(true);
    expect(fixture.adapter.openCalls).toBe(0);
    expect(fixture.adapter.rendered.current).toBe(true);
  });

  it("treats a completed but unchanged Rust action as controlled recovery", () => {
    const fixture = setup(selection(1));
    fixture.adapter.commandStatus = "unchanged";
    start(fixture);
    beforeInput(fixture, "insertCompositionText", "x", targetRange(fixture, 1, 1));
    fixture.paragraph.textContent = "axbc";
    end(fixture, "x");
    fixture.scheduler.runNext();
    expect(fixture.terminals[0]).toEqual({
      kind: "recoveryRequired",
      reason: "uncertain",
    });
    expect(fixture.controller.phase).toBe("quarantined");
  });

  it("uses adapter recovery after strict renderer-lease proof is lost", () => {
    const fixture = setup(selection(1));
    start(fixture);
    beforeInput(fixture, "insertCompositionText", "x", targetRange(fixture, 1, 1));
    fixture.paragraph.textContent = "axbc";
    fixture.adapter.strictRestoreThrows = true;
    end(fixture, "x");
    fixture.scheduler.runNext();
    expect(fixture.terminals[0]).toEqual({
      kind: "recoveryRequired",
      reason: "staleBase",
    });
    expect(fixture.adapter.recoverCalls).toBe(0);
    fixture.scheduler.runNext();
    expect(fixture.adapter.recoverCalls).toBe(1);
    expect(fixture.controller.phase).toBe("idle");
  });

  it("prevents a cancelable invalid beforeinput and defers restoration", () => {
    const fixture = setup(selection(1));
    start(fixture);
    const malformed = inputEvent(
      "beforeinput",
      "insertCompositionText",
      "x",
      true,
      fixture.paragraph,
      [],
    );
    const result = fixture.controller.handleBeforeInput(malformed);
    expect(result).toEqual({ kind: "recoveryRequired", reason: "targetUnavailable" });
    expect(malformed.defaultPrevented).toBe(true);
    expect(fixture.adapter.state).toBe("composition");
    fixture.scheduler.runNext();
    expect(fixture.adapter.state).toBe("live");
  });

  it("dispose and manual recovery restore DOM and release the exact lease", () => {
    const disposed = setup(selection(1));
    start(disposed);
    beforeInput(disposed, "insertCompositionText", "x", targetRange(disposed, 1, 1));
    disposed.paragraph.textContent = "axbc";
    expect(disposed.controller.dispose()).toEqual({ kind: "disposed" });
    expect(disposed.controller.phase).toBe("disposed");
    expect(disposed.adapter.host.textContent).toBe("abc");

    const recovered = setup(selection(1));
    start(recovered);
    const bad = inputEvent(
      "beforeinput",
      "insertCompositionText",
      "x",
      false,
      recovered.paragraph,
      [],
    );
    recovered.controller.handleBeforeInput(bad);
    expect(recovered.controller.recover().kind).toBe("recovered");
    expect(recovered.controller.phase).toBe("idle");
  });

  it("rejects a synchronous scheduler without settling inside the event callback", () => {
    const documentSelection = selection(1);
    const adapter = new FakeAdapter(documentSelection.projection);
    adapter.selectionBridge.write(adapter.rendered, documentSelection);
    const queue = new BreditorCommandQueue<WasmCommandSequenceOutcome>(
      adapter.commandExecutor,
    );
    const controller = new BreditorCompositionController(
      queue,
      adapter as unknown as BreditorWasmCommandAdapter,
      { scheduleTask: (callback) => callback() },
    );
    const paragraph = adapter.host.firstElementChild as HTMLParagraphElement;
    controller.handleCompositionEvent(compositionEvent("compositionstart", "", paragraph));
    controller.handleBeforeInput(inputEvent(
      "beforeinput",
      "insertCompositionText",
      "x",
      true,
      paragraph,
      [domRange(paragraph, 1, 1)],
    ));
    paragraph.textContent = "axbc";

    expect(controller.handleCompositionEvent(
      compositionEvent("compositionend", "x", paragraph),
    )).toEqual({ kind: "recoveryRequired", reason: "uncertain" });
    expect(controller.phase).toBe("quarantined");
    expect(adapter.state).toBe("composition");
    expect(controller.recover().kind).toBe("recovered");
  });

  it("retains quarantine and the queue lease until failed disposal can recover", () => {
    const fixture = setup(selection(1));
    start(fixture);
    beforeInput(fixture, "insertCompositionText", "x", targetRange(fixture, 1, 1));
    fixture.paragraph.textContent = "axbc";
    fixture.adapter.strictRestoreFails = true;
    fixture.adapter.canonicalRestoreFails = true;

    expect(fixture.controller.dispose()).toEqual({
      kind: "recoveryRequired",
      reason: "uncertain",
    });
    expect(fixture.controller.phase).toBe("quarantined");
    expect(fixture.queue.submit({} as EditorCommandRequest)).toMatchObject({
      status: "rejected",
      reason: "leased",
    });

    fixture.adapter.canonicalRestoreFails = false;
    expect(fixture.controller.recover().kind).toBe("recovered");
    expect(fixture.controller.phase).toBe("idle");
  });
});

function setup(
  initialSelection: BaseRangeSelection,
  observer?: () => void,
): Fixture {
  const adapter = new FakeAdapter(initialSelection.projection);
  if (!adapter.selectionBridge.write(adapter.rendered, initialSelection).ok) {
    throw new Error("selection fixture failed");
  }
  const queue = new BreditorCommandQueue<WasmCommandSequenceOutcome>(
    adapter.commandExecutor,
    observer === undefined ? {} : { observer },
  );
  return assembleFixture(adapter, queue);
}

function assembleFixture(
  adapter: FakeAdapter,
  queue: BreditorCommandQueue<WasmCommandSequenceOutcome>,
): Fixture {
  const scheduler = new TaskScheduler();
  const terminals: CompositionControllerNotification[] = [];
  const controller = new BreditorCompositionController(
    queue,
    adapter as unknown as BreditorWasmCommandAdapter,
    {
      scheduleTask: scheduler.schedule,
      onSettlement: (terminal) => terminals.push(terminal),
    },
  );
  const paragraph = adapter.host.firstElementChild;
  if (!(paragraph instanceof HTMLParagraphElement)) {
    throw new Error("paragraph fixture failed");
  }
  return {
    adapter,
    queue,
    controller,
    scheduler,
    terminals,
    paragraph,
  };
}

function projection(): BaseDocumentProjection {
  return projectionWithParagraphs(["abc"]);
}

function projectionWithParagraphs(texts: readonly string[]): BaseDocumentProjection {
  const projected = BaseDocumentProjection.create({
    schema: { name: "breditor/base", version: 1 },
    snapshot: { lineage: "composition-controller", revision: "1" },
    paragraphs: texts.map((text) => ({
      runs: [{ text, strong: false }],
    })),
  });
  if (!projected.ok) throw new Error(projected.error.code);
  return projected.value;
}

function selection(start: number, end = start): BaseRangeSelection {
  const documentProjection = projection();
  return selectionForProjection(documentProjection, 0, start, end);
}

function selectionForProjection(
  documentProjection: BaseDocumentProjection,
  paragraphIndex: number,
  start: number,
  end = start,
): BaseRangeSelection {
  const selected = BaseRangeSelection.create(documentProjection, {
    kind: "range",
    anchor: {
      kind: "text",
      textPath: [paragraphIndex, 0],
      utf16Offset: start,
      affinity: "before",
    },
    focus: {
      kind: "text",
      textPath: [paragraphIndex, 0],
      utf16Offset: end,
      affinity: "before",
    },
  });
  if (!selected.ok) throw new Error(selected.error.code);
  return selected.value;
}

function start(fixture: Fixture): CompositionControllerDisposition {
  return fixture.controller.handleCompositionEvent(
    compositionEvent("compositionstart", "", currentParagraph(fixture)),
  );
}

function update(fixture: Fixture, data: string): CompositionControllerDisposition {
  return fixture.controller.handleCompositionEvent(
    compositionEvent("compositionupdate", data, currentParagraph(fixture)),
  );
}

function end(fixture: Fixture, data: string): CompositionControllerDisposition {
  return fixture.controller.handleCompositionEvent(
    compositionEvent("compositionend", data, currentParagraph(fixture)),
  );
}

function beforeInput(
  fixture: Fixture,
  inputType: string,
  data: string | null,
  range: AbstractRange,
): CompositionControllerDisposition {
  return fixture.controller.handleBeforeInput(
    inputEvent(
      "beforeinput",
      inputType,
      data,
      true,
      fixture.paragraph,
      [range],
    ),
  );
}

function input(
  fixture: Fixture,
  inputType: string,
  data: string | null,
  isComposing: boolean,
): CompositionControllerDisposition {
  return fixture.controller.handleInput(
    inputEvent(
      "input",
      inputType,
      data,
      isComposing,
      fixture.adapter.host,
      [],
    ),
  );
}

function completedInsertion(text: string): Fixture {
  const fixture = setup(selection(1));
  start(fixture);
  beforeInput(fixture, "insertCompositionText", text, targetRange(fixture, 1, 1));
  fixture.paragraph.textContent = `a${text}bc`;
  end(fixture, text);
  fixture.scheduler.runNext();
  return fixture;
}

function targetRange(fixture: Fixture, start: number, end: number): Range {
  return domRange(currentParagraph(fixture), start, end);
}

function domRange(paragraph: HTMLParagraphElement, start: number, end: number): Range {
  const text = paragraph.firstChild;
  if (!(text instanceof Text)) throw new Error("text fixture failed");
  const range = document.createRange();
  range.setStart(text, start);
  range.setEnd(text, end);
  return range;
}

function currentParagraph(fixture: Fixture): HTMLParagraphElement {
  const paragraph = fixture.adapter.host.firstElementChild;
  if (!(paragraph instanceof HTMLParagraphElement)) {
    throw new Error("current paragraph fixture failed");
  }
  return paragraph;
}

function compositionEvent(
  type: "compositionstart" | "compositionupdate" | "compositionend",
  data: string,
  target: EventTarget,
  cancelable = false,
): {
  readonly type: "compositionstart" | "compositionupdate" | "compositionend";
  readonly data: string;
  readonly target: EventTarget;
  readonly cancelable: boolean;
  defaultPrevented: boolean;
  readonly preventDefault: () => void;
} {
  const event = {
    type,
    data,
    target,
    cancelable,
    defaultPrevented: false,
    preventDefault: () => {
      event.defaultPrevented = true;
    },
  };
  return event;
}

function inputEvent(
  type: "beforeinput" | "input",
  inputType: string,
  data: string | null,
  isComposing: boolean,
  target: EventTarget,
  ranges: AbstractRange[],
): {
  readonly type: "beforeinput" | "input";
  readonly inputType: string;
  readonly data: string | null;
  readonly isComposing: boolean;
  readonly target: EventTarget;
  readonly cancelable: boolean;
  defaultPrevented: boolean;
  readonly getTargetRanges: () => AbstractRange[];
  readonly preventDefault: () => void;
} {
  const event = {
    type,
    inputType,
    data,
    isComposing,
    target,
    cancelable: type === "beforeinput",
    defaultPrevented: false,
    getTargetRanges: () => ranges,
    preventDefault: () => {
      event.defaultPrevented = true;
    },
  };
  return event;
}

function keyEvent(target: EventTarget, key: string): Readonly<Record<string, unknown>> {
  return Object.freeze({
    type: "keydown",
    target,
    key,
    code: key,
    isComposing: false,
    keyCode: 13,
    defaultPrevented: false,
  });
}

function basicEvent(
  type: "blur",
  target: EventTarget,
): Readonly<Record<string, unknown>> {
  return Object.freeze({ type, target, defaultPrevented: false });
}
