/** Separate private coordinator errors; no old file/protocol or permission changes. */
import {retainInternalFailureCause} from '../internal_failure_cause.js';
import {physicalCatalogName,physicalCatalogDatabase} from '../physical_room_catalog/policy.js';
export type PhysicalOperationV3Code='physical_operation_v3_policy'|'physical_operation_v3_budget'|'physical_operation_v3_storage'|'physical_operation_v3_exists'|'physical_operation_v3_missing'|'physical_operation_v3_diverged'|'physical_operation_v3_in_use'|'physical_operation_v3_closed'|'physical_operation_v3_aborted'|'physical_operation_v3_authority'|'physical_operation_v3_restore';
export class PhysicalOperationV3Error extends Error{constructor(readonly code:PhysicalOperationV3Code){super('Retain the exact catalog and reopen genuine selected participants under fresh policy without overwriting work');this.name='PhysicalOperationV3Error';}}
export const physicalOperationV3Failure=(code:PhysicalOperationV3Code='physical_operation_v3_storage')=>new PhysicalOperationV3Error(code);
export function physicalOperationV3Known(error:unknown,code:PhysicalOperationV3Code='physical_operation_v3_storage'):PhysicalOperationV3Error{return error instanceof PhysicalOperationV3Error?error:retainInternalFailureCause(physicalOperationV3Failure(code),error);}
export function physicalOperationV3Name(value:unknown):string{try{return physicalCatalogName(value);}catch{throw physicalOperationV3Failure('physical_operation_v3_policy');}}
/** Database names are opaque existing namespaces, not catalog identifiers.
 * Preserve spaces and Unicode exactly; never normalize or relabel a database. */
export function physicalOperationV3Database(value:unknown):string{try{return physicalCatalogDatabase(value);}catch{throw physicalOperationV3Failure('physical_operation_v3_policy');}}
/** Match the existing physical staging plan ceiling; never truncate a cohort. */
export const MAX_PHYSICAL_OPERATION_V3_PLAN_BYTES=16*1024*1024;
