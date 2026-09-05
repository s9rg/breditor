import {
  canonicalEditorCommandRequest,
  type EditorCommandRequest,
} from "./editor_command.js";

/** Default and maximum retained work bounds for one editor queue. */
export const DEFAULT_COMMAND_QUEUE_CAPACITY = 256;
export const MAX_COMMAND_QUEUE_CAPACITY = 4_096;

/** Stable, payload-free reason why a queue stopped. */
export type CommandQueueFailureCode =
  | "command_queue.executor_threw"
  | "command_queue.observer_threw";

/** Terminal uncertainty marker. A failed queue never resumes or replays its head. */
export interface CommandQueueFailure {
  readonly code: CommandQueueFailureCode;
  readonly sequence: bigint;
}

/** One successful executor return in exact FIFO order. */
export interface CommandQueueDelivery<TResult> {
  readonly sequence: bigint;
  readonly request: EditorCommandRequest;
  readonly result: TResult;
}

/** Synchronous semantic command executor. It must not return a Promise. */
export type EditorCommandExecutor<TResult> = (
  request: EditorCommandRequest,
) => TResult;

/** Optional delivery observer, invoked inside the same non-recursive drain. */
export type CommandQueueObserver<TResult> = (
  delivery: Readonly<CommandQueueDelivery<TResult>>,
) => void;

/** Result of submitting one item to the serial queue. */
export type CommandQueueSubmission<TResult> =
  | Readonly<{ status: "completed"; sequence: bigint; result: TResult }>
  | Readonly<{ status: "queued"; sequence: bigint }>
  | Readonly<{
      status: "rejected";
      reason: "invalidRequest" | "capacity" | "failed" | "disposed" | "leased";
    }>
  | Readonly<{ status: "failed"; failure: CommandQueueFailure }>;

declare const COMMAND_QUEUE_LEASE_BRAND: unique symbol;

/**
 * Opaque one-item reservation used by package-owned composition coordination.
 *
 * @internal
 */
export interface CommandQueueLease {
  /** Prevents structural construction outside this module. */
  readonly [COMMAND_QUEUE_LEASE_BRAND]: true;
}

/** A leased delivery can complete, reject, or fail, but can never queue. @internal */
export type CommandQueueLeasedSubmission<TResult> = Exclude<
  CommandQueueSubmission<TResult>,
  Readonly<{ status: "queued"; sequence: bigint }>
>;

/**
 * Non-overridable access to one queue's composition reservation machinery.
 *
 * The port is created only after checking the constructor-captured executor
 * through the queue's private state. Its closures bypass public instance
 * dispatch, so an own property or subclass override cannot impersonate queue
 * ownership or fabricate a leased delivery.
 *
 * @internal
 */
export interface CommandQueueLeasePort<TResult> {
  readonly failure: () => CommandQueueFailure | undefined;
  readonly acquireLease: () => CommandQueueLease | undefined;
  readonly submitLeased: (
    lease: CommandQueueLease,
    request: EditorCommandRequest,
  ) => CommandQueueLeasedSubmission<TResult>;
  readonly releaseLease: (lease: CommandQueueLease) => boolean;
}

type OpenCommandQueueLeasePort = <TResult>(
  queue: BreditorCommandQueue<TResult>,
  executor: unknown,
) => CommandQueueLeasePort<TResult> | undefined;

let openCommandQueueLeasePortIntrinsic: OpenCommandQueueLeasePort = () => undefined;

interface PendingCommand {
  readonly sequence: bigint;
  readonly request: EditorCommandRequest;
}

class OwnedCommandQueueLease implements CommandQueueLease {
  declare readonly [COMMAND_QUEUE_LEASE_BRAND]: true;

  constructor() {
    Object.freeze(this);
  }
}

Object.freeze(OwnedCommandQueueLease.prototype);

/**
 * Bounded synchronous FIFO with explicit reentrancy and uncertainty semantics.
 *
 * Reentrant submissions append and return `queued`; they never invoke the
 * executor recursively. If execution or delivery notification throws, the
 * current item is considered uncertain, later items remain quarantined, and
 * every later submission rejects until this queue is disposed.
 */
export class BreditorCommandQueue<TResult> {
  readonly #capacity: number;
  readonly #executor: EditorCommandExecutor<TResult>;
  readonly #observer: CommandQueueObserver<TResult> | undefined;
  readonly #pending: PendingCommand[] = [];
  #draining = false;
  #disposed = false;
  #failure: CommandQueueFailure | undefined;
  #nextSequence = 1n;
  #lease: CommandQueueLease | undefined;
  #leaseUsed = false;
  #leaseSubmitting = false;

