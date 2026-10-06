import { readDomKeyboardEvent } from "./dom_event_intrinsics.js";
import type { BrowserActionStateAvailability } from "./wasm_action_state_adapter.js";

/** A candidate only, never permission to cancel the native event. @internal */
export interface NestedListTabCandidate {
  readonly stateId: "breditor/control-indent-list-items" | "breditor/control-outdent-list-items";
  readonly intentId: "breditor/indent-list-items" | "breditor/outdent-list-items";
  readonly repeat: boolean;
}

const INDENT = Object.freeze({stateId: "breditor/control-indent-list-items", intentId: "breditor/indent-list-items"} as const);
const OUTDENT = Object.freeze({stateId: "breditor/control-outdent-list-items", intentId: "breditor/outdent-list-items"} as const);

/**
 * Classify only unmodified Tab or Shift-Tab with shortcuts enabled. Read native
 * event fields through the shared intrinsic boundary; caller property shadows
 * must not turn another key into a nesting command. Composition belongs to IME.
 * This helper does not read selection, query Rust, cancel events or enqueue work.
 * @internal
 */
export function nestedListTabCandidate(event: unknown, shortcutsEnabled: boolean,
  compositionActive: boolean): NestedListTabCandidate | undefined {
  if (shortcutsEnabled !== true || compositionActive !== false) return undefined;
  const key = readDomKeyboardEvent(event);
  if (key === null || key.key !== "Tab" || key.code !== "Tab" || key.isComposing ||
      key.keyCode === 229 || key.ctrlKey || key.metaKey || key.altKey || key.altGraph) return undefined;
  return Object.freeze({...(key.shiftKey ? OUTDENT : INDENT), repeat: key.repeat});
}

/**
 * Apply only a freshly queried Rust availability for the synchronized DOM
 * selection, while the caller owns admission. A cached toolbar entry is not
 * sufficient. Disabled/unhandled/faulted states never consume focus navigation.
 * Repeated enabled Tab is consumed without repeating a structural transaction.
 * @internal
 */
export function nestedListTabDecision(candidate: NestedListTabCandidate,
  availability: BrowserActionStateAvailability | undefined): "native" | "suppressRepeat" | "execute" {
  if (availability !== "enabled") return "native";
  return candidate.repeat ? "suppressRepeat" : "execute";
}
