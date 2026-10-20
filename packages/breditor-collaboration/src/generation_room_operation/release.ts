/** Release cooperative bookkeeping together. A failed release closes no database
 * and consumes no child; already released leases remain idempotently retryable. */
import type {RecoveryLease} from "../participant_recovery/lease.js";
import {generationOperationFailure as fail} from "../generation_operation/policy.js";

export async function releaseGenerationRoomCustody(databases:readonly IDBDatabase[],leases:readonly RecoveryLease[]):Promise<void>{
 const results=await Promise.allSettled([...new Set(leases)].reverse().map(lease=>lease.close()));
 if(results.some(result=>result.status==="rejected"))throw fail();
 for(const db of new Set(databases))db.close();
}
