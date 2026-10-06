import { BreditorNestedListCommandQueue, openNestedListCommandQueueLeasePort } from "./command_queue.js";
import { BreditorNestedListWasmCommandAdapter, type WasmCommandSequenceOutcome } from "./wasm_command_adapter.js";
import { BreditorNestedListDomSelectionBridge } from "./dom_selection.js";
import { nestedListCommandRequest, nestedListRangeSelectionSync } from "./editor_command.js";
import { readDomEventBase, preventDomEventDefault } from "./dom_event_intrinsics.js";
import { classifyDomEventOwnership } from "./dom_event_ownership.js";
import { nestedListTabCandidate, nestedListTabDecision } from "./nested_list_tab_policy.js";
import { isOwnedBrowserActionStateReadResult } from "./wasm_action_state_adapter.js";
import type { NestedListDocumentProjection } from "./nested_list_projection.js";

const PROTOTYPE = BreditorNestedListWasmCommandAdapter.prototype;
const EXECUTOR = Object.getOwnPropertyDescriptor(PROTOTYPE, "commandExecutor")!.get!;
const BRIDGE = Object.getOwnPropertyDescriptor(PROTOTYPE, "selectionBridge")!.get!;
const READ_PORT = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(PROTOTYPE), "actionStateReadPort")!.get!;
const DELIVERY = PROTOTYPE.deliveryToken;
const ACCEPTS = PROTOTYPE.acceptsDeliveryToken;
const READ_SELECTION = BreditorNestedListDomSelectionBridge.prototype.read;

/**
 * Private immediate Tab path. Synchronize the actual DOM selection under one
 * queue lease, then acquire a fresh lease for availability/cancellation/delivery.
 * Leases reject reentrant work; no Tab request may be queued for later execution.
 * Rust, not browser topology guesses or cached toolbar state, decides availability.
 * @internal
 */
export function createNestedListTabController(
  queue: BreditorNestedListCommandQueue<WasmCommandSequenceOutcome<NestedListDocumentProjection>>,
  adapter: BreditorNestedListWasmCommandAdapter,
  shortcutsEnabled: boolean,
  live: () => boolean,
): Readonly<{handle(event: Event): "native" | "handled" | "failed"}> {
  const executor = Reflect.apply(EXECUTOR, adapter, []) as BreditorNestedListWasmCommandAdapter["commandExecutor"];
  const port = openNestedListCommandQueueLeasePort(queue, executor);
  if (port === undefined) throw new TypeError("Tab queue and adapter must have the same owner");
  const bridge = Reflect.apply(BRIDGE, adapter, []) as BreditorNestedListDomSelectionBridge;
  const states = Reflect.apply(READ_PORT, adapter, []) as BreditorNestedListWasmCommandAdapter["actionStateReadPort"];
  return Object.freeze({handle(event: Event): "native" | "handled" | "failed" {
    const candidate = nestedListTabCandidate(event, shortcutsEnabled, false);
    if (candidate === undefined || !live()) return "native";
    let lease = port.acquireLease();
    if (lease === undefined) return port.failure() === undefined ? "native" : "failed";
    let submitted = false;
    try {
      const token = Reflect.apply(DELIVERY, adapter, []);
      const base = readDomEventBase(event);
      if (base === null || base.type !== "keydown" || base.defaultPrevented || !base.cancelable ||
          classifyDomEventOwnership(token.rendered.host, base.target) !== "owned") return "native";
      const selection = Reflect.apply(READ_SELECTION, bridge, [token.rendered]);
      if (!selection.ok || selection.value.kind !== "range") return "native";
      const range = selection.value.selection;
      const wanted = JSON.stringify([range.anchor, range.focus]);
      if (!live() || !Reflect.apply(ACCEPTS, adapter, [token]) || !token.rendered.validateCanonicalDom()) return "native";
      submitted = true;
      const synchronized = port.submitLeased(lease, nestedListCommandRequest(token, nestedListRangeSelectionSync(range),
        {kind: "keyboard", detail: "Tab-selection"}, {kind: "selection", operation: "synchronize"}));
      if (synchronized.status !== "completed") return "failed";
      if (synchronized.result.selection.status !== "committed" && synchronized.result.selection.status !== "unchanged") return "native";
      if (!port.releaseLease(lease)) return "failed";
      lease = undefined;
      if (!live()) return "native";
      lease = port.acquireLease();
      if (lease === undefined) return port.failure() === undefined ? "native" : "failed";
      const current = Reflect.apply(DELIVERY, adapter, []);
      const observed = Reflect.apply(READ_SELECTION, bridge, [current.rendered]);
      if (!observed.ok || observed.value.kind !== "range" ||
          JSON.stringify([observed.value.selection.anchor, observed.value.selection.focus]) !== wanted) return "native";
      const result = states.read();
      if (!isOwnedBrowserActionStateReadResult(result) || !result.ok ||
          result.snapshot.snapshot.lineage !== current.snapshotLineage || result.snapshot.snapshot.revision !== current.snapshotRevision) return "native";
      const decision = nestedListTabDecision(candidate, result.snapshot.entries.find(entry => entry.id === candidate.stateId)?.availability);
      if (decision === "native" || !live() || !Reflect.apply(ACCEPTS, adapter, [current]) || !current.rendered.validateCanonicalDom()) return "native";
      const finalSelection = Reflect.apply(READ_SELECTION, bridge, [current.rendered]);
      if (!finalSelection.ok || finalSelection.value.kind !== "range" ||
          JSON.stringify([finalSelection.value.selection.anchor, finalSelection.value.selection.focus]) !== wanted ||
          !live() || !Reflect.apply(ACCEPTS, adapter, [current])) return "native";
      if (!preventDomEventDefault(event).ok) return "failed";
      if (!live() || !Reflect.apply(ACCEPTS, adapter, [current]) || !current.rendered.validateCanonicalDom()) return "failed";
      if (decision === "suppressRepeat") return "handled";
      const outcome = port.submitLeased(lease, nestedListCommandRequest(current, {kind: "preserve"},
        {kind: "keyboard", detail: candidate.intentId}, {kind: "intent", intentId: candidate.intentId, input: {kind: "none"}}, "closeBefore"));
      return outcome.status === "completed" ? "handled" : "failed";
    } catch { return submitted ? "failed" : "native"; }
    finally { if (lease !== undefined) port.releaseLease(lease); }
  }});
}
