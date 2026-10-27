/** Capture an original root policy without invoking it. Cold wrappers call a
 * checked function, not the raw callback: otherwise ignoring its result hides a
 * Promise/boolean and accidentally turns an invalid asynchronous grant into a
 * successful void check. Rejected thenables are observed by the shared validator.
 * No stored field or source data supplies current permission. */
import {snapshotPhysicalRootResumeOptions} from '../physical_room_operation_v3/operation.js';
import type {PhysicalOperationV3ResumeOptions} from '../physical_room_operation_v3/contract.js';
import {participantAuthority} from '../participant_backup/policy.js';
export function snapshotColdRootResumeOptions(input:PhysicalOperationV3ResumeOptions):PhysicalOperationV3ResumeOptions{
 const root=snapshotPhysicalRootResumeOptions(input);return Object.freeze({...root,checkAuthority:participantAuthority(root.checkAuthority)});
}
