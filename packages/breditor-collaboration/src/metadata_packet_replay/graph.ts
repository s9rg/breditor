/** Replay every preserved restored-graph target, save phase and LIVE. Exact
 * Native lineage, versions and saved reference observations remain required. */
import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import {snapshotIndependentDeliveryFactory} from '../independent_delivery_recovery/factory_policy.js';
import {snapshotReadFactoryData} from '../operation_read/read_factory_snapshot.js';
import {checkIndependentDeliveryRecords,independentDeliveryRecords} from '../independent_delivery_source/records.js';
import {portableCutRecovery} from '../independent_operation/portable_cut.js';
import {replayPortableRecovery,verifyPortableContinuation} from '../independent_operation/portable_replay.js';
import {portableRecoveryReferences} from '../independent_operation/portable_references.js';
import {sourceNativeRecoveryRead} from '../source_native_read.js';
import {admitGraphReconstructionRecords} from '../selected_native_reconstruction/graph_records.js';
import {LoadedNativeReconstructionCurrent as Loaded} from '../selected_native_reconstruction/loaded_current.js';
import {NativeReconstructionWork as Work} from '../selected_native_reconstruction/work_lifetime.js';
import {fields,identifier,fail} from '../selected_native_reconstruction/policy.js';
import type {DeliveryReconstructionReadFactory as Read} from '../selected_native_reconstruction/delivery_recipe.js';
import type {SharedAssetBytesOptions} from '../asset_bytes/types.js';
import type {SharedIndependentDeliveryRecovery} from '../independent_delivery/contract.js';
import {visitPacketNativeAlias,type MetadataPacketNativeVisit} from './contract.js';
export async function visitGraphPacketNative<T>(source:Loaded,provided:Readonly<{id:string;session:Read;descriptor:string;assets?:SharedAssetBytesOptions}>,visit:MetadataPacketNativeVisit<T>):Promise<T>{
 source.check();const raw=fields(provided,['id','session','descriptor'],['assets']),id=identifier(raw['id']),entry=source.participant(id);if(entry.family!=='restored-graph'||typeof raw['descriptor']!=='string')throw fail('native_reconstruction_policy');
 const chosen=snapshotIndependentDeliveryFactory(entry.selection.original,snapshotReadFactoryData(raw['session'] as Read),true),supplied=raw['assets']===undefined?{}:fields(raw['assets'],[],['limits','signal']) as SharedAssetBytesOptions,limits=checkRichAssetLimits(supplied.limits),work=new Work(source,supplied.signal),signal=work.signal,options={limits,signal},check=work.check;
 let admitted:Awaited<ReturnType<typeof admitGraphReconstructionRecords>>|undefined,live:Awaited<ReturnType<typeof replayPortableRecovery>>|undefined;
 try{
  const history=chosen.documentHistory,session={...chosen,documentHistory:history.kind==='original'?{...history,restoreOriginal:work.restore(history.restoreOriginal,history)}:{...history,restoreSegmented:work.restore(history.restoreSegmented,history)}};
  admitted=await admitGraphReconstructionRecords(source,id,session,options,check);check();const input=admitted.prepared,factory=input.factory;
  const liveData=await checkIndependentDeliveryRecords(entry.selection.original.identity.source,independentDeliveryRecords(admitted.live as SharedIndependentDeliveryRecovery));check();if(JSON.stringify(liveData)!==JSON.stringify(admitted.live))throw fail();
  const values:{recovery:SharedIndependentDeliveryRecovery;cut:string|null}[]=[];
  for(const cut of input.targets){values.push({recovery:await portableCutRecovery(factory,input.identity,cut),cut:null});check();}
  for(const[cut,id]of[[admitted.current,admitted.intent.current],[admitted.pending,admitted.intent.pending]]as const)if(cut){values.push({recovery:await portableCutRecovery(factory,input.identity,cut),cut:id});check();}
  values.push({recovery:liveData,cut:null});let before:SharedIndependentDeliveryRecovery|undefined;
  for(const value of values){
   const next=await replayPortableRecovery(factory,value.recovery,check);let kept=false;
   try{
    if(JSON.stringify(sourceNativeRecoveryRead(next.core).descriptor())!==raw['descriptor'])throw fail('native_reconstruction_policy');
    if(live&&before){verifyPortableContinuation(next,value.recovery,live,before);if(before.source.versions.some((packet,index)=>value.recovery.source.versions[index]!==packet))throw fail('native_reconstruction_requires_merge');}
    const found=portableRecoveryReferences(next.core,value.recovery,next.check);if(value.cut!==null&&JSON.stringify(found)!==JSON.stringify(admitted.references.get(value.cut)))throw fail();
    next.check();live?.dispose();live=next;before=value.recovery;kept=true;
   }finally{if(!kept)next.dispose();}
   check();
  }
  if(!live||!before)throw fail();const selected=live;return await visitPacketNativeAlias(id,selected.core,()=>{check();selected.check();},visit,before.source.versions);
 }finally{try{live?.dispose();admitted?.close();}finally{work.close();}}
}
