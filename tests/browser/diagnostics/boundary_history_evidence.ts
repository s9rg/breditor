import { deepStrictEqual } from "node:assert";
import { createLinkFaultRecorder } from "./link_fault_recorder";

/** Node-side assertion, called only after retaining the browser evidence.
 * A successful history workload must not conceal a recorded rejection. Tests
 * that deliberately submit invalid selections must not use this assertion.
 */
export function assertCleanBoundaryHistoryEvidence(snapshot: unknown, rustReports: readonly string[] | undefined): void {
  deepStrictEqual(snapshot, createLinkFaultRecorder().snapshot(),
    "Successful boundary history recorded an adapter fault");
  deepStrictEqual(rustReports, [],
    "Successful boundary history recorded a Rust selection rejection");
}
