/** Replay the complete independent-delivery parent, current/pending journal
 * cuts and literal LIVE through a readonly factory. No original queue is opened. */
import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import {SharedIndependentDeliveryParticipantBackup as Backup} from '../independent_delivery_participant/backup.js';
import {independentDeliveryRecords,checkIndependentDeliveryRecords} from '../independent_delivery_source/records.js';
import {snapshotIndependentDeliveryRecovery} from '../independent_delivery_recovery/prepare.js';
import {checkIndependentDeliveryRecoveryRecord} from '../independent_delivery_recovery/record.js';
import {operationJournalIdentity} from '../independent_operation/journal_identity.js';
import {readOperationCutIntent} from '../independent_operation/cut_intent.js';
import {portableCutRecovery} from '../independent_operation/portable_cut.js';
import {operationCutDigest,sameOperationCut} from '../independent_operation/cut_codec.js';
import {replayPortableRecovery,verifyPortableContinuation} from '../independent_operation/portable_replay.js';
import {snapshotReadFactoryData} from '../operation_read/read_factory_snapshot.js';
import {PhysicalRoomRecordCutArchive} from '../physical_room_record_cut/archive.js';
import {LoadedNativeReconstructionCurrent as Loaded} from '../selected_native_reconstruction/loaded_current.js';
import {NativeReconstructionWork as Work} from '../selected_native_reconstruction/work_lifetime.js';
import {fields,identifier,fail} from '../selected_native_reconstruction/policy.js';
import {rows} from '../selected_native_execution/policy.js';
import {snapshotIndependentDeliveryFactory} from '../independent_delivery_recovery/factory_policy.js';
import type {SharedIndependentDeliveryRecovery} from '../independent_delivery/contract.js';
import type {DeliveryReconstructionReadFactory as Read} from '../selected_native_reconstruction/delivery_recipe.js';
import type {SharedAssetBytesOptions} from '../asset_bytes/types.js';
import type {IndependentHistoryCut} from '../independent_history/contract.js';
import {visitPacketNativeAlias,type MetadataPacketNativeVisit} from './contract.js';
const backup={read:Backup.read,recovery:Backup.prototype.sourceRecovery,dispose:Backup.prototype.dispose},root=PhysicalRoomRecordCutArchive.prototype.root,inputs=PhysicalRoomRecordCutArchive.prototype.inputs;
export async function visitDeliveryPacketNative<T>(source:Loaded,provided:Readonly<{id:string;session:Read;assets?:SharedAssetBytesOptions}>,visit:MetadataPacketNativeVisit<T>):Promise<T>{
 source.check();const raw=fields(provided,['id','session'],['assets']),id=identifier(raw['id']),entry=source.participant(id);if(entry.family!=='independent-delivery')throw fail('native_reconstruction_policy');
 const chosen=snapshotIndependentDeliveryFactory(entry.selection,snapshotReadFactoryData(raw['session'] as Read),true),supplied=raw['assets']===undefined?{}:fields(raw['assets'],[],['limits','signal']) as SharedAssetBytesOptions,limits=checkRichAssetLimits(supplied.limits),work=new Work(source,supplied.signal),signal=work.signal,options={limits,signal},check=work.check;
 let original:Backup|undefined,literal:Backup|undefined,live:Awaited<ReturnType<typeof replayPortableRecovery>>|undefined;
 try{
  const history=chosen.documentHistory,session={...chosen,documentHistory:history.kind==='original'?{...history,restoreOriginal:work.restore(history.restoreOriginal,history)}:{...history,restoreSegmented:work.restore(history.restoreSegmented,history)}};
  const payload=fields(await source.records(id),['parent','source']),data=fields(payload['source'],['format','formatVersion','identity','original','snapshot','live','retainedReferences']);check();
  if(data['format']!=='breditor/delivery-source-record-payload'||data['formatVersion']!==1||JSON.stringify(data['original'])!==JSON.stringify(entry.selection))throw fail();
  const nativeCut=source.nativeCut(),member=root.call(nativeCut).participants.find(row=>row.id===id);
  if(!member||member.family!=='independent-delivery')throw fail();
  const namespace=(role:string)=>{const row=member.namespaces.find(row=>row.role===role);if(!row)throw fail();return row.database;};
  original=await backup.read.call(Backup,source.participantFile(id),entry.selection,options);check();
  const input=inputs.call(nativeCut,id).find(row=>row.role==='source-origin');if(!input)throw fail();
  literal=await backup.read.call(Backup,input.file,entry.selection,options);check();
  const base=snapshotIndependentDeliveryRecovery({database:namespace('recovery'),destinations:{source:namespace('recovery-source'),uploads:namespace('uploads')},expected:entry.selection,session,checkAuthority:check,signal,limits},false);
  const parent=fields(payload['parent'],['format','formatVersion','recovery','original','file']),file=fields(parent['file'],['role','bytes','sha256']),parentRecord=checkIndependentDeliveryRecoveryRecord(parent['recovery'],base.record);
  if(parent['format']!=='breditor/fresh-independent-delivery-parent-records'||parent['formatVersion']!==1||JSON.stringify(parent['original'])!==JSON.stringify(entry.selection)||file['role']!=='recovery-origin'||file['bytes']!==input.file.size||file['sha256']!==entry.selection.sha256||parentRecord.phase!=='ready'||parentRecord.source!=='complete'||parentRecord.uploads!=='complete')throw fail();
  const identity=await operationJournalIdentity(namespace('operation'),namespace('source'),base);check();
  if(JSON.stringify(identity)!==JSON.stringify(data['identity']))throw fail();
  const snapshot=fields(data['snapshot'],['record','current','pending','observed','retained']),intent=readOperationCutIntent(snapshot['record'],identity),factory={...session,database:namespace('source'),create(){throw fail('native_reconstruction_policy');}},cuts=new Map<string,IndependentHistoryCut>();
  for(const value of rows(snapshot['retained'],2)){
   const row=fields(value,['id','cut']),key=row['id'];if(typeof key!=='string'||cuts.has(key))throw fail();
   const cut=row['cut'] as IndependentHistoryCut;await portableCutRecovery(factory,identity,cut);check();
   if(await operationCutDigest(cut)!==key)throw fail();cuts.set(key,cut);
  }
  const named=new Set([intent.current,intent.pending].filter((value):value is string=>value!==null));
  if(cuts.size!==named.size||[...cuts.keys()].some(key=>!named.has(key)))throw fail();
  for(const [slot,key] of [['current',intent.current],['pending',intent.pending]] as const){const cut=snapshot[slot];if(key===null?cut!==null:!cuts.has(key)||!sameOperationCut(cut,cuts.get(key)!))throw fail();}
  if(snapshot['observed']===null?intent.current!==null:typeof snapshot['observed']!=='string'||!named.has(snapshot['observed']))throw fail();
  const liveData=await checkIndependentDeliveryRecords(entry.selection.identity.source,independentDeliveryRecords(data['live'] as SharedIndependentDeliveryRecovery));check();
  // The component projection omits outer identity/binding/format fields. It is
  // not permission to relabel malformed incoming LIVE under the chosen factory.
  if(JSON.stringify(liveData)!==JSON.stringify(data['live']))throw fail('native_reconstruction_integrity');
  live=await replayPortableRecovery(factory,liveData,check);check();
  for(const recovery of [backup.recovery.call(original),...await Promise.all([...cuts.values()].map(cut=>portableCutRecovery(factory,identity,cut)))]){
   check();const previous=await replayPortableRecovery(factory,recovery,check);
   try{
    verifyPortableContinuation(live,liveData,previous,recovery);
    if(recovery.source.versions.length>liveData.source.versions.length||recovery.source.versions.some((packet,index)=>liveData.source.versions[index]!==packet))throw fail('native_reconstruction_requires_merge');
    previous.check();live.check();
   }finally{previous.dispose();}
  }
  const selected=live;return await visitPacketNativeAlias(id,selected.core,()=>{check();selected.check();},visit);
 }finally{try{live?.dispose();if(literal)backup.dispose.call(literal);if(original)backup.dispose.call(original);}finally{work.close();}}
}
