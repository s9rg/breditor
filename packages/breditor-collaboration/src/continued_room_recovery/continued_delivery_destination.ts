import {ContinuedDeliveryCompanion} from '../continued_delivery/companion.js';
import type {ContinuedDeliveryRecordRead,SharedContinuedDeliveryOptions,SharedContinuedDeliveryRecovery} from '../continued_delivery/contract.js';
import {makeContinuedPairCut} from '../continued_pair/cut.js';
import {ContinuedPairRecordRead} from '../continued_pair/read_records.js';
import {SharedContinuedPairSession} from '../continued_pair/session.js';
import {withIndependentBootstrapPolicy} from '../independent_history/bootstrap_policy.js';
import {inspectExactHistoryDestination} from '../independent_history/exact_destination.js';
import {capturedNativeHistoryFinalCheck,capturedNativeHistoryRead,checkCapturedNativeActorRoute} from '../native_history_read/registry.js';
import {DeferredActorLeaseInput} from '../persistence/deferred_actor_input.js';
import {sourceCoreMethods} from '../source_native_read.js';
import type {SharedReviewAccess} from '../review_types.js';
import {recoveryFailure as fail,type ContinuedDestinationHold} from './destination.js';

const {openDelivery,restoreDelivery,prototype}=SharedContinuedPairSession;
const {readDeliveryRecords,discardAndClose}=prototype;
const getCore=Object.getOwnPropertyDescriptor(prototype,'core')!.get!;
const {metadata,verify:verifyRead,dispose}=ContinuedPairRecordRead.prototype;
const selectRoute=DeferredActorLeaseInput.prototype.select;

export interface HeldContinuedDeliveryDestination extends ContinuedDestinationHold {
 readonly session:SharedContinuedPairSession;
 releaseRead():void;
}

/** Restore the complete selected client into the journal's dedicated source namespace. */
export async function recoverContinuedDeliveryRoomSource(
 database:string,restoreDocument:SharedContinuedDeliveryOptions['restoreDocument'],
 recovery:SharedContinuedDeliveryRecovery,completed:boolean,route:DeferredActorLeaseInput,guard:()=>void,
 signal:AbortSignal|undefined,retain:(close:()=>Promise<void>)=>()=>void,
 access?:Readonly<{readOnly:boolean;review:SharedReviewAccess}>,
):Promise<HeldContinuedDeliveryDestination>{
 const {source,retainedBinding}=recovery,{document,review}=recovery.relay.binding;
 if(!review)throw fail('policy');
 const options:SharedContinuedDeliveryOptions={
  database,...source.identity,restoreDocument,readOnly:access?.readOnly??true,
  review:{...source.identity.review,access:access?.review??'read_only'},
  binding:{document,review},retained:retainedBinding,
 };
 guard();
 const companion=new ContinuedDeliveryCompanion(options,recovery);
 const {documentCheckpoint,reviewCheckpoint,identity,versions}=source;
 const cut=companion.wrap(await makeContinuedPairCut(documentCheckpoint,reviewCheckpoint,identity,versions),companion.capture());
 const destination={cut,fail:()=>fail('diverged')};
 const inspect=()=>inspectExactHistoryDestination(database,companion.store.names,[identity.native.room,identity.native.writer],destination,guard);
 const before=await inspect();
 if(completed&&before!=='exact')throw fail('diverged');
 const policy=withIndependentBootstrapPolicy(options,guard,signal,destination);
 selectRoute.call(route,policy);
 let session:SharedContinuedPairSession|undefined,read:ContinuedDeliveryRecordRead|undefined;
 let closed=false;
 const releaseRead=()=>{if(read){dispose.call(read);read=undefined;}};
 const close=async()=>{
  closed=true;
  releaseRead();
  if(session)await discardAndClose.call(session);
 };
 const transfer=retain(close);
 session=before==='exact'?await openDelivery.call(SharedContinuedPairSession,policy):
  await restoreDelivery.call(SharedContinuedPairSession,policy,recovery,'host-reacquired');
 read=await readDeliveryRecords.call(session,guard,signal);
 const held=read,core=getCore.call(session);
 const records=metadata.call(held) as ReturnType<ContinuedDeliveryRecordRead['metadata']>;
 const native=capturedNativeHistoryRead(held),checkNative=capturedNativeHistoryFinalCheck(native);
 const check=()=>{
  if(closed||sourceCoreMethods.view.call(core).readOnly!==options.readOnly)throw fail('diverged');
  checkNative();
 };
 const verify=async()=>{
  guard();check();
  await verifyRead.call(held);
  if(await inspect()!=='exact')throw fail('diverged');
  guard();check();
  checkCapturedNativeActorRoute(native,route);
 };
 if(records.attempt!==null||records.pending!==null||records.committed.head!==cut.head||
    JSON.stringify(records.live)!==JSON.stringify(recovery))throw fail('diverged');
 await verify();
 transfer();
 return {check,verify,close,session,releaseRead};
}
