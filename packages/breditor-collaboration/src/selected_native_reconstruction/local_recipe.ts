/** Re-admit every original/current/pending/LIVE local native cut and retain
 * complete origins while building a new independent-local participant DATA file.
 * Native lineage and immutable versions must continue; no AST, writer grant,
 * source-save acknowledgement or whole-room activation is synthesized. */
import {readRichAssetBackup,RichAssetArchive,checkRichAssetLimits} from '@breditor/experimental-rich-content';
import {SharedIndependentParticipantBackup as Backup} from '../independent_participant/backup.js';
import {encodeIndependentParticipant,independentParticipantDigest} from '../independent_participant/codec.js';
import {independentRecords} from '../independent_source/records.js';
import {PhysicalRoomRecordCutArchive} from '../physical_room_record_cut/archive.js';
import {localOperationJournalIdentity} from '../independent_local_operation/journal_identity.js';
import {readLocalOperationIntent} from '../independent_local_operation/cut_intent.js';
import {localPortableCutRecovery} from '../independent_local_operation/portable_cut.js';
import {operationCutDigest,sameOperationCut} from '../independent_operation/cut_codec.js';
import {replayLocalOperationRecovery,verifyLocalOperationContinuation,type LocalPortableReplay} from '../independent_local_operation/portable_replay.js';
import {localPortableReferences} from '../independent_local_operation/portable_references.js';
import {resolveSelectedAssetBytes} from '../asset_bytes/resolve.js';
import {sourceCoreMethods} from '../source_native_read.js';
import {snapshotReadFactoryData} from '../operation_read/read_factory_snapshot.js';
import {LoadedNativeReconstructionCurrent as Loaded} from './loaded_current.js';
import {NativeReconstructionWork} from './work_lifetime.js';
import {fields,identifier,fail} from './policy.js';
import {rows} from '../selected_native_execution/policy.js';
import type {SharedIndependentRecoveryFactory} from '../independent_recovery/contract.js';
import {snapshotIndependentRecoveryFactory} from '../independent_recovery/factory_policy.js';
import type {SharedAssetBytesOptions,SharedAssetBytesResolver} from '../asset_bytes/types.js';
import type {SharedIndependentHistoryRecovery,IndependentHistoryCut} from '../independent_history/contract.js';
const backup={read:Backup.read,selection:Backup.prototype.selection,recovery:Backup.prototype.sourceRecovery,blob:Backup.prototype.blob,metadata:Backup.prototype.metadata,file:Backup.prototype.file,dispose:Backup.prototype.dispose},assets={read:readRichAssetBackup,blob:RichAssetArchive.prototype.blob,dispose:RichAssetArchive.prototype.dispose},inputs=PhysicalRoomRecordCutArchive.prototype.inputs;
export async function buildLocalReconstructionRecipe(source:Loaded,provided:Readonly<{id:string;session:SharedIndependentRecoveryFactory;assets?:SharedAssetBytesOptions;resolveAsset?:SharedAssetBytesResolver}>){
 source.check();const raw=fields(provided,['id','session'],['assets','resolveAsset']),id=identifier(raw['id']),entry=source.participant(id);if(entry.family!=='independent-local')throw fail('native_reconstruction_policy');
 const chosen=snapshotIndependentRecoveryFactory(entry.selection,snapshotReadFactoryData(raw['session'] as SharedIndependentRecoveryFactory)),supplied=raw['assets']===undefined?{}:fields(raw['assets'],[],['limits','signal']) as SharedAssetBytesOptions,limits=checkRichAssetLimits(supplied.limits),resolve=raw['resolveAsset'] as SharedAssetBytesResolver|undefined;if(resolve!==undefined&&typeof resolve!=='function')throw fail('native_reconstruction_policy');
 const work=new NativeReconstructionWork(source,supplied.signal),signal=work.signal,options={limits,signal},check=work.check;
 let original:Backup|undefined,originFile:Backup|undefined,local:RichAssetArchive|undefined,selected:RichAssetArchive|undefined,live:LocalPortableReplay|undefined,result:Backup|undefined;
 try{
  const history=chosen.documentHistory,factory={...chosen,documentHistory:history.kind==='original'?{...history,restoreOriginal:work.restore(history.restoreOriginal,history)}:{...history,restoreSegmented:work.restore(history.restoreSegmented,history)}};
  const payload=fields(await source.records(id),['parent','source']),data=fields(payload['source'],['format','formatVersion','identity','original','snapshot','live','retainedReferences']);if(data['format']!=='breditor/local-source-record-payload'||data['formatVersion']!==1||JSON.stringify(data['original'])!==JSON.stringify(entry.selection))throw fail();
  original=await backup.read.call(Backup,source.participantFile(id),entry.selection,options);check();
  const literal=inputs.call(source.nativeCut(),id).find(row=>row.role==='source-origin');if(!literal)throw fail();originFile=await backup.read.call(Backup,literal.file,entry.selection,options);check();
  const declared=fields(data['identity'],['plan','operation','origin','database','sourceDatabase']),identity=await localOperationJournalIdentity(declared['database'] as string,declared['sourceDatabase'] as string,entry.selection);if(JSON.stringify(identity)!==JSON.stringify(data['identity']))throw fail();check();
  const snapshot=fields(data['snapshot'],['record','current','pending','observed','retained']),intent=readLocalOperationIntent(snapshot['record'],identity),cuts=new Map<string,IndependentHistoryCut>();for(const value of rows(snapshot['retained'],2)){const row=fields(value,['id','cut']),key=row['id'];if(typeof key!=='string'||cuts.has(key))throw fail();const cut=row['cut'] as IndependentHistoryCut;await localPortableCutRecovery(identity,cut);check();if(await operationCutDigest(cut)!==key)throw fail();cuts.set(key,cut);}
  const named=new Set([intent.current,intent.pending].filter((value):value is string=>value!==null));if(cuts.size!==named.size||[...cuts.keys()].some(key=>!named.has(key)))throw fail();
  for(const[slot,key]of[['current',intent.current],['pending',intent.pending]]as const){const cut=snapshot[slot];if(key===null?cut!==null:!cuts.has(key)||!sameOperationCut(cut,cuts.get(key)!))throw fail();}
  if(snapshot['observed']===null?intent.current!==null:typeof snapshot['observed']!=='string'||!named.has(snapshot['observed']))throw fail();
  live=await replayLocalOperationRecovery(entry.selection,factory,data['live'] as SharedIndependentHistoryRecovery,check);check();
  const originalRecovery=backup.recovery.call(original);for(const recovery of[originalRecovery,...await Promise.all([...cuts.values()].map(cut=>localPortableCutRecovery(identity,cut)))]){check();const previous=await replayLocalOperationRecovery(entry.selection,factory,recovery,check);try{verifyLocalOperationContinuation(live,previous);previous.check();live.check();}finally{previous.dispose();}}
  const references=localPortableReferences(live.core,live.recovery,live.check);if(references.pending.length)return Object.freeze({kind:'pending' as const,id,pending:[{kind:'source' as const,pending:references.pending}]});
  local=await assets.read(source.originalUploads(id),options);check();selected=await assets.read(source.selectedUploads(id),options);check();
  const guard=()=>{check();live!.check();},resolved=await resolveSelectedAssetBytes(references.references,async(reference,requested)=>{guard();const blob=assets.blob.call(local!,reference.asset)??assets.blob.call(selected!,reference.asset);if(blob)return{...reference,identity:'content-addressed',blob,check:guard};const retained=backup.blob.call(original!,reference.asset,reference.generation);if(retained)return{...reference,identity:/^sha256:[a-f0-9]{64}$/.test(reference.asset)?'content-addressed':'host-verified',blob:retained,check:guard};return resolve?await work.call(()=>resolve(reference,requested)):undefined;},limits,guard,signal??new AbortController().signal);guard();if(resolved.missing.length)return Object.freeze({kind:'pending' as const,id,pending:resolved.missing});
  const native=sourceCoreMethods.retainedAssetReferences.call(live.core),records=independentRecords(live.recovery),sourceBytes=records.reduce((sum,row)=>sum+new TextEncoder().encode(row.json).length,0),metadata={format:'breditor/shared-independent-participant-bytes' as const,formatVersion:1 as const,identity:backup.selection.call(original).identity,document:native.document,revision:native.revision,bindings:resolved.bindings,assets:resolved.assets,sourceBytes,assetBytes:resolved.assetBytes},current=()=>{guard();resolved.check();guard();};
  const encoded=await encodeIndependentParticipant(metadata,records,resolved.payloads,source.originalUploads(id),current,signal);current();const selection={identity:metadata.identity,sha256:await independentParticipantDigest(encoded,signal)};current();result=await backup.read.call(Backup,encoded,selection,options);current();if(JSON.stringify(backup.recovery.call(result))!==JSON.stringify(live.recovery))throw fail();
  return Object.freeze({kind:'ready' as const,id,sourceFamily:'independent-local' as const,family:'independent-local' as const,retained:source.file(),participant:Object.freeze({selection:backup.selection.call(result),file:backup.file.call(result)})});
 }finally{try{if(result)backup.dispose.call(result);live?.dispose();if(selected)assets.dispose.call(selected);if(local)assets.dispose.call(local);if(originFile)backup.dispose.call(originFile);if(original)backup.dispose.call(original);}finally{work.close();}}
}
