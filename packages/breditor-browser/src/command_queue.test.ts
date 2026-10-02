import { describe, expect, it, vi } from "vitest";

import { BaseDocumentProjection } from "./projection.js";
import { BreditorDomRenderer } from "./dom_renderer.js";
import { BaseRangeSelection } from "./selection.js";
import {
  issueEditorDeliveryToken,
  noInputActionRequest,
  rangeSelectionSync,
  type EditorCommandRequest,
} from "./editor_command.js";
import {
  BreditorCommandQueue,
  openCommandQueueLeasePort,
  type CommandQueueLease,
  type CommandQueueLeasePort,
} from "./command_queue.js";

function request(detail: string): EditorCommandRequest {
  const projection = BaseDocumentProjection.create({
    schema: { name: "breditor/base", version: 1 },
    snapshot: { lineage: "queue-tests", revision: "0" },
    paragraphs: [{ runs: [] }],
  });
  if (!projection.ok) throw new Error("projection fixture failed");
  const rendered = new BreditorDomRenderer().render(document.createElement("div"), projection.value);
  if (!rendered.ok) throw new Error("render fixture failed");
  const token = issueEditorDeliveryToken(
    projection.value,
    rendered.value.rendered,
    0n,
    Symbol("queue-tests"),
  );
  const selection = BaseRangeSelection.create(projection.value, {
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
  return noInputActionRequest(
    token,
    rangeSelectionSync(selection.value),
    { kind: "api", detail },
    "breditor/delete-backward",
  );
}

describe("BreditorCommandQueue", () => {
  it.each(["absent", "changed", "invalid", "throws"])(
    "captures the observer option once (%s getter case)",
    (later) => {
      const first = vi.fn();
      const replacement = vi.fn();
      const executor = vi.fn(() => "committed");
      let reads = 0;
      const queue = new BreditorCommandQueue(executor, {
        get observer() {
          reads += 1;
          // Include explicit undefined from JavaScript callers even though
          // exactOptionalPropertyTypes asks typed callers to omit the field.
          if (reads === 1) return later === "absent" ? undefined as unknown as typeof first : first;
          if (later === "throws") throw new Error("observer should be captured once");
          if (later === "invalid" && reads > 2) return 0 as unknown as typeof first;
          return replacement;
        },
      });
      expect(queue.submit(request("one"))).toEqual({
        status: "completed", sequence: 1n, result: "committed",
      });
      expect(executor).toHaveBeenCalledOnce();
      expect(first).toHaveBeenCalledTimes(later === "absent" ? 0 : 1);
      expect(replacement).not.toHaveBeenCalled();
      expect(reads).toBe(1);
      expect(queue.failure).toBeUndefined();
      queue.dispose();
    },
  );

  it("rejects an invalid first observer value without rereading a later valid one", () => {
    const executor = vi.fn(() => "committed");
    let reads = 0;
    expect(() => new BreditorCommandQueue(executor, {
      get observer() {
        reads += 1;
        return reads === 1 ? 0 as unknown as () => void : () => {};
      },
    })).toThrow("command queue observer must be a function");
    expect(reads).toBe(1);
    expect(executor).not.toHaveBeenCalled();
  });

  it("opens the intrinsic lease port only for the constructor-captured executor", () => {
    const executor = (item: EditorCommandRequest): string => item.source.detail;
    const queue = new BreditorCommandQueue(executor);
    const foreign = (item: EditorCommandRequest): string => item.source.detail;
    const bound = executor.bind(undefined);
    let hostileReads = 0;
    const hostile = new Proxy(executor, {
      get() {
        hostileReads += 1;
        throw new Error("executor candidates must not be inspected");
      },
    });

    expect(openCommandQueueLeasePort(queue, executor)).toBeDefined();
    expect(openCommandQueueLeasePort(queue, foreign)).toBeUndefined();
    expect(openCommandQueueLeasePort(queue, bound)).toBeUndefined();
    expect(() => openCommandQueueLeasePort(queue, hostile)).not.toThrow();
    expect(openCommandQueueLeasePort(queue, hostile)).toBeUndefined();
    Object.defineProperty(queue, "usesExecutor", { value: () => true });
    expect(openCommandQueueLeasePort(queue, foreign)).toBeUndefined();
    const publicSurface = Object.getOwnPropertyNames(
      Object.getPrototypeOf(queue) as object,
    );
    expect(publicSurface).not.toContain("usesExecutor");
    expect(publicSurface).not.toContain("acquireLease");
    expect(publicSurface).not.toContain("submitLeased");
    expect(publicSurface).not.toContain("releaseLease");
    expect(publicSurface).not.toContain("drainFor");
    expect(publicSurface).not.toContain("fail");
    expect(hostileReads).toBe(0);
  });

  it("appends reentrant work and delivers it FIFO without recursive execution", () => {
    const calls: string[] = [];
    const depths: number[] = [];
    let depth = 0;
    let nestedStatus = "";
    let queue: BreditorCommandQueue<string>;
    queue = new BreditorCommandQueue((item) => {
      depth += 1;
      depths.push(depth);
      calls.push(item.source.detail);
      if (item.source.detail === "first") {
        nestedStatus = queue.submit(request("second")).status;
        queue.submit(request("third"));
      }
      depth -= 1;
      return item.source.detail;
    });

    const result = queue.submit(request("first"));
    expect(result).toEqual({ status: "completed", sequence: 1n, result: "first" });
    expect(nestedStatus).toBe("queued");
    expect(calls).toEqual(["first", "second", "third"]);
    expect(depths).toEqual([1, 1, 1]);
  });

  it("counts the active head in capacity and rejects overflow without recursion", () => {
    let nested: unknown;
    let queue: BreditorCommandQueue<void>;
    queue = new BreditorCommandQueue(
      () => {
        nested = queue.submit(request("nested"));
      },
      { capacity: 1 },
    );
    queue.submit(request("head"));
    expect(nested).toEqual({ status: "rejected", reason: "capacity" });
  });

  it("fail-stops and quarantines followers after an uncertain executor throw", () => {
    let queue: BreditorCommandQueue<void>;
    queue = new BreditorCommandQueue((item) => {
      if (item.source.detail === "head") {
        expect(queue.submit(request("follower")).status).toBe("queued");
        throw new Error("unknown publication point");
      }
    });
    const result = queue.submit(request("head"));
    expect(result).toEqual({
      status: "failed",
      failure: { code: "command_queue.executor_threw", sequence: 1n },
    });
    expect(queue.pendingCount).toBe(1);
    expect(queue.submit(request("later"))).toEqual({ status: "rejected", reason: "failed" });
    queue.dispose();
    expect(queue.pendingCount).toBe(0);
  });

  it("also fail-stops when delivery notification throws or an executor returns a Promise", () => {
    const observerFailure = new BreditorCommandQueue(() => "done", {
      observer: () => {
        throw new Error("observer failed");
      },
    });
    expect(observerFailure.submit(request("one"))).toEqual({
      status: "failed",
      failure: { code: "command_queue.observer_threw", sequence: 1n },
    });

    const asyncExecutor = new BreditorCommandQueue(
      (() => Promise.resolve("not allowed")) as unknown as () => string,
    );
    expect(asyncExecutor.submit(request("one"))).toEqual({
      status: "failed",
      failure: { code: "command_queue.executor_threw", sequence: 1n },
    });

    const asyncObserver = new BreditorCommandQueue(() => "done", {
      observer: (() => Promise.resolve()) as unknown as () => void,
    });
    expect(asyncObserver.submit(request("one"))).toEqual({
      status: "failed",
      failure: { code: "command_queue.observer_threw", sequence: 1n },
    });
  });

  it("rejects malformed runtime input and invalid capacity without invoking work", () => {
    let calls = 0;
    const queue = new BreditorCommandQueue(() => {
      calls += 1;
    });
    expect(queue.submit({} as EditorCommandRequest)).toEqual({
      status: "rejected",
      reason: "invalidRequest",
    });
    expect(calls).toBe(0);
    expect(() => new BreditorCommandQueue(() => {}, { capacity: 0 })).toThrow(RangeError);
  });

  it.each(["disposed", "leased", "failed"])("rechecks %s state after request inspection", (state) => {
    const executor = vi.fn((item: EditorCommandRequest) => {
      if (item.source.detail === "inner-failure") throw new Error("execution failed");
      return item.source.detail;
    });
    const queue = new BreditorCommandQueue(executor);
    const port = openCommandQueueLeasePort(queue, executor)!;
    let lease: CommandQueueLease | undefined;
    let inspected = false;
    const item = new Proxy(request("outer"), {
      ownKeys(target) {
        if (!inspected) {
          inspected = true;
          if (state === "disposed") queue.dispose();
          if (state === "leased") lease = port.acquireLease();
          if (state === "failed") queue.submit(request("inner-failure"));
        }
        return Reflect.ownKeys(target);
      },
    });
    expect(queue.submit(item)).toEqual({ status: "rejected", reason: state });
    expect(executor).toHaveBeenCalledTimes(state === "failed" ? 1 : 0);
    expect(queue.pendingCount).toBe(0);
    if (state === "leased") {
      expect(lease).toBeDefined();
      expect(port.releaseLease(lease!)).toBe(true);
      expect(queue.submit(request("after-release"))).toEqual({
        status: "completed", sequence: 1n, result: "after-release",
      });
    }
    queue.dispose();
  });

  it("uses its private pending count for capacity admission", () => {
    let nested: unknown;
    const executor = vi.fn((item: EditorCommandRequest) => {
      if (item.source.detail === "head") nested = queue.submit(request("nested"));
      return item.source.detail;
    });
    const queue = new BreditorCommandQueue(executor, { capacity: 1 });
    const shadow = vi.fn(() => 0);
    Object.defineProperty(queue, "pendingCount", { get: shadow });
    expect(queue.submit(request("head")).status).toBe("completed");
    expect(nested).toEqual({ status: "rejected", reason: "capacity" });
    expect(executor).toHaveBeenCalledOnce();
    expect(shadow).not.toHaveBeenCalled();
    queue.dispose();
  });

  it("preserves admission order after a request-inspection callback completes nested work", () => {
    const calls: string[] = [];
    const queue = new BreditorCommandQueue((item) => {
      calls.push(item.source.detail);
      return item.source.detail;
    });
    let inspected = false;
    const outer = new Proxy(request("outer"), {
      ownKeys(target) {
        if (!inspected) {
          inspected = true;
          expect(queue.submit(request("inner"))).toEqual({
            status: "completed", sequence: 1n, result: "inner",
          });
        }
        return Reflect.ownKeys(target);
      },
    });
    expect(queue.submit(outer)).toEqual({
      status: "completed", sequence: 2n, result: "outer",
    });
    expect(calls).toEqual(["inner", "outer"]);
    expect(queue.pendingCount).toBe(0);
    expect(queue.failure).toBeUndefined();
    queue.dispose();
  });

  it.each([
    [false, "executor"], [false, "observer"],
    [true, "executor"], [true, "observer"],
  ] as const)("contains rejected %s-leased %s promises while keeping fail-stop semantics", async (leased, source) => {
    const rejected = Promise.reject(new Error("async hook failed"));
    // Permit a clean before-fix assertion rather than an unrelated test-runner error.
    void rejected.catch(() => {});
    const then = vi.spyOn(rejected, "then");
    let queue: BreditorCommandQueue<unknown>;
    let executions = 0;
    let observations = 0;
    // Plain functions: vi.fn itself observes returned promises and would mask
    // the missing queue rejection handler that this regression exercises.
    const executor = () => {
      executions += 1;
      if (!leased) expect(queue.submit(request("follower")).status).toBe("queued");
      return source === "executor" ? rejected : "done";
    };
    const observer = () => {
      observations += 1;
      return source === "observer" ? rejected : undefined;
    };
    queue = new BreditorCommandQueue<unknown>(executor, { observer });
    const port = openCommandQueueLeasePort(queue, executor)!;
    const lease = leased ? port.acquireLease()! : undefined;
    const result = lease === undefined
      ? queue.submit(request("head"))
      : port.submitLeased(lease, request("head"));
    expect(then).toHaveBeenCalled();
    expect(result).toEqual({
      status: "failed",
      failure: { code: `command_queue.${source}_threw`, sequence: 1n },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(executions).toBe(1);
    expect(observations).toBe(source === "observer" ? 1 : 0);
    expect(queue.pendingCount).toBe(leased ? 0 : 1);
    if (lease !== undefined) expect(port.releaseLease(lease)).toBe(true);
    expect(queue.submit(request("later"))).toEqual({ status: "rejected", reason: "failed" });
    queue.dispose();
  });

  it("leases only a healthy idle queue and releases one exact capability once", () => {
    let calls = 0;
    const executor = () => {
      calls += 1;
      return "done";
    };
    const queue = new BreditorCommandQueue(executor);
    const port = openCommandQueueLeasePort(queue, executor);
    if (port === undefined) throw new Error("lease port fixture failed");
    const lease = port.acquireLease();
    expect(lease).toBeDefined();
    expect(Object.isFrozen(lease)).toBe(true);
    expect(port.acquireLease()).toBeUndefined();

    // Lease rejection precedes request validation.
    expect(queue.submit({} as EditorCommandRequest)).toEqual({
      status: "rejected",
      reason: "leased",
    });
    expect(calls).toBe(0);
    expect(port.releaseLease({} as CommandQueueLease)).toBe(false);
    expect(port.releaseLease(lease as CommandQueueLease)).toBe(true);
    expect(port.releaseLease(lease as CommandQueueLease)).toBe(false);

    expect(queue.submit(request("after-release"))).toEqual({
      status: "completed",
      sequence: 1n,
      result: "done",
    });
    expect(calls).toBe(1);
  });

  it("holds a one-use lease through executor and observer reentrancy", () => {
    let lease: CommandQueueLease;
    let executorOrdinary: unknown;
    let executorLeased: unknown;
    let executorRelease: unknown;
    let observerOrdinary: unknown;
    let observerRelease: unknown;
    const calls: string[] = [];
    let queue: BreditorCommandQueue<string>;
    let port: CommandQueueLeasePort<string>;
    const executor = (item: EditorCommandRequest): string => {
        calls.push(`execute:${item.source.detail}`);
        if (item.source.detail === "composition") {
          expect(queue.pendingCount).toBe(1);
          executorOrdinary = queue.submit(request("ordinary-from-executor"));
          executorLeased = port.submitLeased(lease, request("leased-from-executor"));
          executorRelease = port.releaseLease(lease);
        }
        return item.source.detail;
      };
    queue = new BreditorCommandQueue(
      executor,
      {
        observer: (delivery) => {
          calls.push(`observe:${delivery.request.source.detail}`);
          if (delivery.request.source.detail === "composition") {
            expect(queue.pendingCount).toBe(1);
            observerOrdinary = queue.submit(request("ordinary-from-observer"));
            observerRelease = port.releaseLease(lease);
          }
        },
      },
    );
    const opened = openCommandQueueLeasePort(queue, executor);
    if (opened === undefined) throw new Error("lease port fixture failed");
    port = opened;
    const acquired = port.acquireLease();
    if (acquired === undefined) throw new Error("lease fixture failed");
    lease = acquired;

    const result = port.submitLeased(lease, request("composition"));

    expect(result).toEqual({
      status: "completed",
      sequence: 1n,
      result: "composition",
    });
    expect(result.status).not.toBe("queued");
    expect(calls).toEqual(["execute:composition", "observe:composition"]);
    expect(executorOrdinary).toEqual({ status: "rejected", reason: "leased" });
    expect(executorLeased).toEqual({ status: "rejected", reason: "leased" });
    expect(observerOrdinary).toEqual({ status: "rejected", reason: "leased" });
    expect(executorRelease).toBe(false);
    expect(observerRelease).toBe(false);

    // The spent lease remains held until its owner explicitly closes it.
    expect(port.submitLeased(lease, request("duplicate"))).toEqual({
      status: "rejected",
      reason: "leased",
    });
    expect(queue.submit(request("still-reserved"))).toEqual({
      status: "rejected",
      reason: "leased",
    });
    expect(port.releaseLease(lease)).toBe(true);
    expect(queue.submit(request("ordinary-after"))).toMatchObject({
      status: "completed",
      sequence: 2n,
    });
  });

  it("fails closed on foreign, hostile, malformed, and spent lease submissions", () => {
    let calls = 0;
    const executor = () => {
      calls += 1;
    };
    const queue = new BreditorCommandQueue(executor);
    const port = openCommandQueueLeasePort(queue, executor);
    if (port === undefined) throw new Error("lease port fixture failed");
    const lease = port.acquireLease();
    if (lease === undefined) throw new Error("lease fixture failed");
    let reads = 0;
    const hostile = new Proxy({}, {
      ownKeys() {
        reads += 1;
        throw new Error("request must not escape as an exception");
      },
    }) as EditorCommandRequest;

    expect(() =>
      port.submitLeased({} as CommandQueueLease, hostile),
    ).not.toThrow();
    expect(port.submitLeased({} as CommandQueueLease, hostile)).toEqual({
      status: "rejected",
      reason: "leased",
    });
    expect(reads).toBe(0);

    expect(() => port.submitLeased(lease, hostile)).not.toThrow();
    expect(reads).toBe(1);
    expect(port.submitLeased(lease, request("spent"))).toEqual({
      status: "rejected",
      reason: "leased",
    });
    expect(calls).toBe(0);
    expect(port.releaseLease(lease)).toBe(true);
  });

  it("holds the lease while hostile request traps reenter queue APIs", () => {
    let calls = 0;
    let releaseDuringInspection: unknown;
    let submitDuringInspection: unknown;
    const executor = (item: EditorCommandRequest): string => {
      calls += 1;
      return item.source.detail;
    };
    const queue = new BreditorCommandQueue(executor);
    const port = openCommandQueueLeasePort(queue, executor);
    if (port === undefined) throw new Error("lease port fixture failed");
    const lease = port.acquireLease();
    if (lease === undefined) throw new Error("lease fixture failed");
    const valid = request("hostile-but-valid");
    let trapped = false;
    const reentrant = new Proxy(valid, {
      ownKeys(target) {
        if (!trapped) {
          trapped = true;
          releaseDuringInspection = port.releaseLease(lease);
          submitDuringInspection = queue.submit(request("must-not-enter"));
        }
        return Reflect.ownKeys(target);
      },
    });

    expect(port.submitLeased(lease, reentrant)).toEqual({
      status: "completed",
      sequence: 1n,
      result: "hostile-but-valid",
    });
    expect(releaseDuringInspection).toBe(false);
    expect(submitDuringInspection).toEqual({
      status: "rejected",
      reason: "leased",
    });
    expect(calls).toBe(1);
    expect(port.releaseLease(lease)).toBe(true);
  });

  it("does not acquire a lease while draining or after terminal failure", () => {
    let duringExecution: CommandQueueLease | undefined;
    let duringObserver: CommandQueueLease | undefined;
    let queue: BreditorCommandQueue<void>;
    let port: CommandQueueLeasePort<void>;
    const executor = (item: EditorCommandRequest): void => {
      duringExecution = port.acquireLease();
      if (item.source.detail === "fail") {
        throw new Error("uncertain");
      }
    };
    queue = new BreditorCommandQueue(
      executor,
      { observer: () => { duringObserver = port.acquireLease(); } },
    );
    const opened = openCommandQueueLeasePort(queue, executor);
    if (opened === undefined) throw new Error("lease port fixture failed");
    port = opened;

    expect(queue.submit(request("healthy")).status).toBe("completed");
    expect(duringExecution).toBeUndefined();
    expect(duringObserver).toBeUndefined();
    expect(queue.submit(request("fail"))).toMatchObject({ status: "failed" });
    expect(port.acquireLease()).toBeUndefined();
  });

  it("keeps a failed leased delivery reserved until explicit release", () => {
    let nested: unknown;
    let lease: CommandQueueLease;
    let queue: BreditorCommandQueue<void>;
    const executor = (): void => {
      nested = queue.submit(request("reentrant"));
      throw new Error("unknown publication point");
    };
    queue = new BreditorCommandQueue<void>(executor);
    const port = openCommandQueueLeasePort(queue, executor);
    if (port === undefined) throw new Error("lease port fixture failed");
    const acquired = port.acquireLease();
    if (acquired === undefined) throw new Error("lease fixture failed");
    lease = acquired;

    expect(port.submitLeased(lease, request("composition"))).toEqual({
      status: "failed",
      failure: { code: "command_queue.executor_threw", sequence: 1n },
    });
    expect(nested).toEqual({ status: "rejected", reason: "leased" });
    expect(queue.submit(request("before-release"))).toEqual({
      status: "rejected",
      reason: "leased",
    });
    expect(port.acquireLease()).toBeUndefined();
    expect(port.releaseLease(lease)).toBe(true);
    expect(queue.submit(request("after-release"))).toEqual({
      status: "rejected",
      reason: "failed",
    });
  });

  it("reports observer uncertainty for leased work and never retries it", () => {
    let deliveries = 0;
    const executor = () => "committed";
    const queue = new BreditorCommandQueue(executor, {
      observer: () => {
        deliveries += 1;
        throw new Error("observer failed after execution");
      },
    });
    const port = openCommandQueueLeasePort(queue, executor);
    if (port === undefined) throw new Error("lease port fixture failed");
    const lease = port.acquireLease();
    if (lease === undefined) throw new Error("lease fixture failed");

    expect(port.submitLeased(lease, request("composition"))).toEqual({
      status: "failed",
      failure: { code: "command_queue.observer_threw", sequence: 1n },
    });
    expect(deliveries).toBe(1);
    expect(port.submitLeased(lease, request("retry"))).toEqual({
      status: "rejected",
      reason: "leased",
    });
    expect(port.releaseLease(lease)).toBe(true);
    expect(port.acquireLease()).toBeUndefined();

    const asyncExecutor = () => "committed";
    const asyncObserver = new BreditorCommandQueue(asyncExecutor, {
      observer: (() => Promise.resolve()) as unknown as () => void,
    });
    const asyncPort = openCommandQueueLeasePort(asyncObserver, asyncExecutor);
    if (asyncPort === undefined) throw new Error("lease port fixture failed");
    const asyncLease = asyncPort.acquireLease();
    if (asyncLease === undefined) throw new Error("lease fixture failed");
    expect(asyncPort.submitLeased(asyncLease, request("composition"))).toEqual({
      status: "failed",
      failure: { code: "command_queue.observer_threw", sequence: 1n },
    });
    expect(asyncPort.releaseLease(asyncLease)).toBe(true);
    expect(asyncPort.acquireLease()).toBeUndefined();
  });

  it("always uses the constructor executor despite extra runtime arguments", () => {
    const constructorExecutor = vi.fn(
      (item: EditorCommandRequest) => `owned:${item.source.detail}`,
    );
    const foreignExecutor = vi.fn(() => "foreign");
    const queue = new BreditorCommandQueue(constructorExecutor);
    const port = openCommandQueueLeasePort(queue, constructorExecutor);
    if (port === undefined) throw new Error("lease port fixture failed");
    const lease = port.acquireLease();
    if (lease === undefined) throw new Error("lease fixture failed");

    const result = Reflect.apply(port.submitLeased, port, [
      lease,
      request("composition"),
      foreignExecutor,
    ]);

    expect(result).toMatchObject({
      status: "completed",
      result: "owned:composition",
    });
    expect(constructorExecutor).toHaveBeenCalledOnce();
    expect(foreignExecutor).not.toHaveBeenCalled();
    expect(port.releaseLease(lease)).toBe(true);
  });

  it("invalidates an unused lease on disposal without inspecting later input", () => {
    let calls = 0;
    const executor = () => {
      calls += 1;
    };
    const queue = new BreditorCommandQueue(executor);
    const port = openCommandQueueLeasePort(queue, executor);
    if (port === undefined) throw new Error("lease port fixture failed");
    const lease = port.acquireLease();
    if (lease === undefined) throw new Error("lease fixture failed");
    let reads = 0;
    const hostile = new Proxy({}, {
      ownKeys() {
        reads += 1;
        throw new Error("disposed queue must not inspect requests");
      },
    }) as EditorCommandRequest;

    queue.dispose();
    expect(port.submitLeased(lease, hostile)).toEqual({
      status: "rejected",
      reason: "disposed",
    });
    expect(queue.submit(hostile)).toEqual({ status: "rejected", reason: "disposed" });
    expect(reads).toBe(0);
    expect(port.releaseLease(lease)).toBe(false);
    expect(port.acquireLease()).toBeUndefined();
    expect(calls).toBe(0);
  });
});
