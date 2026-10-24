/** Internal retained-root prerequisite, NOT a native parent ownership grant.
 * The genuine parent remains responsible for every session/writer/journal.
 * A future successor must consume root custody in its own common barrier before
 * exposing these clients. No incoming report can manufacture this borrow. */
import {SharedEditorError,type SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {OperationalAssetCustody} from '../operation_cohort/assets.js';
import type {RecordPayloadFamily} from '../operation_read/record_payload.js';
export interface RetainedNativeClient{readonly id:string;readonly family:RecordPayloadFamily;readonly core:SharedRichEditor<SharedSelectionPolicy>}
export interface RetainedNativeWitness{check():void;dispose():void;basis?:Readonly<{id:string;family:RecordPayloadFamily;value:unknown}>}
export interface RetainedNativeReadBorrow{
 /** Actual SDK instances, not decoded native owners or a document projection. */
 readonly clients:readonly RetainedNativeClient[];
 /** Detached LIVE comparison data. Does not replace complete pending/committed
  * records, literal inputs, ownership, writer policy or independent approval. */
 liveBasis():readonly Readonly<{id:string;family:RecordPayloadFamily;value:unknown}>[];
 /** Valid both before and after temporary read cleanup. Checks complete LIVE
  * native/companion work plus actual origin-upload exclusion and native policy. */
 check():void;
 /** Requires actual temporary-read cleanup first. Failed cleanup retains the
  * real leases and can be retried. Never closes the caller's native sessions. */
 close():Promise<void>;
}
const retained=new WeakMap<RetainedNativeReadBorrow,()=>Readonly<{clients:readonly RetainedNativeClient[];assets:OperationalAssetCustody}>>();
/** Internal custody donation only. Native PARENTS stay with the genuine root;
 * callers must consume that root separately before exposing mutable clients. */
export function takeRetainedNativeOriginCustody(owner:RetainedNativeReadBorrow){const take=retained.get(owner);if(!take)throw retainedNativeReadFailure();return take();}
export const retainedNativeReadFailure=()=>new SharedEditorError('retained_native_read_policy','Retain the genuine parent and actual native/source/upload custody; data is not ownership');
/** Private actual-resource construction. Kept separate from parent ownership:
 * this object carries no operation, root, coordinator or writer lease. */
export function retainedNativeReadBorrow(clients:readonly RetainedNativeClient[],witnesses:readonly RetainedNativeWitness[],assets:OperationalAssetCustody,readClosed:()=>boolean):RetainedNativeReadBorrow{
 let members:readonly RetainedNativeClient[]=Object.freeze(clients.map(row=>Object.freeze({...row}))),checks=[...witnesses],held:OperationalAssetCustody|undefined=assets,canClose:(()=>boolean)|undefined=readClosed,closing=false,closed=false,running:Promise<void>|undefined;
 const check=()=>{if(closed||closing||!held)throw retainedNativeReadFailure();held.check();for(const witness of checks)witness.check();held.check();};
 const owner:RetainedNativeReadBorrow=Object.freeze({
  get clients(){if(closed||closing)throw retainedNativeReadFailure();return members;},check,
  liveBasis(){check();return Object.freeze(checks.flatMap(witness=>witness.basis?[Object.freeze(structuredClone(witness.basis))]:[]));},
  close(){
   if(closed)return Promise.resolve();if(running)return running;if(!canClose!())return Promise.reject(retainedNativeReadFailure());closing=true;
   running=(async()=>{for(const witness of [...checks].reverse())witness.dispose();checks=[];await held!.close();held=undefined;members=[];canClose=undefined;closed=true;})().finally(()=>{running=undefined;});return running;
  },
 });
 retained.set(owner,()=>{check();if(!canClose!())throw retainedNativeReadFailure();const value=Object.freeze({clients:members,assets:held!});for(const witness of [...checks].reverse())witness.dispose();checks=[];members=[];held=undefined;canClose=undefined;closed=true;retained.delete(owner);return value;});
 return owner;
}
