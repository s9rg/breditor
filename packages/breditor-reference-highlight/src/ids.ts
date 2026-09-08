/**
 * Exact semantic identities owned by the reference Highlight profile.
 *
 * These names deliberately avoid Breditor's reserved `breditor/*` namespace
 * and match the reference profile exercised by the Rust and Wasm suites.
 * Changing the schema, format, or revision requires a new fingerprint-bound
 * Document V2 fixture. The action, intent, binding, and state identities are
 * separate contracts even though one compiled toggle bundle connects them.
 */
export const REFERENCE_HIGHLIGHT_IDS = Object.freeze({
  schemaName: "example/editor",
  schemaVersion: 1,
  extensionName: "example/highlight-extension",
  extensionVersion: 1,
  formatKind: "example/highlight",
  formatRevision: 7,
  actionId: "example/toggle-highlight",
  intentId: "example/toggle-highlight-intent",
  bindingId: "example/toggle-highlight-binding",
  actionStateId: "example/highlight-control",
} as const);
