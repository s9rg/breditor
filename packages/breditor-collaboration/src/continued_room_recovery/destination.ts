import {RichAssetStore,RichAssetStoreCustody,type AssetLimits} from '@breditor/experimental-rich-content';
import type {ArchiveIntegrityContext} from '../archive_integrity/context.js';
import type {SharedContinuedPairRecovery,SharedContinuedPairOptions} from '../continued_pair/contract.js';
import {SharedContinuedPairSession} from '../continued_pair/session.js';
import {coreReadStamp} from '../core_read_stamp.js';
import {continuedPairStore,makeContinuedPairCut} from '../continued_pair/cut.js';
import {readPairedHistoryCut} from '../independent_history/database.js';
import type {IndependentHistoryCut} from '../independent_history/contract.js';
import {withIndependentBootstrapPolicy} from '../independent_history/bootstrap_policy.js';
import {existingDatabase} from '../participant_recovery/journal.js';
import {inspectUploads} from '../participant_recovery/inspect.js';
import {sourceCoreMethods} from '../source_native_read.js';
import {settleOwnedTransaction} from '../persistence/settle_owned_transaction.js';
import {SharedEditorError} from '../core.js';

export const recoveryFailure=(suffix:string)=>new SharedEditorError(
 'continued_room_recovery_'+suffix,'Recover the selected continued room into dedicated exact local destinations',
);
const {open,restoreRecovery,prototype:{exportRecovery,discardAndClose}}=SharedContinuedPairSession;
const {openRetained,restoreBackupHeld,prototype:{acquireRecoveryCustody,exportBackup,close}}=RichAssetStore;
const {check:checkCustody,close:closeCustody}=RichAssetStoreCustody.prototype;

async function inspectSource(name:string,recovery:SharedContinuedPairRecovery,cut:IndependentHistoryCut,guard:()=>void){
 guard();
 const db=await existingDatabase(name);
 if(!db){guard();return 'absent';}
 let changed=false;
 try{
  db.onversionchange=()=>{changed=true;db.close();};
  const names=continuedPairStore.names;
  guard();
  if(db.version!==1||db.objectStoreNames.length!==2||!names.every(value=>db.objectStoreNames.contains(value)))
   throw recoveryFailure('diverged');
  const counts=await new Promise<number[]>((resolve,reject)=>{
   const tx=db.transaction([...names],'readonly'),result:number[]=[];
   let failure:unknown;
   const abort=(error:unknown)=>{failure=error;try{tx.abort();}catch{}};
   settleOwnedTransaction(tx,()=>result,()=>failure??recoveryFailure('diverged'),resolve,reject);
   names.forEach((name,index)=>{
    const store=tx.objectStore(name);
    if(store.keyPath!==null||store.autoIncrement||store.indexNames.length){abort(recoveryFailure('diverged'));return;}
    const request=store.count();
    request.onsuccess=()=>{result[index]=request.result;};
   });
  });
  guard();
  if(changed)throw recoveryFailure('diverged');
  if(counts[0]===0&&counts[1]===0)return 'empty';
  if(counts[0]!==cut.files.length||counts[1]!==1)throw recoveryFailure('diverged');
  const id=recovery.identity.native;
  const actual=await readPairedHistoryCut(db,[id.room,id.writer],continuedPairStore);
  guard();
  if(changed||actual?.head!==cut.head||JSON.stringify(actual.files)!==JSON.stringify(cut.files))
   throw recoveryFailure('diverged');
  return 'exact';
 }finally{db.close();}
}

export interface ContinuedDestinationHold {
 check():void;
 verify():Promise<void>;
 close():Promise<void>;
}

export async function recoverContinuedRoomSource(
 options:SharedContinuedPairOptions,recovery:SharedContinuedPairRecovery,completed:boolean,guard:()=>void,signal?:AbortSignal,
){
 const cut=await makeContinuedPairCut(recovery.documentCheckpoint,recovery.reviewCheckpoint,recovery.identity,recovery.versions);
 const before=await inspectSource(options.database,recovery,cut,guard);
 if(completed&&before!=='exact')throw recoveryFailure('diverged');
 const policy=withIndependentBootstrapPolicy(options,guard,signal);
 const session=before==='exact'?await open.call(SharedContinuedPairSession,policy):
  await restoreRecovery.call(SharedContinuedPairSession,policy,recovery,'host-reacquired');
 let complete=false,closed=false;
 try{
  const core=session.core,stamp=coreReadStamp(core);
  const check=()=>{
   if(closed)throw recoveryFailure('diverged');
   const current=coreReadStamp(core);
   if(current.document!==stamp.document||current.review!==stamp.review)throw recoveryFailure('diverged');
  };
  const verify=async()=>{
   guard();check();
   if(!sourceCoreMethods.view.call(core).readOnly||JSON.stringify(exportRecovery.call(session))!==JSON.stringify(recovery)||
      await inspectSource(options.database,recovery,cut,guard)!=='exact')throw recoveryFailure('diverged');
   guard();check();
  };
  await verify();
  complete=true;
  return {check,verify,async close(){closed=true;await discardAndClose.call(session);}};
 }finally{if(!complete)await discardAndClose.call(session);}
}

export async function recoverContinuedRoomUploads(
 name:string,file:Blob,completed:boolean,context:ArchiveIntegrityContext,
 options:{readonly limits?:Partial<AssetLimits>},signal?:AbortSignal,
){
 const {guard}=context;
 guard();
 const status=await inspectUploads(name);
 guard();
 if(completed&&status==='missing')throw recoveryFailure('diverged');
 const expected=await context.digest(file);
 let store:RichAssetStore|undefined,custody:RichAssetStoreCustody|undefined,complete=false;
 const release=async()=>{
  try{if(custody)await closeCustody.call(custody);}
  finally{if(store)close.call(store);}
 };
 const restore=async()=>{
  const result=await restoreBackupHeld.call(RichAssetStore,name,file,{...options,uploadState:'preserve',checkAuthority:guard,...(signal?{signal}:{})});
  store=result.store;custody=result.custody;
 };
 try{
  if(status==='missing')await restore();
  else{
   store=await openRetained.call(RichAssetStore,name,options);
   guard();
   custody=await acquireRecoveryCustody.call(store);
   const current=await exportBackup.call(store,signal?{signal}:{});
   if(await context.digest(current)!==expected){
    if(completed||status!=='empty')throw recoveryFailure('diverged');
    await closeCustody.call(custody);custody=undefined;
    close.call(store);store=undefined;
    await restore();
   }
  }
  const check=()=>checkCustody.call(custody!);
  const verify=async()=>{
   guard();check();
   if(await context.digest(await exportBackup.call(store!,signal?{signal}:{}))!==expected)throw recoveryFailure('diverged');
   guard();check();
  };
  await verify();
  complete=true;
  return {check,verify,close:release};
 }finally{if(!complete)await release();}
}
