/** Snapshot and flat-local provenance remain literal. Every target and saved
 * Native phase is read before lending LIVE; no flattening or save ACK occurs. */
import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import {snapshotIndependentRecoveryFactory} from '../independent_recovery/factory_policy.js';
import {snapshotReadFactoryData} from '../operation_read/read_factory_snapshot.js';
import {replayLocalOperationRecovery,verifyLocalOperationContinuation,type LocalPortableReplay} from '../independent_local_operation/portable_replay.js';
import {localPortableReferences} from '../independent_local_operation/portable_references.js';
import type {SharedIndependentHistoryRecovery} from '../independent_history/contract.js';
import {sourceNativeRecoveryRead} from '../source_native_read.js';
import {admitLocalInputReconstructionRecords} from '../selected_native_reconstruction/local_input_records.js';
import {LoadedNativeReconstructionCurrent as Loaded} from '../selected_native_reconstruction/loaded_current.js';
import {NativeReconstructionWork as Work} from '../selected_native_reconstruction/work_lifetime.js';
import {fields,identifier,fail} from '../selected_native_reconstruction/policy.js';
import type {LocalInputReconstructionReadFactory as Read} from '../selected_native_reconstruction/local_input_recipe.js';
import type {SharedAssetBytesOptions} from '../asset_bytes/types.js';
import {visitPacketNativeAlias,type MetadataPacketNativeVisit} from './contract.js';
export async function visitLocalInputPacketNative<T>(source:Loaded,provided:Readonly<{id:string;session:Read;descriptor:string;assets?:SharedAssetBytesOptions}>,visit:MetadataPacketNativeVisit<T>):Promise<T>{
 source.check();const raw=fields(provided,['id','session','descriptor'],['assets']),id=identifier(raw['id']),entry=source.participant(id);if(entry.family!=='local-operation-snapshot'&&entry.family!=='local-operation-flat'||typeof raw['descriptor']!=='string')throw fail('native_reconstruction_policy');
 const chosen=snapshotIndependentRecoveryFactory(entry.selection.original,snapshotReadFactoryData(raw['session'] as Read)),supplied=raw['assets']===undefined?{}:fields(raw['assets'],[],['limits','signal']) as SharedAssetBytesOptions,limits=checkRichAssetLimits(supplied.limits),work=new Work(source,supplied.signal),signal=work.signal,options={limits,signal},check=work.check;
 let admitted:Awaited<ReturnType<typeof admitLocalInputReconstructionRecords>>|undefined,live:LocalPortableReplay|undefined;
 try{
  const history=chosen.documentHistory,session={...chosen,documentHistory:history.kind==='original'?{...history,restoreOriginal:work.restore(history.restoreOriginal,history)}:{...history,restoreSegmented:work.restore(history.restoreSegmented,history)}};
  admitted=await admitLocalInputReconstructionRecords(source,id,session,options,check);check();const input=admitted.input,values:{recovery:SharedIndependentHistoryRecovery;cut:string|null}[]=[];
  for(const cut of input.targets)values.push({recovery:await admitted.decode(cut),cut:null});
  for(const[cut,hash]of[[admitted.current,admitted.intent.current],[admitted.pending,admitted.intent.pending]]as const)if(cut)values.push({recovery:await admitted.decode(cut),cut:hash});
  values.push({recovery:admitted.live as SharedIndependentHistoryRecovery,cut:null});
  for(const value of values){
   const next=await replayLocalOperationRecovery(entry.selection.original,session,value.recovery,check);let kept=false;
   try{
    if(JSON.stringify(next.recovery)!==JSON.stringify(value.recovery))throw fail();if(JSON.stringify(sourceNativeRecoveryRead(next.core).descriptor())!==raw['descriptor'])throw fail('native_reconstruction_policy');
    if(live)verifyLocalOperationContinuation(next,live);const found=localPortableReferences(next.core,next.recovery,next.check);if(value.cut!==null&&JSON.stringify(found)!==JSON.stringify(admitted.references.get(value.cut)))throw fail();
    next.check();live?.dispose();live=next;kept=true;
   }finally{if(!kept)next.dispose();}check();
  }
  if(!live)throw fail();const selected=live;return await visitPacketNativeAlias(id,selected.core,()=>{check();selected.check();},visit);
 }finally{try{live?.dispose();admitted?.close();}finally{work.close();}}
}
