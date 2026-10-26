/** Reconstruct snapshot-backed or flat-local native work as an EXPLICIT flat
 * output. Literal provenance and actual save phases remain intact. Native Undo,
 * both comment histories, ordered immutable versions and whole uploads continue;
 * this DATA recipe creates no journal, author lease or room activation. */
import {checkRichAssetLimits,readRichAssetBackup,RichAssetArchive,type RichRetainedAssetReference} from '@breditor/experimental-rich-content';
import {snapshotIndependentRecoveryFactory} from '../independent_recovery/factory_policy.js';
import type {SharedIndependentRecoveryFactory} from '../independent_recovery/contract.js';
import {snapshotReadFactoryData} from '../operation_read/read_factory_snapshot.js';
import {replayLocalOperationRecovery,verifyLocalOperationContinuation,type LocalPortableReplay} from '../independent_local_operation/portable_replay.js';
import {localPortableReferences} from '../independent_local_operation/portable_references.js';
import type {SharedIndependentHistoryRecovery} from '../independent_history/contract.js';
import {sourceNativeRecoveryRead} from '../source_native_read.js';
import {resolveSelectedAssetBytes} from '../asset_bytes/resolve.js';
import type {SharedAssetBytesOptions,SharedAssetBytesResolver,SharedAssetBytesPending} from '../asset_bytes/types.js';
import {checkNativeInputUploadContinuation} from '../native_input_operation/upload_baseline.js';
import {encodeFlatLocalCaptureState} from '../flat_local_operation/capture_state.js';
import {FlatLocalArchive as Archive,flatLocalArchive as archive} from '../flat_local_operation/archive.js';
import {FlatLocalProvenance,flatLocalFraming as framing} from '../flat_local_operation/framing.js';
import {admitLocalInputReconstructionRecords} from './local_input_records.js';
import {LoadedNativeReconstructionCurrent as Loaded} from './loaded_current.js';
import {NativeReconstructionWork as Work} from './work_lifetime.js';
import {fields,identifier,fail} from './policy.js';
export type LocalInputReconstructionReadFactory=Omit<SharedIndependentRecoveryFactory,'readOnly'|'review'>&Readonly<{readOnly:true;review:Omit<SharedIndependentRecoveryFactory['review'],'access'>&Readonly<{access:'read_only'}>}>;
const assets={read:readRichAssetBackup,blob:RichAssetArchive.prototype.blob,entries:RichAssetArchive.prototype.entries,dispose:RichAssetArchive.prototype.dispose};
export async function buildLocalInputReconstructionRecipe(source:Loaded,provided:Readonly<{id:string;outputFamily:'local-operation-flat';session:LocalInputReconstructionReadFactory;descriptor:string;assets?:SharedAssetBytesOptions;resolveAsset?:SharedAssetBytesResolver}>){
 source.check();const raw=fields(provided,['id','outputFamily','session','descriptor'],['assets','resolveAsset']),id=identifier(raw['id']),entry=source.participant(id);if(entry.family!=='local-operation-snapshot'&&entry.family!=='local-operation-flat'||raw['outputFamily']!=='local-operation-flat'||typeof raw['descriptor']!=='string')throw fail('native_reconstruction_policy');
 const chosen=snapshotIndependentRecoveryFactory(entry.selection.original,snapshotReadFactoryData(raw['session'] as LocalInputReconstructionReadFactory)),supplied=raw['assets']===undefined?{}:fields(raw['assets'],[],['limits','signal']) as SharedAssetBytesOptions,limits=checkRichAssetLimits(supplied.limits),resolve=raw['resolveAsset'] as SharedAssetBytesResolver|undefined;if(resolve!==undefined&&typeof resolve!=='function')throw fail('native_reconstruction_policy');
 const work=new Work(source,supplied.signal),signal=work.signal,check=work.check,options={limits,signal};let admitted:Awaited<ReturnType<typeof admitLocalInputReconstructionRecords>>|undefined,local:RichAssetArchive|undefined,selected:RichAssetArchive|undefined,live:LocalPortableReplay|undefined,graph:FlatLocalProvenance|undefined,result:Archive|undefined;
 try{
  const history=chosen.documentHistory,session={...chosen,documentHistory:history.kind==='original'?{...history,restoreOriginal:work.restore(history.restoreOriginal,history)}:{...history,restoreSegmented:work.restore(history.restoreSegmented,history)}};
  admitted=await admitLocalInputReconstructionRecords(source,id,session,options,check);check();const input=admitted.input,values:{recovery:SharedIndependentHistoryRecovery;cut:string|null}[]=[];
  for(const cut of input.targets)values.push({recovery:await admitted.decode(cut),cut:null});
  for(const[cut,hash]of[[admitted.current,admitted.intent.current],[admitted.pending,admitted.intent.pending]]as const)if(cut)values.push({recovery:await admitted.decode(cut),cut:hash});
  values.push({recovery:admitted.live as SharedIndependentHistoryRecovery,cut:null});const references=new Map<string,RichRetainedAssetReference>(input.bindings.map(({asset,generation})=>[JSON.stringify([asset,generation]),{asset,generation}])),pending:SharedAssetBytesPending[]=[];
  for(const value of values){
   const next=await replayLocalOperationRecovery(entry.selection.original,session,value.recovery,check);let kept=false;
   try{
    if(JSON.stringify(next.recovery)!==JSON.stringify(value.recovery))throw fail();if(JSON.stringify(sourceNativeRecoveryRead(next.core).descriptor())!==raw['descriptor'])throw fail('native_reconstruction_policy');
    if(live)verifyLocalOperationContinuation(next,live);const found=localPortableReferences(next.core,next.recovery,next.check);if(value.cut!==null&&JSON.stringify(found)!==JSON.stringify(admitted.references.get(value.cut)))throw fail();
    for(const ref of found.references){references.set(JSON.stringify([ref.asset,ref.generation]),ref);if(references.size>100000)throw fail();}if(found.pending.length)pending.push({kind:'source',pending:found.pending});
    next.check();live?.dispose();live=next;kept=true;
   }finally{if(!kept)next.dispose();}check();
  }
  if(!live)throw fail();if(pending.length)return Object.freeze({kind:'pending' as const,id,pending});
  local=await assets.read(source.originalUploads(id),options);check();selected=await assets.read(source.selectedUploads(id),options);check();checkNativeInputUploadContinuation(input.entries,assets.entries.call(local),()=>{throw fail();});
  const guard=()=>{check();live!.check();},refs=[...references.values()].sort((a,b)=>a.asset<b.asset?-1:a.asset>b.asset?1:a.generation<b.generation?-1:a.generation>b.generation?1:0),bindings=new Map(input.bindings.map(ref=>[JSON.stringify([ref.asset,ref.generation]),ref]));
  const resolved=await resolveSelectedAssetBytes(refs,async(reference,requested)=>{guard();const blob=assets.blob.call(local!,reference.asset)??assets.blob.call(selected!,reference.asset)??input.blob(reference.asset,reference.generation);if(blob)return{...reference,identity:bindings.get(JSON.stringify([reference.asset,reference.generation]))?.identity??(/^sha256:[a-f0-9]{64}$/.test(reference.asset)?'content-addressed':'host-verified'),blob,check:guard};return resolve?await work.call(()=>resolve(reference,requested)):undefined;},limits,guard,signal);guard();if(resolved.missing.length)return Object.freeze({kind:'pending' as const,id,pending:resolved.missing});
  const current=()=>{guard();resolved.check();guard();},encoded=await encodeFlatLocalCaptureState({operation:input.identity,selection:entry.selection,intent:admitted.intent,observed:admitted.observed,current:admitted.current,pending:admitted.pending,live:live.recovery,uploads:source.originalUploads(id),bindings:resolved.bindings,assets:resolved.assets,assetBytes:resolved.assetBytes,payloads:resolved.payloads},current);current();
  graph=await input.append(encoded.state,encoded.extras,current);current();result=await archive.read.call(Archive,framing.file.call(graph),{original:entry.selection.original,...framing.selection.call(graph)},{session,checkAuthority:current,limits,signal});current();if(JSON.stringify(archive.live.call(result))!==JSON.stringify(live.recovery))throw fail();
  return Object.freeze({kind:'ready' as const,id,sourceFamily:entry.family,family:'local-operation-flat' as const,retained:source.file(),participant:Object.freeze({selection:archive.selection.call(result),file:archive.file.call(result)})});
 }finally{try{if(result)archive.dispose.call(result);if(graph)framing.dispose.call(graph);live?.dispose();if(selected)assets.dispose.call(selected);if(local)assets.dispose.call(local);admitted?.close();}finally{work.close();}}
}