  static {
    openCommandQueueLeasePortIntrinsic = <TResult>(
      queue: BreditorCommandQueue<TResult>,
      executor: unknown,
    ): CommandQueueLeasePort<TResult> | undefined => {
      try {
        if (queue.#executor !== executor) return undefined;
        return Object.freeze({
          failure: () => queue.#failure,
          acquireLease: () => queue.#acquireLease(),
          submitLeased: (
            lease: CommandQueueLease,
            request: EditorCommandRequest,
          ) => queue.#submitLeased(lease, request),
          releaseLease: (lease: CommandQueueLease) => queue.#releaseLease(lease),
        });
      } catch {
        return undefined;
      }
    };
  }

  constructor(
    executor: EditorCommandExecutor<TResult>,
    options: Readonly<{
      capacity?: number;
      observer?: CommandQueueObserver<TResult>;
    }> = {},
  ) {
    if (typeof executor !== "function") {
      throw new TypeError("command queue executor must be a function");
    }
    const capacity = options.capacity ?? DEFAULT_COMMAND_QUEUE_CAPACITY;
    if (
      !Number.isSafeInteger(capacity) ||
      capacity < 1 ||
      capacity > MAX_COMMAND_QUEUE_CAPACITY
    ) {
      throw new RangeError("command queue capacity is outside its fixed bounds");
    }
    if (options.observer !== undefined && typeof options.observer !== "function") {
      throw new TypeError("command queue observer must be a function");
    }
    this.#capacity = capacity;
    this.#executor = executor;
    this.#observer = options.observer;
  }

  /** Maximum active-plus-pending work accepted by this queue. */
  get capacity(): number {
    return this.#capacity;
  }

  /** Number of accepted items not yet known to have completed delivery. */
  get pendingCount(): number {
    return this.#pending.length + (this.#draining ? 1 : 0);
  }

  /** Terminal uncertainty, if execution or its notification threw. */
  get failure(): CommandQueueFailure | undefined {
    return this.#failure;
  }

  /** Whether this queue has been explicitly disposed. */
  get disposed(): boolean {
    return this.#disposed;
  }

  /**
   * Admits and synchronously drains one request when called from outside a drain.
   *
   * A reentrant call appends only. Capacity includes the currently executing
   * item, so a capacity of one rejects every reentrant submission.
   */
  submit(request: EditorCommandRequest): CommandQueueSubmission<TResult> {
    if (this.#disposed) {
      return rejected("disposed");
    }
    // A composition lease reserves the executor before touching an untrusted
    // request. Toolbar, API, and reentrant observer work therefore cannot
    // reach a temporarily leased adapter.
    if (this.#lease !== undefined) {
      return rejected("leased");
    }
    if (this.#failure !== undefined) {
      return rejected("failed");
    }

    let canonical: EditorCommandRequest | null;
    try {
      canonical = canonicalEditorCommandRequest(request);
    } catch {
      canonical = null;
    }
    if (canonical === null) {
      return rejected("invalidRequest");
    }
    if (this.pendingCount >= this.#capacity) {
      return rejected("capacity");
    }

    const sequence = this.#nextSequence;
    this.#nextSequence += 1n;
    this.#pending.push(Object.freeze({ sequence, request: canonical }));
    if (this.#draining) {
      return Object.freeze({ status: "queued", sequence });
    }
    return this.#drainFor(sequence);
  }

  #acquireLease(): CommandQueueLease | undefined {
    if (
      this.#disposed ||
      this.#failure !== undefined ||
      this.#draining ||
      this.#pending.length !== 0 ||
      this.#lease !== undefined
    ) {
      return undefined;
    }
    const lease = new OwnedCommandQueueLease();
    this.#lease = lease;
    this.#leaseUsed = false;
    return lease;
  }

