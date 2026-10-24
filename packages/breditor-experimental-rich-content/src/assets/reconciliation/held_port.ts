/** Reuse exact retained-file/choice transactions under an already held store
 * lease. Only a genuine RichAssetStore supplies this private checked port.
 * Custody is current exclusion, never a stored permission or server receipt. */
import type {AssetLimits} from '../types.js';
import {captureAssetReconciliationSnapshot} from './snapshot.js';
import {encodeAssetArchiveSnapshot} from '../archive/export_backup.js';
import {applyRetainedAssetPlan} from './apply.js';
import type {AssetReconciliationPort} from './coordinator.js';
interface HeldReconciliationContext {
 readonly name:string;readonly db:IDBDatabase;readonly limits:Readonly<AssetLimits>;
 check():void;use<T>(work:()=>Promise<T>):Promise<T>;checkApplying():void;
}
/** The class-private owner/lease equality check runs before and after every
 * asynchronous snapshot, and within the atomic target compare/apply. */
export function heldAssetReconciliationPort(context:HeldReconciliationContext):AssetReconciliationPort{
 const check=()=>context.check();
 const port:AssetReconciliationPort={name:context.name,limits:context.limits,check,use:<T>(work:()=>Promise<T>)=>context.use(work),snapshot:async()=>{
  check();const rows=await captureAssetReconciliationSnapshot(context.db,context.limits);check();const file=await encodeAssetArchiveSnapshot(rows,context.limits);check();return file;
 },apply:(before,after,guard,signal)=>{
  const current=()=>{context.checkApplying();guard();context.checkApplying();};current();return applyRetainedAssetPlan(context.db,before,after,context.limits,current,signal);
 }};return Object.freeze(port);
}
