/** Re-admit literal independent-local origins and every journal phase before
 * a temporary Native read. This never creates an editable or persisted source. */
import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import {SharedIndependentParticipantBackup as Backup} from '../independent_participant/backup.js';
import {PhysicalRoomRecordCutArchive} from '../physical_room_record_cut/archive.js';
import {admitLocalReconstructionParent} from '../selected_native_reconstruction/local_parent_records.js';
import {readLocalOperationIntent} from '../independent_local_operation/cut_intent.js';
import {localPortableCutRecovery} from '../independent_local_operation/portable_cut.js';
import {operationCutDigest,sameOperationCut} from '../independent_operation/cut_codec.js';
import {replayLocalOperationRecovery,verifyLocalOperationContinuation,type LocalPortableReplay} from '../independent_local_operation/portable_replay.js';
import {snapshotReadFactoryData} from '../operation_read/read_factory_snapshot.js';
import {LoadedNativeReconstructionCurrent as Loaded} from '../selected_native_reconstruction/loaded_current.js';
import {NativeReconstructionWork} from '../selected_native_reconstruction/work_lifetime.js';
import {fields,identifier,fail} from '../selected_native_reconstruction/policy.js';
import {rows} from '../selected_native_execution/policy.js';
import type {SharedIndependentRecoveryFactory} from '../independent_recovery/contract.js';
import {snapshotIndependentRecoveryFactory} from '../independent_recovery/factory_policy.js';
import type {SharedAssetBytesOptions} from '../asset_bytes/types.js';
import type {SharedIndependentHistoryRecovery,IndependentHistoryCut} from '../independent_history/contract.js';
import {visitPacketNativeAlias,type MetadataPacketNativeVisit} from './contract.js';
const backup={read:Backup.read,recovery:Backup.prototype.sourceRecovery,dispose:Backup.prototype.dispose},inputs=PhysicalRoomRecordCutArchive.prototype.inputs;
export async function visitLocalPacketNative<T>(source:Loaded,provided:Readonly<{id:string;session:SharedIndependentRecoveryFactory;assets?:SharedAssetBytesOptions}>,visit:MetadataPacketNativeVisit<T>):Promise<T>{
 source.check();const raw=fields(provided,['id','session'],['assets']),id=identifier(raw['id']),entry=source.participant(id);if(entry.family!=='independent-local')throw fail('native_reconstruction_policy');
 const chosen=snapshotIndependentRecoveryFactory(entry.selection,snapshotReadFactoryData(raw['session'] as SharedIndependentRecoveryFactory)),supplied=raw['assets']===undefined?{}:fields(raw['assets'],[],['limits','signal']) as SharedAssetBytesOptions,limits=checkRichAssetLimits(supplied.limits),work=new NativeReconstructionWork(source,supplied.signal),signal=work.signal,options={limits,signal},check=work.check;
 let original:Backup|undefined,originFile:Backup|undefined,live:LocalPortableReplay|undefined;
 try{
  const history=chosen.documentHistory,factory={...chosen,documentHistory:history.kind==='original'?{...history,restoreOriginal:work.restore(history.restoreOriginal,history)}:{...history,restoreSegmented:work.restore(history.restoreSegmented,history)}};
  const payload=fields(await source.records(id),['parent','source']),data=fields(payload['source'],['format','formatVersion','identity','original','snapshot','live','retainedReferences']);if(data['format']!=='breditor/local-source-record-payload'||data['formatVersion']!==1||JSON.stringify(data['original'])!==JSON.stringify(entry.selection))throw fail();
  original=await backup.read.call(Backup,source.participantFile(id),entry.selection,options);check();
  const literal=inputs.call(source.nativeCut(),id).find(row=>row.role==='source-origin');if(!literal)throw fail();originFile=await backup.read.call(Backup,literal.file,entry.selection,options);check();
  const identity=await admitLocalReconstructionParent(source,id,payload['parent'],factory,options,check);if(JSON.stringify(identity)!==JSON.stringify(data['identity']))throw fail();check();
  const snapshot=fields(data['snapshot'],['record','current','pending','observed','retained']),intent=readLocalOperationIntent(snapshot['record'],identity),cuts=new Map<string,IndependentHistoryCut>();for(const value of rows(snapshot['retained'],2)){const row=fields(value,['id','cut']),key=row['id'];if(typeof key!=='string'||cuts.has(key))throw fail();const cut=row['cut'] as IndependentHistoryCut;await localPortableCutRecovery(identity,cut);check();if(await operationCutDigest(cut)!==key)throw fail();cuts.set(key,cut);}
  const named=new Set([intent.current,intent.pending].filter((value):value is string=>value!==null));if(cuts.size!==named.size||[...cuts.keys()].some(key=>!named.has(key)))throw fail();
  for(const[slot,key]of[['current',intent.current],['pending',intent.pending]]as const){const cut=snapshot[slot];if(key===null?cut!==null:!cuts.has(key)||!sameOperationCut(cut,cuts.get(key)!))throw fail();}
  if(snapshot['observed']===null?intent.current!==null:typeof snapshot['observed']!=='string'||!named.has(snapshot['observed']))throw fail();
  live=await replayLocalOperationRecovery(entry.selection,factory,data['live'] as SharedIndependentHistoryRecovery,check);check();
  // Replay admits the closed native components. Do not silently discard an
  // unknown LIVE wrapper field while constructing a supposedly exact backup.
  if(JSON.stringify(live.recovery)!==JSON.stringify(data['live']))throw fail('native_reconstruction_integrity');
  const originalRecovery=backup.recovery.call(original);for(const recovery of[originalRecovery,...await Promise.all([...cuts.values()].map(cut=>localPortableCutRecovery(identity,cut)))]){check();const previous=await replayLocalOperationRecovery(entry.selection,factory,recovery,check);try{verifyLocalOperationContinuation(live,previous);previous.check();live.check();}finally{previous.dispose();}}
  const selected=live;return await visitPacketNativeAlias(id,selected.core,()=>{check();selected.check();},visit);
 }finally{try{live?.dispose();if(originFile)backup.dispose.call(originFile);if(original)backup.dispose.call(original);}finally{work.close();}}
}
