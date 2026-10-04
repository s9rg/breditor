/** Shared string-result ownership: reserve before getters; release after cleanup. @internal */
import { ACTIVE_WASM_STRING_HANDLES } from "./active_wasm_string_handles.js";
import { snapshotProtectedHandleArray } from "./protected_handle_snapshot.js";

const PROMISE_RESOLVE = Promise.resolve.bind(Promise);
const PROMISE_CATCH = Promise.prototype.catch;
const IGNORE_SETTLEMENT = (): undefined => undefined;

interface OwnedHandle {
  readonly value: object;
  readonly free: () => unknown;
}

export interface HandleRegistry {
  readonly root: object;
  readonly handles: OwnedHandle[];
  readonly seen: Set<object>;
  invalid: boolean;
}

export function captureHandle(
  registry: HandleRegistry,
  value: unknown,
  protectedHandles: ReadonlySet<object>,
): value is object {
  if (
    !objectLike(value) || protectedHandles.has(value) || registry.seen.has(value) ||
    (value !== registry.root && ACTIVE_WASM_STRING_HANDLES.has(value))
  ) {
    registry.invalid = true;
    return false;
  }
  // Reserve before reading cleanup, since a getter can start another read.
  registry.seen.add(value);
  ACTIVE_WASM_STRING_HANDLES.add(value);
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
  registry.handles.push({ value, free: () => Reflect.apply(free, value, []) });
  const freeIsThenable = valueIsThenable(free);
  const handleIsThenable = containThenable(value);
  if (freeIsThenable || handleIsThenable) {
    registry.invalid = true;
    return false;
  }
  return true;
}

export function freeHandles(registry: HandleRegistry): boolean {
  let failed = registry.invalid;
  for (let index = registry.handles.length - 1; index >= 0; index -= 1) {
    const handle = registry.handles[index];
    if (handle === undefined) {
      failed = true;
      continue;
    }
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

export function objectSet(values: readonly unknown[]): ReadonlySet<object> {
  const result = snapshotProtectedHandleArray(values);
  if (result === null) throw new TypeError("invalid protected-handle list");
  return result;
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
    // The value remains invalid even if rejection containment fails.
  }
  return true;
}

export function valueIsThenable(value: unknown): boolean {
  return objectLike(value) && containThenable(value);
}

export function objectLike(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}
