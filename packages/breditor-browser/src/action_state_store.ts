import {
  isOwnedBrowserActionStateReadResult,
  type BrowserActionValue,
  type BrowserActionStateEntry,
  type BrowserActionStateReadError,
  type BrowserActionStateReadResult,
  type BrowserActionStateSnapshot,
  type BrowserActionStateValue,
  type BrowserActionStateValueContract,
  type WasmActionStateReadPort,
} from "./wasm_action_state_adapter.js";

/** Maximum distinct synchronous listeners retained by one store. */
export const MAX_ACTION_STATE_STORE_LISTENERS = 1_024;

export type {
  BrowserActionValue,
  BrowserActionStateActivation,
  BrowserActionStateAvailability,
  BrowserActionStateEntry,
  BrowserActionStateSnapshot,
  BrowserActionStateValue,
  BrowserActionStateValueContract,
  WasmActionStateReadPort,
} from "./wasm_action_state_adapter.js";

/** One synchronous publication listener. */
export type ActionStateStoreListener = () => void;

/** Store-local failure which never replaces the last good snapshot. */
export type ActionStateStoreError =
  | BrowserActionStateReadError
  | Readonly<{
      kind: "store";
      code: "action_state.read_unavailable" | "action_state.invalid_transition";
      message: string;
    }>;

/**
 * Synchronously observable state of the store's relationship to its source.
 *
 * `stale` retains a last-good snapshot after a failed read. `unavailable`
 * means no good snapshot has been published yet. `disposed` is terminal and
 * retains both the last-good snapshot and most recent error, when present.
 */
export type ActionStateStoreStatus =
  | Readonly<{ status: "unavailable"; lastError: ActionStateStoreError | undefined }>
  | Readonly<{ status: "fresh"; lastError: undefined }>
  | Readonly<{ status: "stale"; lastError: ActionStateStoreError }>
  | Readonly<{
      status: "disposed";
      lastError: ActionStateStoreError | undefined;
    }>;

/** Result of one synchronous refresh attempt. */
export type ActionStateStoreRefreshResult =
  | Readonly<{
      status: "published";
      kind: "full" | "delta";
      snapshot: BrowserActionStateSnapshot;
      changedIds: readonly string[];
    }>
  | Readonly<{
      status: "unchanged";
      snapshot: BrowserActionStateSnapshot;
    }>
  | Readonly<{ status: "failed"; error: ActionStateStoreError }>
  | Readonly<{
      status: "rejected";
      reason: "refreshing" | "disposed";
    }>;

interface ListenerSlot {
  readonly listener: ActionStateStoreListener;
  references: number;
}

type StoreReadResult =
  | Extract<BrowserActionStateReadResult, Readonly<{ ok: true }>>
  | Readonly<{ ok: false; error: ActionStateStoreError }>;

const READ_UNAVAILABLE: ActionStateStoreError = Object.freeze({
  kind: "store",
  code: "action_state.read_unavailable",
  message: "The action-state source is not currently readable.",
});

const INVALID_TRANSITION: ActionStateStoreError = Object.freeze({
  kind: "store",
  code: "action_state.invalid_transition",
  message: "The action-state refresh does not follow the current snapshot.",
});

const INITIAL_STATUS: ActionStateStoreStatus = Object.freeze({
  status: "unavailable",
  lastError: undefined,
});

const FRESH_STATUS: ActionStateStoreStatus = Object.freeze({
  status: "fresh",
  lastError: undefined,
});

const NOOP_UNSUBSCRIBE = Object.freeze(() => {});

/**
 * Last-good action-state owner with bounded synchronous delivery.
 *
 * Refresh and notification never recurse. Listeners run in first-subscription
 * order, one listener failure cannot block siblings, and duplicate listener
 * registrations share one delivery slot. Engine-global refresh relation hints
 * are not treated as this store's baseline: every successful read is complete,
 * and local comparison derives duplicates and changed IDs. Invalid/core reads,
 * reentrant calls, and disposal all preserve the last published snapshot.
 * Subscribers observe both snapshot publications and status transitions.
 */
