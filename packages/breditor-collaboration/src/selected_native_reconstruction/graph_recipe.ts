/** Append complete retained native work to its literal restored provenance.
 * Old CURRENT/PENDING/observed values remain old save phases. The new graph is
 * DATA, not a source ACK, retired writer, authenticated room or AST reconstruction. */
import {readRichAssetBackup,RichAssetArchive,checkRichAssetLimits} from '@breditor/experimental-rich-content';
import {snapshotIndependentDeliveryFactory} from '../independent_delivery_recovery/factory_policy.js';
import {snapshotReadFactoryData} from '../operation_read/read_factory_snapshot.js';
import {checkIndependentDeliveryRecords,independentDeliveryRecords} from '../independent_delivery_source/records.js';
import {portableCutRecovery} from '../independent_operation/portable_cut.js';
import {replayPortableRecovery,verifyPortableContinuation} from '../independent_operation/portable_replay.js';
import {portableRecoveryReferences} from '../independent_operation/portable_references.js';
import {sourceNativeRecoveryRead} from '../source_native_read.js';
import {SharedIndependentDeliveryParticipantBackup as Backup} from '../independent_delivery_participant/backup.js';
import {independentDeliveryParticipantDigest as digest} from '../independent_delivery_participant/codec.js';
import {resolveSelectedAssetBytes} from '../asset_bytes/resolve.js';
import {encodeRestoredStateFrame} from '../restored_graph/state_codec.js';
import {appendRestoredGraphFrame} from '../restored_graph/append_frame.js';
import {RestoredOperationGraphArchive as Archive} from '../restored_graph/archive.js';
import {checkRestoredOperationInputBudget} from '../restored_graph/limits.js';
import {sameOperationCut} from '../independent_operation/cut_codec.js';
import {admitGraphReconstructionRecords} from './graph_records.js';
import {LoadedNativeReconstructionCurrent as Loaded} from './loaded_current.js';
import {NativeReconstructionWork as Work} from './work_lifetime.js';
import {fields,identifier,fail} from './policy.js';
import type {DeliveryReconstructionReadFactory} from './delivery_recipe.js';
import type {SharedAssetBytesOptions,SharedAssetBytesResolver,SharedAssetBytesPending} from '../asset_bytes/types.js';
import type {SharedIndependentDeliveryRecovery} from '../independent_delivery/contract.js';
import type {RichRetainedAssetReference} from '@breditor/experimental-rich-content';
const assets={read:readRichAssetBackup,blob:RichAssetArchive.prototype.blob,dispose:RichAssetArchive.prototype.dispose},originalBlob=Backup.prototype.blob;
const archive={read:Archive.read,file:Archive.prototype.file,selection:Archive.prototype.selection,live:Archive.prototype.liveSource,current:Archive.prototype.currentCut,pending:Archive.prototype.pendingCut,uploads:Archive.prototype.uploadBackup,dispose:Archive.prototype.dispose};
export async function buildGraphReconstructionRecipe(source:Loaded,provided:Readonly<{id:string;session:DeliveryReconstructionReadFactory;descriptor:string;assets?:SharedAssetBytesOptions;resolveAsset?:SharedAssetBytesResolver}>){
 source.check();const raw=fields(provided,['id','session','descriptor'],['assets','resolveAsset']),id=identifier(raw['id']),entry=source.participant(id);if(entry.family!=='restored-graph'||typeof raw['descriptor']!=='string')throw fail('native_reconstruction_policy');
 const chosen=snapshotIndependentDeliveryFactory(entry.selection.original,snapshotReadFactoryData(raw['session'] as DeliveryReconstructionReadFactory),true),supplied=raw['assets']===undefined?{}:fields(raw['assets'],[],['limits','signal']) as SharedAssetBytesOptions,limits=checkRichAssetLimits(supplied.limits),resolve=raw['resolveAsset'] as SharedAssetBytesResolver|undefined;
 if(resolve!==undefined&&typeof resolve!=='function')throw fail('native_reconstruction_policy');
 const work=new Work(source,supplied.signal),signal=work.signal,check=work.check,options={limits,signal};
 let admitted:Awaited<ReturnType<typeof admitGraphReconstructionRecords>>|undefined,local:RichAssetArchive|undefined,selected:RichAssetArchive|undefined,live:Awaited<ReturnType<typeof replayPortableRecovery>>|undefined,result:Archive|undefined;
 try{
  const history=chosen.documentHistory,session={...chosen,documentHistory:history.kind==='original'?{...history,restoreOriginal:work.restore(history.restoreOriginal,history)}:{...history,restoreSegmented:work.restore(history.restoreSegmented,history)}};
  admitted=await admitGraphReconstructionRecords(source,id,session,options,check);check();const input=admitted.prepared,factory=input.factory;
  const liveData=await checkIndependentDeliveryRecords(entry.selection.original.identity.source,independentDeliveryRecords(admitted.live as SharedIndependentDeliveryRecovery));check();if(JSON.stringify(liveData)!==JSON.stringify(admitted.live))throw fail();
  const values:{recovery:SharedIndependentDeliveryRecovery;cut:string|null}[]=[];
  for(const cut of input.targets){values.push({recovery:await portableCutRecovery(factory,input.identity,cut),cut:null});check();}
  for(const[cut,id]of[[admitted.current,admitted.intent.current],[admitted.pending,admitted.intent.pending]]as const)if(cut){values.push({recovery:await portableCutRecovery(factory,input.identity,cut),cut:id});check();}
  values.push({recovery:liveData,cut:null});let before:SharedIndependentDeliveryRecovery|undefined;
  const references=new Map<string,RichRetainedAssetReference>(),pending:SharedAssetBytesPending[]=[];
  for(const value of values){
   const next=await replayPortableRecovery(factory,value.recovery,check);let kept=false;
   try{
    if(JSON.stringify(sourceNativeRecoveryRead(next.core).descriptor())!==raw['descriptor'])throw fail('native_reconstruction_policy');
    if(live&&before){verifyPortableContinuation(next,value.recovery,live,before);if(before.source.versions.some((packet,index)=>value.recovery.source.versions[index]!==packet))throw fail('native_reconstruction_requires_merge');}
    const found=portableRecoveryReferences(next.core,value.recovery,next.check);if(value.cut!==null&&JSON.stringify(found)!==JSON.stringify(admitted.references.get(value.cut)))throw fail();
    for(const ref of found.references){references.set(JSON.stringify([ref.asset,ref.generation]),ref);if(references.size>100000)throw fail();}if(found.pending.length)pending.push({kind:'source' as const,pending:found.pending});
    next.check();live?.dispose();live=next;before=value.recovery;kept=true;
   }finally{if(!kept)next.dispose();}
   check();
  }
  if(!live)throw fail();if(pending.length)return Object.freeze({kind:'pending' as const,id,pending});
  local=await assets.read(source.originalUploads(id),options);check();selected=await assets.read(source.selectedUploads(id),options);check();
  const guard=()=>{check();live!.check();},refs=[...references.values()].sort((a,b)=>a.asset<b.asset?-1:a.asset>b.asset?1:a.generation<b.generation?-1:a.generation>b.generation?1:0);
  const resolved=await resolveSelectedAssetBytes(refs,async(reference,requested)=>{
   guard();const blob=assets.blob.call(local!,reference.asset)??assets.blob.call(selected!,reference.asset);if(blob)return{...reference,identity:'content-addressed',blob,check:guard};
   const retained=await input.blob(reference.asset,reference.generation)??originalBlob.call(admitted!.original,reference.asset,reference.generation);guard();if(retained)return{...reference,identity:/^sha256:[a-f0-9]{64}$/.test(reference.asset)?'content-addressed':'host-verified',blob:retained,check:guard};
   return resolve?await work.call(()=>resolve(reference,requested)):undefined;
  },limits,guard,signal);guard();if(resolved.missing.length)return Object.freeze({kind:'pending' as const,id,pending:resolved.missing});
  const current=()=>{guard();resolved.check();guard();},frame=await encodeRestoredStateFrame({operation:input.identity,original:entry.selection.original,originalFile:input.original,intent:admitted.intent,observed:admitted.observed,current:admitted.current,pending:admitted.pending,live:independentDeliveryRecords(liveData),uploads:source.originalUploads(id),bindings:resolved.bindings,assets:resolved.assets,assetBytes:resolved.assetBytes,payloads:resolved.payloads},current);current();
  const flat=await input.flatten(current);current();const encoded=await appendRestoredGraphFrame({...flat,reference:{kind:input.kind,manifestSha256:input.selection.manifestSha256}},frame,current);current();checkRestoredOperationInputBudget(encoded.file);
  result=await archive.read.call(Archive,encoded.file,encoded.selection,{session,checkAuthority:current,limits,signal});current();
  if(JSON.stringify(archive.live.call(result))!==JSON.stringify(liveData)||!sameNullable(archive.current.call(result),admitted.current)||!sameNullable(archive.pending.call(result),admitted.pending)||await digest(archive.uploads.call(result),signal)!==await digest(source.originalUploads(id),signal))throw fail();current();
  return Object.freeze({kind:'ready' as const,id,sourceFamily:'restored-graph' as const,family:'restored-graph' as const,retained:source.file(),participant:Object.freeze({selection:archive.selection.call(result),file:archive.file.call(result)})});
 }finally{try{if(result)archive.dispose.call(result);live?.dispose();if(selected)assets.dispose.call(selected);if(local)assets.dispose.call(local);admitted?.close();}finally{work.close();}}
}
function sameNullable(a:Parameters<typeof sameOperationCut>[0],b:Parameters<typeof sameOperationCut>[1]|null){return b===null?a===null:sameOperationCut(a,b);}
