import type {
  WasmCommandEngineView,
  WasmCommandObservationView,
} from "./wasm_command_adapter.js";
import {
  sessionCheckpointJsonUtf8Bytes,
  type WasmSessionCheckpointErrorView,
} from "./wasm_session_checkpoint.js";

/** Restored generated engine ownership transferred to the successful caller. */
export interface WasmRestoredEngineView extends WasmCommandEngineView {
  observation(): WasmCommandObservationView;
  free(): void;
}

/** Structural subset of the generated engine-construction result. */
export interface WasmEngineRestoreResultView {
  readonly status: "engine" | "taken" | "error";
  readonly error: WasmSessionCheckpointErrorView | undefined;
  takeEngine(): WasmRestoredEngineView | undefined;
  free(): void;
}

/** Structural static factory supplied by the generated Wasm module. */
export interface WasmEngineRestoreFactoryView {
  fromSessionCheckpointJson(
    checkpointJson: string,
  ): WasmEngineRestoreResultView;
}

/** Payload-redacted engine restoration failure. */
export type BrowserWasmEngineRestoreError =
  | Readonly<{
      kind: "boundary";
      code: "engine_restore.invalid_wasm_view";
      message: "The Wasm engine-restore view is invalid.";
    }>
  | Readonly<{
      kind: "core";
      code: string;
      message: string;
    }>;

/** Exact synchronous transfer outcome for one restored generated engine. */
export type BrowserWasmEngineRestoreResult =
  | Readonly<{ ok: true; engine: WasmRestoredEngineView }>
  | Readonly<{ ok: false; error: BrowserWasmEngineRestoreError }>;

const INVALID_VIEW: BrowserWasmEngineRestoreError = Object.freeze({
  kind: "boundary",
  code: "engine_restore.invalid_wasm_view",
  message: "The Wasm engine-restore view is invalid.",
});

const OWNED_RESTORE_RESULTS = new WeakSet<object>();
const PROMISE_RESOLVE = Promise.resolve.bind(Promise);
const PROMISE_CATCH = Promise.prototype.catch;
const IGNORE_SETTLEMENT = (): undefined => undefined;

interface OwnedHandle {
  readonly value: object;
  readonly free: () => unknown;
}

interface HandleRegistry {
  readonly handles: OwnedHandle[];
  readonly seen: Set<object>;
  transferred: object | undefined;
  invalid: boolean;
}

/**
 * Strictly restores a generated engine from bounded Session Checkpoint V1 JSON.
 *
 * The input is rejected before crossing the Wasm allocation boundary when it
 * is empty, oversized, or contains unpaired UTF-16 surrogates. The generated
 * factory remains authoritative for JSON and semantic validation. On success,
 * only the engine owner is transferred; the result and cloned error handles
 * are consumed here. The function is deliberately synchronous and rejects
 * Promise/thenable impostors without awaiting or publishing their settlement.
 */
export function restoreWasmEngine(
  factory: WasmEngineRestoreFactoryView,
  checkpointJson: string,
  protectedHandles: readonly unknown[] = [],
): BrowserWasmEngineRestoreResult {
  if (
    sessionCheckpointJsonUtf8Bytes(checkpointJson) === null ||
    !objectLike(factory) ||
    containThenable(factory)
  ) {
    return boundaryFailure();
  }

  const registry: HandleRegistry = {
    handles: [],
    seen: new Set(),
    transferred: undefined,
    invalid: false,
  };
  let protectedSet: ReadonlySet<object>;
  try {
    protectedSet = objectSet([factory, ...protectedHandles]);
  } catch {
    return boundaryFailure();
  }
  let provisional: BrowserWasmEngineRestoreResult = boundaryFailure();
  try {
    const restore = factory.fromSessionCheckpointJson;
    if (valueIsThenable(restore) || typeof restore !== "function") {
      provisional = boundaryFailure();
    } else {
      const rawResult = Reflect.apply(restore, factory, [checkpointJson]) as unknown;
      provisional = readRestoreResult(rawResult, registry, protectedSet);
    }
  } catch {
    provisional = boundaryFailure();
  }

  if (freeHandlesExceptTransfer(registry)) {
    freeTransferredHandle(registry);
    return boundaryFailure();
  }
  return provisional;
}

/** Whether a result was minted by this restore module. @internal */
export function isOwnedBrowserWasmEngineRestoreResult(
  value: unknown,
): value is BrowserWasmEngineRestoreResult {
  return objectLike(value) && OWNED_RESTORE_RESULTS.has(value);
}

function readRestoreResult(
  rawResult: unknown,
  registry: HandleRegistry,
  protectedHandles: ReadonlySet<object>,
): BrowserWasmEngineRestoreResult {
  const resultCaptured = captureHandle(registry, rawResult, protectedHandles);
  if (!resultCaptured) {
    return boundaryFailure();
  }
  const result = rawResult as WasmEngineRestoreResultView;
  const status = result.status;
  if (valueIsThenable(status)) return boundaryFailure();
  const takeEngine = result.takeEngine;
  if (valueIsThenable(takeEngine) || typeof takeEngine !== "function") {
    return boundaryFailure();
  }

  // The getter clones its error. Register it before the later generated call.
  const rawError = result.error;
  const error = readOwnedError(rawError, registry, protectedHandles);
  if (registry.invalid) return boundaryFailure();

  const rawEngine = Reflect.apply(takeEngine, result, []) as unknown;
  let engineCaptured = false;
  if (rawEngine !== undefined) {
    engineCaptured = captureHandle(registry, rawEngine, protectedHandles);
  }
  if (registry.invalid) return boundaryFailure();

  if (status === "error") {
    return rawEngine === undefined && error !== null && error !== undefined
      ? ownedResult(Object.freeze({ ok: false, error }))
      : boundaryFailure();
  }
  if (
    status !== "engine" ||
    error !== undefined ||
    !engineCaptured ||
    !isRestoredEngineView(rawEngine)
  ) {
    return boundaryFailure();
  }

  registry.transferred = rawEngine;
  return ownedResult(Object.freeze({ ok: true, engine: rawEngine }));
}