export class BreditorActionStateStore {
  readonly #read: () => unknown;
  readonly #queueObserver = (_delivery: unknown): void => {
    this.#refresh();
  };
  readonly #listeners: ListenerSlot[] = [];
  #snapshot: BrowserActionStateSnapshot | undefined;
  #status: ActionStateStoreStatus = INITIAL_STATUS;
  #refreshing = false;
  #notifying = false;
  #notificationPending = false;
  #disposed = false;

  constructor(port: WasmActionStateReadPort) {
    let read: unknown;
    try {
      read = port.read;
    } catch {
      throw new TypeError("action-state read port is invalid");
    }
    if (typeof read !== "function") {
      throw new TypeError("action-state read port is invalid");
    }
    this.#read = () => Reflect.apply(read, port, []) as unknown;
  }

  /** Last successfully published immutable snapshot, including after dispose. */
  getSnapshot(): BrowserActionStateSnapshot | undefined {
    return this.#snapshot;
  }

  /** Current immutable freshness/lifecycle status, safe to read in a listener. */
  getStatus(): ActionStateStoreStatus {
    return this.#status;
  }

  /** Whether this store has permanently stopped reading and notifying. */
  get disposed(): boolean {
    return this.#disposed;
  }

  /** Stable observer which refreshes after one successful command-queue delivery. */
  get queueObserver(): (_delivery: unknown) => void {
    return this.#queueObserver;
  }

  /** Finds one current entry by its lexically ordered action-state identity. */
  getEntry(id: string): BrowserActionStateEntry | undefined {
    const entries = this.#snapshot?.entries;
    if (entries === undefined || typeof id !== "string") return undefined;
    let low = 0;
    let high = entries.length;
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2);
      const entry = entries[middle];
      if (entry === undefined) return undefined;
      if (entry.id === id) return entry;
      if (entry.id < id) low = middle + 1;
      else high = middle;
    }
    return undefined;
  }

  /**
   * Registers one synchronous publication listener.
   *
   * Registering the same function more than once is delivery-idempotent while
   * retaining independent idempotent unsubscribe closures.
   */
  subscribe(listener: ActionStateStoreListener): () => void {
    if (typeof listener !== "function") {
      throw new TypeError("action-state listener must be a function");
    }
    if (this.#disposed) return NOOP_UNSUBSCRIBE;

    let slot = this.#listeners.find((candidate) => candidate.listener === listener);
    if (slot === undefined) {
      if (this.#listeners.length >= MAX_ACTION_STATE_STORE_LISTENERS) {
        throw new RangeError("action-state listener capacity is exhausted");
      }
      slot = { listener, references: 0 };
      this.#listeners.push(slot);
    }
    slot.references += 1;
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      slot.references -= 1;
      if (slot.references !== 0) return;
      const index = this.#listeners.indexOf(slot);
      if (index !== -1) this.#listeners.splice(index, 1);
    };
  }

  /** Reads, validates, and conditionally publishes one complete snapshot. */
  refresh(): ActionStateStoreRefreshResult {
    return this.#refresh();
  }

  #refresh(): ActionStateStoreRefreshResult {
    if (this.#disposed) return Object.freeze({ status: "rejected", reason: "disposed" });
    if (this.#refreshing) {
      return Object.freeze({ status: "rejected", reason: "refreshing" });
    }

    this.#refreshing = true;
    try {
      const readResult = this.#performRead();
      if (!readResult.ok) {
        // A hostile or failed port can dispose its owner before returning.
        // Terminal status must never be replaced by an unavailable/stale read.
        if (this.#disposed) {
          return Object.freeze({ status: "rejected", reason: "disposed" });
        }
        this.#recordFailure(readResult.error);
        return Object.freeze({ status: "failed", error: readResult.error });
      }
      // A read port can synchronously dispose its owner. The raw result has
      // already been consumed and freed, but its data must not be installed.
      if (this.#disposed) {
        return Object.freeze({ status: "rejected", reason: "disposed" });
      }

      const prior = this.#snapshot;
      if (!transitionIsValid(prior, readResult)) {
        this.#recordFailure(INVALID_TRANSITION);
        return Object.freeze({ status: "failed", error: INVALID_TRANSITION });
      }
      if (prior !== undefined && snapshotsEqual(prior, readResult.snapshot)) {
        const restoredFreshness = this.#status.status !== "fresh";
        this.#status = FRESH_STATUS;
        if (restoredFreshness) this.#notify();
        return Object.freeze({ status: "unchanged", snapshot: prior });
      }

      const changedIds = localChangedIds(prior, readResult.snapshot);
      this.#snapshot = readResult.snapshot;
      this.#status = FRESH_STATUS;
      this.#notify();
      return Object.freeze({
        status: "published",
        kind: prior === undefined ? "full" : "delta",
        snapshot: readResult.snapshot,
        changedIds,
      });
    } finally {
      this.#refreshing = false;
    }
  }

  /**
   * Stops future reads without erasing the last good snapshot.
   *
   * Current subscribers synchronously observe terminal status before their
   * subscription slots are released. Disposal during publication is deferred
   * into a second, non-recursive notification pass.
   */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#status = Object.freeze({
      status: "disposed",
      lastError: this.#status.lastError,
    });
    this.#notify();
  }

  #performRead(): StoreReadResult {
    let result: unknown;
    try {
      result = this.#read();
    } catch {
      return storeReadFailure();
    }
    if (isOwnedBrowserActionStateReadResult(result)) return result;
    containAsyncRejection(result);
    return storeReadFailure();
  }

  #recordFailure(error: ActionStateStoreError): void {
    const next: ActionStateStoreStatus = Object.freeze(
      this.#snapshot === undefined
        ? { status: "unavailable", lastError: error }
        : { status: "stale", lastError: error },
    );
    if (statusesEqual(this.#status, next)) return;
    this.#status = next;
    this.#notify();
  }

  #notify(): void {
    if (this.#notifying) {
      this.#notificationPending = true;
      return;
    }

    this.#notifying = true;
    try {
      do {
        this.#notificationPending = false;
        const listeners = this.#listeners.slice();
        for (const slot of listeners) {
          try {
            const returned = Reflect.apply(slot.listener, undefined, []) as unknown;
            containAsyncRejection(returned);
          } catch {
            // Listener-local failure never changes publication or sibling delivery.
          }
          // A listener can dispose the store. Finish the terminal transition in
          // a fresh pass so every current listener observes one coherent status.
          if (this.#notificationPending) break;
        }
      } while (this.#notificationPending);
    } finally {
      this.#notifying = false;
      if (this.#disposed) {
        this.#listeners.length = 0;
      }
    }
  }
}

function statusesEqual(
  left: ActionStateStoreStatus,
  right: ActionStateStoreStatus,
): boolean {
  return left.status === right.status && errorsEqual(left.lastError, right.lastError);
}

function errorsEqual(
  left: ActionStateStoreError | undefined,
  right: ActionStateStoreError | undefined,
): boolean {
  return (
    left === right ||
    (left !== undefined &&
      right !== undefined &&
      left.kind === right.kind &&
      left.code === right.code &&
      left.message === right.message)
  );
}

function transitionIsValid(
  prior: BrowserActionStateSnapshot | undefined,
  next: Extract<BrowserActionStateReadResult, Readonly<{ ok: true }>>,
): boolean {
  if (prior === undefined) return true;
  if (
    prior.snapshot.lineage !== next.snapshot.snapshot.lineage ||
    BigInt(next.snapshot.snapshot.revision) < BigInt(prior.snapshot.revision) ||
    !entryIdsEqual(prior.entries, next.snapshot.entries)
  ) {
    return false;
  }
  return true;
}

function localChangedIds(
  prior: BrowserActionStateSnapshot | undefined,
  next: BrowserActionStateSnapshot,
): readonly string[] {
  if (prior === undefined) {
    return Object.freeze(next.entries.map((entry) => entry.id));
  }
  return Object.freeze(
    next.entries
      .filter((entry, index) => {
        const previous = prior.entries[index];
        return previous === undefined || !entriesEqual(previous, entry);
      })
      .map((entry) => entry.id),
  );
}

function entryIdsEqual(
  left: readonly BrowserActionStateEntry[],
  right: readonly BrowserActionStateEntry[],
): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => entry.id === right[index]?.id)
  );
}

