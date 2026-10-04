import { BreditorFlatListCommandQueue, openFlatListCommandQueueLeasePort } from "./command_queue.js";
import type { FlatListDocumentProjection } from "./flat_list_projection.js";
import { BreditorFlatListWasmCommandAdapter, type WasmCommandSequenceOutcome } from "./wasm_command_adapter.js";
import { flatListToolbarCommandRequest, snapshotToolbarInvocation, toolbarCommandDispatchResult,
  type ToolbarCommandDispatcher, type ToolbarCommandInvocation } from "./toolbar.js";
import { toolbarSequenceOutcomeDispatchStatus } from "./toolbar_dispatch_outcome.js";

const EXECUTOR = Object.getOwnPropertyDescriptor(BreditorFlatListWasmCommandAdapter.prototype, "commandExecutor")!.get!;
const DELIVERY = BreditorFlatListWasmCommandAdapter.prototype.deliveryToken;

/** The owner must dispose this capability before tearing down its editor. @internal */
export interface FlatListToolbarDispatcher extends ToolbarCommandDispatcher {
  dispose(): void;
}

/**
 * Immediate, selection-preserving toolbar delivery to an exact list owner.
 * Busy work is rejected rather than enqueued. The private queue lease remains
 * held through observer publication; public queue/adapter overrides are unused.
 * An uncertain delivery is terminal and is never retried. @internal
 */
export function createFlatListToolbarDispatcher(
  queue: BreditorFlatListCommandQueue<WasmCommandSequenceOutcome<FlatListDocumentProjection>>,
  adapter: BreditorFlatListWasmCommandAdapter,
): FlatListToolbarDispatcher {
  const executor = Reflect.apply(EXECUTOR, adapter, []) as BreditorFlatListWasmCommandAdapter["commandExecutor"];
  const port = openFlatListCommandQueueLeasePort(queue, executor);
  if (port === undefined) throw new TypeError("toolbar queue and list adapter have different owners");
  let failed = false;
  let disposed = false;
  return Object.freeze({
    dispose(): void { disposed = true; },
    dispatch(invocation: ToolbarCommandInvocation) {
      if (disposed) return toolbarCommandDispatchResult("rejected");
      if (failed || port.failure() !== undefined) return toolbarCommandDispatchResult("failed");
      const lease = port.acquireLease();
      if (lease === undefined) return toolbarCommandDispatchResult("rejected");
      let status: "completed" | "rejected" | "failed" = "rejected";
      let submitted = false;
      try {
        const captured = snapshotToolbarInvocation(invocation);
        if (captured !== null && !disposed) {
          const token = Reflect.apply(DELIVERY, adapter, []);
          const request = flatListToolbarCommandRequest(token, captured);
          if (!disposed) {
            submitted = true;
            const result = port.submitLeased(lease, request);
            if (result.status === "completed") {
              status = toolbarSequenceOutcomeDispatchStatus(result.result, captured) ?? "failed";
            } else if (result.status === "failed" || port.failure() !== undefined) {
              status = "failed";
            }
          }
        }
      } catch {
        status = submitted ? "failed" : "rejected";
      } finally {
        // Owner teardown may invalidate the lease from an observer after the
        // command completed. Preserve that known outcome, as the editor does.
        if (!port.releaseLease(lease) && !(disposed && status === "completed")) status = "failed";
      }
      if (status === "failed") failed = true;
      return toolbarCommandDispatchResult(status);
    },
  });
}