  #submitLeased(
    lease: CommandQueueLease,
    request: EditorCommandRequest,
  ): CommandQueueLeasedSubmission<TResult> {
    if (this.#disposed) {
      return leasedRejected("disposed");
    }
    if (
      this.#lease !== lease ||
      this.#leaseUsed ||
      this.#draining ||
      this.#pending.length !== 0
    ) {
      return leasedRejected("leased");
    }
    if (this.#failure !== undefined) {
      return leasedRejected("failed");
    }

    // Spend before inspecting caller-controlled request structure. A malformed
    // request cannot make the same composition settlement retryable.
    this.#leaseUsed = true;
    this.#leaseSubmitting = true;
    try {
      let canonical: EditorCommandRequest | null;
      try {
        canonical = canonicalEditorCommandRequest(request);
      } catch {
        canonical = null;
      }
      if (canonical === null) {
        return leasedRejected("invalidRequest");
      }
      // Disposal is allowed from arbitrary application callbacks and
      // invalidates the lease. Never publish work admitted after such a trap.
      if (this.#disposed || this.#lease !== lease) {
        return leasedRejected(this.#disposed ? "disposed" : "leased");
      }

      const sequence = this.#nextSequence;
      this.#nextSequence += 1n;
      this.#draining = true;
      let result: TResult;
      try {
        result = this.#executor(canonical);
        if (isPromiseLike(result)) {
          throw new TypeError("command queue executors must be synchronous");
        }
      } catch {
        const failure = this.#fail("command_queue.executor_threw", sequence);
        return Object.freeze({ status: "failed", failure });
      } finally {
        this.#draining = false;
      }

      if (this.#observer !== undefined) {
        this.#draining = true;
        try {
          const observed = this.#observer(
            Object.freeze({ sequence, request: canonical, result }),
          );
          if (isPromiseLike(observed)) {
            throw new TypeError("command queue observers must be synchronous");
          }
        } catch {
          const failure = this.#fail("command_queue.observer_threw", sequence);
          return Object.freeze({ status: "failed", failure });
        } finally {
          this.#draining = false;
        }
      }
      return Object.freeze({ status: "completed", sequence, result });
    } finally {
      this.#leaseSubmitting = false;
    }
  }

  #releaseLease(lease: CommandQueueLease): boolean {
    if (
      this.#disposed ||
      this.#draining ||
      this.#leaseSubmitting ||
      this.#lease !== lease
    ) {
      return false;
    }
    this.#lease = undefined;
    this.#leaseUsed = false;
    this.#leaseSubmitting = false;
    return true;
  }

  /**
   * Permanently stops the queue and forgets quarantined command payloads.
   *
   * Disposal is not acknowledgement, retry, or proof of whether a failed head
   * mutated the engine. A new integration must reconcile independently.
   */
  dispose(): void {
    this.#disposed = true;
    this.#pending.splice(0, this.#pending.length);
    this.#lease = undefined;
    this.#leaseUsed = false;
    this.#leaseSubmitting = false;
  }

  #drainFor(primarySequence: bigint): CommandQueueSubmission<TResult> {
    this.#draining = true;
    let primaryResult: TResult | undefined;
    let primaryCompleted = false;
    try {
      while (this.#pending.length > 0 && this.#failure === undefined) {
        const pending = this.#pending.shift();
        if (pending === undefined) {
          break;
        }
        let result: TResult;
        try {
          result = this.#executor(pending.request);
          if (isPromiseLike(result)) {
            throw new TypeError("command queue executors must be synchronous");
          }
        } catch {
          this.#fail("command_queue.executor_threw", pending.sequence);
          break;
        }
        if (pending.sequence === primarySequence) {
          primaryResult = result;
          primaryCompleted = true;
        }
        if (this.#observer !== undefined) {
          try {
            const observed = this.#observer(
              Object.freeze({
                sequence: pending.sequence,
                request: pending.request,
                result,
              }),
            );
            if (isPromiseLike(observed)) {
              throw new TypeError("command queue observers must be synchronous");
            }
          } catch {
            this.#fail("command_queue.observer_threw", pending.sequence);
          }
        }
      }
    } finally {
      this.#draining = false;
    }
    if (this.#failure !== undefined) {
      return Object.freeze({ status: "failed", failure: this.#failure });
    }
    if (!primaryCompleted) {
      return rejected("failed");
    }
    return Object.freeze({
      status: "completed",
      sequence: primarySequence,
      result: primaryResult as TResult,
    });
  }

  #fail(code: CommandQueueFailureCode, sequence: bigint): CommandQueueFailure {
    const failure = Object.freeze({ code, sequence });
    this.#failure = failure;
    return failure;
  }
}

/**
 * Opens the package-owned lease port only for the exact constructor executor.
 *
 * This is total for foreign objects and hostile proxies and never consults a
 * dynamically dispatched queue property.
 *
 * @internal
 */
export function openCommandQueueLeasePort<TResult>(
  queue: BreditorCommandQueue<TResult>,
  executor: unknown,
): CommandQueueLeasePort<TResult> | undefined {
  return openCommandQueueLeasePortIntrinsic(queue, executor);
}

function rejected<TResult>(
  reason: "invalidRequest" | "capacity" | "failed" | "disposed" | "leased",
): CommandQueueSubmission<TResult> {
  return Object.freeze({ status: "rejected", reason });
}

function leasedRejected<TResult>(
  reason: "invalidRequest" | "capacity" | "failed" | "disposed" | "leased",
): CommandQueueLeasedSubmission<TResult> {
  return Object.freeze({ status: "rejected", reason });
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  if ((typeof value !== "object" || value === null) && typeof value !== "function") {
    return false;
  }
  try {
    return typeof (value as { then?: unknown }).then === "function";
  } catch {
    return true;
  }
}