function snapshotsEqual(
  left: BrowserActionStateSnapshot,
  right: BrowserActionStateSnapshot,
): boolean {
  return (
    left.snapshot.lineage === right.snapshot.lineage &&
    left.snapshot.revision === right.snapshot.revision &&
    left.entries.length === right.entries.length &&
    left.entries.every((entry, index) => {
      const candidate = right.entries[index];
      return candidate !== undefined && entriesEqual(entry, candidate);
    })
  );
}

function entriesEqual(
  left: BrowserActionStateEntry,
  right: BrowserActionStateEntry,
): boolean {
  return (
    left.id === right.id &&
    left.availability === right.availability &&
    left.activation === right.activation &&
    left.reasonCode === right.reasonCode &&
    stateValuesEqual(left.value, right.value)
  );
}

function stateValuesEqual(
  left: BrowserActionStateEntry["value"],
  right: BrowserActionStateEntry["value"],
): boolean {
  if (left === right) return true;
  if (left === undefined || right === undefined || left.status !== right.status) return false;
  if (left.status === "unsupported" || right.status === "unsupported") {
    return left.status === "unsupported" && right.status === "unsupported";
  }
  if (!contractsEqual(left.contract, right.contract)) return false;
  if (left.status !== "uniform" || right.status !== "uniform") return true;
  return actionValuesEqual(left.value, right.value);
}

function contractsEqual(
  left: BrowserActionStateValueContract,
  right: BrowserActionStateValueContract,
): boolean {
  return left.name === right.name && left.version === right.version;
}

function actionValuesEqual(left: BrowserActionValue, right: BrowserActionValue): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left)) {
    return (
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => {
        const candidate = right[index];
        return candidate !== undefined && actionValuesEqual(value, candidate);
      })
    );
  }
  if (Array.isArray(right) || !objectLike(left) || !objectLike(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => {
      const rightKey = rightKeys[index];
      return (
        key === rightKey &&
        actionValuesEqual(
          (left as Readonly<Record<string, BrowserActionValue>>)[key] as BrowserActionValue,
          (right as Readonly<Record<string, BrowserActionValue>>)[key] as BrowserActionValue,
        )
      );
    })
  );
}

function containAsyncRejection(value: unknown): void {
  if (!objectLike(value)) return;
  try {
    const then = (value as { then?: unknown }).then;
    if (typeof then === "function") {
      void Promise.resolve(value).catch(() => {});
    }
  } catch {
    // A hostile thenable is listener-local failure too.
  }
}

function storeReadFailure(): StoreReadResult {
  return Object.freeze({ ok: false, error: READ_UNAVAILABLE });
}

function objectLike(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}
