import {ContinuedDeliveryCompanion} from '../continued_delivery/companion.js';
import type {SharedContinuedDeliveryOptions,SharedContinuedDeliveryRecovery} from '../continued_delivery/contract.js';
import {makeContinuedPairCut} from '../continued_pair/cut.js';
import {SharedContinuedPairSession} from '../continued_pair/session.js';
import {coreReadStamp} from '../core_read_stamp.js';
import {withIndependentBootstrapPolicy} from '../independent_history/bootstrap_policy.js';
import {inspectExactHistoryDestination} from '../independent_history/exact_destination.js';
import {sourceCoreMethods} from '../source_native_read.js';
import {recoveryFailure as fail,type ContinuedDestinationHold} from './destination.js';

const {openDelivery,restoreDelivery,prototype:{exportDeliveryRecovery,discardAndClose}}=SharedContinuedPairSession;

/** Restore the complete selected client into the journal's dedicated source namespace. */
export async function recoverContinuedDeliveryRoomSource(
 database:string,restoreDocument:SharedContinuedDeliveryOptions['restoreDocument'],
 recovery:SharedContinuedDeliveryRecovery,completed:boolean,guard:()=>void,signal?:AbortSignal,
):Promise<ContinuedDestinationHold>{
 const {source,retainedBinding}=recovery,{document,review}=recovery.relay.binding;
 if(!review)throw fail('policy');
 const options:SharedContinuedDeliveryOptions={
  database,...source.identity,restoreDocument,readOnly:true,review:{...source.identity.review,access:'read_only'},
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
 const session=before==='exact'?await openDelivery.call(SharedContinuedPairSession,policy):
  await restoreDelivery.call(SharedContinuedPairSession,policy,recovery,'host-reacquired');
 let complete=false,closed=false;
 try{
  const core=session.core,stamp=coreReadStamp(core),selected=JSON.stringify(recovery);
  const check=()=>{
   if(closed)throw fail('diverged');
   const now=coreReadStamp(core);
   if(now.document!==stamp.document||now.review!==stamp.review)throw fail('diverged');
  };
  const verify=async()=>{
   guard();check();
   if(!sourceCoreMethods.view.call(core).readOnly||JSON.stringify(exportDeliveryRecovery.call(session))!==selected||
      await inspect()!=='exact')throw fail('diverged');
   guard();check();
  };
  await verify();
  complete=true;
  return {check,verify,async close(){closed=true;await discardAndClose.call(session);}};
 }finally{if(!complete)await discardAndClose.call(session);}
}
