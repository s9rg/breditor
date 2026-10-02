/**
 * Shared, synchronous ownership reservations for document/checkpoint string
 * readers and action-state result graphs (including nested strings/errors).
 * Reserve before inspecting accessors, retain through cleanup, release
 * in finally. This is not a registry of previously freed handles. @internal
 */
export const ACTIVE_WASM_STRING_HANDLES = new WeakSet<object>();
