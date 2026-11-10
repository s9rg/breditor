/** Runtime-only custody before a static open can return an attempt.
 * Entries contain real cleanup closures, not saved ownership or permission.
 * Failed opens may be drained only in their actual storage context/namespaces.
 * Successful transfer removes the entry; returned live owners are never drained.
 */
import {RecoveryCleanupScope,type RecoveryCleanupTicket} from "./cleanup_scope.js";
import {recoveryFailure} from "./errors.js";
export const MAX_PENDING_RECOVERY_OPENINGS=4096;
interface OpeningErrors {readonly policy:()=>Error;readonly busy:()=>Error;readonly storage:()=>Error}
interface OpeningEntry {readonly names:ReadonlySet<string>;readonly ticket:RecoveryCleanupTicket;state:"opening"|"failed"}
const contexts=new WeakMap<object,Set<OpeningEntry>>(),key=Object.freeze({});
function selected(names:readonly string[],failure:()=>Error):ReadonlySet<string>{
 if(!Array.isArray(names)||!names.length||names.length>16||names.some(name=>typeof name!=="string"||!name.length)||new Set(names).size!==names.length)throw failure();return new Set(names);
}
const overlaps=(a:ReadonlySet<string>,b:ReadonlySet<string>)=>[...a].some(name=>b.has(name));
function ledger(context:object,failure:()=>Error):Set<OpeningEntry>{
 if(!context||typeof context!=="object")throw failure();let value=contexts.get(context);if(!value){value=new Set();contexts.set(context,value);}return value;
}
async function retry(entries:Set<OpeningEntry>,entry:OpeningEntry):Promise<void>{if(!entries.has(entry))return;await entry.ticket.rollback();entries.delete(entry);}
/** Capture once before awaiting. Context switching must not retarget cleanup to another database factory. */
export function recoveryOpeningContext():IDBFactory {
 if(!globalThis.navigator?.locks||!globalThis.indexedDB)throw recoveryFailure("recovery_policy");return globalThis.indexedDB;
}
/** Cleanup only failed unreturned opens. This never closes an active opening or returned attempt. */
export async function drainFailedRecoveryOpenings(context:object,names:readonly string[],failure:()=>Error=()=>recoveryFailure("recovery_storage")):Promise<void>{
 const chosen=selected(names,failure),entries=ledger(context,failure),results=await Promise.allSettled([...entries].filter(entry=>entry.state==="failed"&&overlaps(entry.names,chosen)).map(entry=>retry(entries,entry)));
 if(results.some(result=>result.status==="rejected"))throw failure();
}
export class RecoveryOpeningCustody {
 readonly #entries:Set<OpeningEntry>;readonly #entry:OpeningEntry;readonly #errors:OpeningErrors;
 private constructor(token:object,entries:Set<OpeningEntry>,entry:OpeningEntry,errors:OpeningErrors){if(token!==key)throw recoveryFailure("recovery_closed");this.#entries=entries;this.#entry=entry;this.#errors=errors;Object.freeze(this);}
 static async reserve(context:object,names:readonly string[],cleanup:()=>Promise<void>,errors:OpeningErrors):Promise<RecoveryOpeningCustody>{
  const chosen=selected(names,errors.policy),entries=ledger(context,errors.policy);
  await drainFailedRecoveryOpenings(context,[...chosen],errors.storage);
  // This synchronous reservation happens before resource acquisition. Count
  // active and failed entries, so concurrent callers cannot outrun the budget.
  if(entries.size>=MAX_PENDING_RECOVERY_OPENINGS||[...entries].some(entry=>entry.state==="opening"&&overlaps(entry.names,chosen)))throw errors.busy();
  const scope=new RecoveryCleanupScope(errors.storage),entry:OpeningEntry={names:chosen,ticket:scope.retain(cleanup),state:"opening"};entries.add(entry);return new RecoveryOpeningCustody(key,entries,entry,errors);
 }
 complete():void{if(!this.#entries.has(this.#entry)||this.#entry.state!=="opening")throw this.#errors.busy();this.#entry.ticket.complete();this.#entries.delete(this.#entry);}
 /** A settled close failed. Let the next owner of this namespace retry cleanup. */
 retainFailedCleanup():void{if(this.#entries.has(this.#entry))this.#entry.state="failed";}
 rollback():Promise<void>{this.retainFailedCleanup();return retry(this.#entries,this.#entry);}
}