function readOwnedError(
  value: unknown,
  registry: HandleRegistry,
  protectedHandles: ReadonlySet<object>,
): BrowserWasmEngineRestoreError | null | undefined {
  if (value === undefined) return undefined;
  if (objectLike(value) && protectedHandles.has(value)) {
    registry.invalid = true;
    return null;
  }
  const captured = captureHandle(registry, value, protectedHandles);
  if (!captured) {
    return null;
  }
  try {
    const error = value as WasmSessionCheckpointErrorView;
    const code = error.code;
    if (valueIsThenable(code)) return null;
    const message = error.message;
    if (valueIsThenable(message)) return null;
    if (
      typeof code !== "string" ||
      !isStableCode(code) ||
      typeof message !== "string" ||
      message.length === 0 ||
      message.length > 256
    ) {
      return null;
    }
    return Object.freeze({ kind: "core", code, message });
  } catch {
    return null;
  }
}

function isRestoredEngineView(value: unknown): value is WasmRestoredEngineView {
  if (!objectLike(value)) return false;
  const methodNames = [
    "actionStates",
    "clearSelection",
    "setRangeSelection",
    "selection",
    "executeNoInputAction",
    "executeStringAction",
    "undo",
    "redo",
    "closeHistoryGroup",
    "sessionCheckpointJson",
    "observation",
    "free",
  ] as const;
  for (const name of methodNames) {
    let method: unknown;
    try {
      method = Reflect.get(value, name, value) as unknown;
    } catch {
      return false;
    }
    if (valueIsThenable(method) || typeof method !== "function") {
      return false;
    }
  }
  return true;
}

function captureHandle(
  registry: HandleRegistry,
  value: unknown,
  protectedHandles: ReadonlySet<object>,
): value is object {
  if (!objectLike(value) || protectedHandles.has(value) || registry.seen.has(value)) {
    registry.invalid = true;
    return false;
  }
  let free: unknown;
  try {
    free = (value as { free?: unknown }).free;
  } catch {
    containThenable(value);
    registry.invalid = true;
    return false;
  }
  if (typeof free !== "function") {
    valueIsThenable(free);
    containThenable(value);
    registry.invalid = true;
    return false;
  }
  registry.seen.add(value);
  registry.handles.push({
    value,
    free: () => Reflect.apply(free, value, []),
  });
  const freeIsThenable = valueIsThenable(free);
  const handleIsThenable = containThenable(value);
  if (freeIsThenable || handleIsThenable) {
    registry.invalid = true;
    return false;
  }
  return true;
}

function freeHandlesExceptTransfer(registry: HandleRegistry): boolean {
  let failed = registry.invalid;
  for (let index = registry.handles.length - 1; index >= 0; index -= 1) {
    const handle = registry.handles[index];
    if (handle === undefined) {
      failed = true;
      continue;
    }
    if (handle.value === registry.transferred) continue;
    try {
      const returned = Reflect.apply(handle.free, handle.value, []) as unknown;
      if (returned !== undefined) {
        if (objectLike(returned)) containThenable(returned);
        failed = true;
      }
    } catch {
      failed = true;
    }
  }
  return failed;
}

function freeTransferredHandle(registry: HandleRegistry): void {
  const transferred = registry.transferred;
  if (transferred === undefined) return;
  const handle = registry.handles.find((candidate) => candidate.value === transferred);
  if (handle === undefined) return;
  try {
    const returned = Reflect.apply(handle.free, handle.value, []) as unknown;
    if (objectLike(returned)) containThenable(returned);
  } catch {
    // The boundary result is already a redacted failure.
  }
  registry.transferred = undefined;
}

function objectSet(values: readonly unknown[]): ReadonlySet<object> {
  const result = new Set<object>();
  for (const value of values) {
    if (objectLike(value)) result.add(value);
  }
  return result;
}

function ownedResult<T extends BrowserWasmEngineRestoreResult>(value: T): T {
  OWNED_RESTORE_RESULTS.add(value);
  return value;
}

function boundaryFailure(): BrowserWasmEngineRestoreResult {
  return ownedResult(Object.freeze({ ok: false, error: INVALID_VIEW }));
}

function containThenable(value: object): boolean {
  let then: unknown;
  try {
    then = (value as { then?: unknown }).then;
  } catch {
    return true;
  }
  if (then === undefined) return false;
  try {
    const assimilated = PROMISE_RESOLVE(value);
    Reflect.apply(PROMISE_CATCH, assimilated, [IGNORE_SETTLEMENT]);
  } catch {
    // The value remains invalid even if rejection containment itself fails.
  }
  return true;
}

function valueIsThenable(value: unknown): boolean {
  return objectLike(value) && containThenable(value);
}

function objectLike(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

function isStableCode(value: string): boolean {
  return (
    value.length <= 128 &&
    /^[a-z][a-z0-9._-]*(?:\/[a-z][a-z0-9._-]*)?$/u.test(value)
  );
}
