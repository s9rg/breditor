/** Construct a generation participant from retained complete native LIVE after
 * admitting every earlier phase and both literal origins. Native replay owns
 * continuity and Undo, not AST equality or facade revision counters. The result
 * is DATA only; current factories and policy are required for later recovery.
 */
import {readRichAssetBackup,RichAssetArchive,checkRichAssetLimits} from '@breditor/experimental-rich-content';
import {SharedGenerationParticipantBackup as Backup} from '../generation_participant/backup.js';
import {encodeGenerationParticipant} from '../generation_participant/codec.js';
import {encodeGenerationAssetData} from '../generation_assets/encode_data.js';
import {replayGenerationReferenceRecords,type GenerationRecordReferenceOptions} from '../generation_source/record_reference_capture.js';
import {recordedGenerationReferences} from '../generation_source/recorded_references.js';
import {SharedRichEditor} from '../core.js';
import {forwardProgress} from '../segmented_relay/validation.js';
import type {SharedSegmentedRelayRecovery} from '../segmented_relay/contract.js';
import {nativeRestoreBinding} from '../native_restore_factory.js';
import {sourceCoreMethods as native} from '../source_native_read.js';
import {resolveSelectedAssetBytes} from '../asset_bytes/resolve.js';
import type {SharedAssetBytesOptions,SharedAssetBytesResolver} from '../asset_bytes/types.js';
import {snapshotReadFactoryData} from '../operation_read/read_factory_snapshot.js';
import {LoadedNativeReconstructionCurrent as Loaded} from './loaded_current.js';
import {NativeReconstructionWork as Work} from './work_lifetime.js';
import {admitGenerationReconstructionRecords} from './generation_records.js';
import {fields,identifier,fail} from './policy.js';
const backup={read:Backup.read,records:Backup.prototype.records,recovery:Backup.prototype.sourceRecovery,selection:Backup.prototype.selection,file:Backup.prototype.file,blob:Backup.prototype.blob,dispose:Backup.prototype.dispose};
const assets={read:readRichAssetBackup,blob:RichAssetArchive.prototype.blob,dispose:RichAssetArchive.prototype.dispose},verify=SharedRichEditor.prototype.verifySegmentedRecoveryOrigin;
type Read=Pick<GenerationRecordReferenceOptions,'restoreSegmented'|'editor'>;
export async function buildGenerationReconstructionRecipe(source:Loaded,provided:Readonly<{id:string;read:Read;descriptor:string;assets?:SharedAssetBytesOptions;resolveAsset?:SharedAssetBytesResolver}>){
 source.check();const raw=fields(provided,['id','read','descriptor'],['assets','resolveAsset']),id=identifier(raw['id']),entry=source.participant(id);
 if(entry.family!=='generation'||typeof raw['descriptor']!=='string'||raw['resolveAsset']!==undefined&&typeof raw['resolveAsset']!=='function')throw fail('native_reconstruction_policy');
 const chosen=snapshotReadFactoryData(raw['read'] as Read);fields(chosen,['restoreSegmented'],['editor']);if(typeof chosen.restoreSegmented!=='function')throw fail('native_reconstruction_policy');
 if(chosen.editor!==undefined&&(!chosen.editor||typeof chosen.editor!=='object'||Array.isArray(chosen.editor)||['selectionEditing','reviewedHistory','searchHistory','segmentedHistory'].some(key=>key in chosen.editor!)))throw fail('native_reconstruction_policy');
 const supplied=raw['assets']===undefined?{}:fields(raw['assets'],[],['limits','signal']) as SharedAssetBytesOptions,limits=checkRichAssetLimits(supplied.limits),resolve=raw['resolveAsset'] as SharedAssetBytesResolver|undefined;
 const work=new Work(source,supplied.signal),signal=work.signal,options={limits,signal},check=work.check;
 let original:Backup|undefined,local:RichAssetArchive|undefined,selected:RichAssetArchive|undefined,live:Awaited<ReturnType<typeof replayGenerationReferenceRecords>>|undefined,result:Backup|undefined;
 try{
  const read={...chosen,restoreSegmented:work.restore(chosen.restoreSegmented,chosen)},binding=nativeRestoreBinding(read.restoreSegmented,read);
  original=await backup.read.call(Backup,source.participantFile(id),entry.selection,options);check();
  const admitted=await admitGenerationReconstructionRecords(source,id,options,check),states=[{role:'catalog-origin',records:backup.records.call(original)},...admitted.origins,...admitted.states];
  for(const state of states){
   check();const next=await replayGenerationReferenceRecords(admitted.identity,state.records,binding,read.editor,raw['descriptor'],check);let keep=false;
   try{
    if(live){verify.call(next.core,live.core);if(live.source.versions.some((packet,index)=>next.source.versions[index]!==packet))throw fail('native_reconstruction_requires_merge');if(admitted.identity.kind!=='local')forwardProgress((live.recovery as SharedSegmentedRelayRecovery).relay,(next.recovery as SharedSegmentedRelayRecovery).relay);live.check();next.check();}
    live?.dispose();live=next;keep=true;
   }finally{if(!keep)next.dispose();}
  }
  const last=admitted.states.at(-1);if(!live||last?.slot!=='live')throw fail();
  const records=last.records,references=recordedGenerationReferences(live.core,admitted.identity,records,live.check);check();
  if(references.pending.length)return Object.freeze({kind:'pending' as const,id,pending:[{kind:'source' as const,pending:references.pending}]});
  local=await assets.read(source.originalUploads(id),options);check();selected=await assets.read(source.selectedUploads(id),options);check();
  const guard=()=>{check();live!.check();},resolved=await resolveSelectedAssetBytes(references.references,async(reference,requested)=>{
   guard();const blob=assets.blob.call(local!,reference.asset)??assets.blob.call(selected!,reference.asset);if(blob)return{...reference,identity:'content-addressed',blob,check:guard};
   const retained=backup.blob.call(original!,reference.asset,reference.generation);if(retained)return{...reference,identity:/^sha256:[a-f0-9]{64}$/.test(reference.asset)?'content-addressed':'host-verified',blob:retained,check:guard};
   return resolve?await work.call(()=>resolve(reference,requested)):undefined;
  },limits,guard,signal);guard();
  if(resolved.missing.length)return Object.freeze({kind:'pending' as const,id,pending:resolved.missing});
  const point=native.retainedAssetReferences.call(live.core),metadata={format:'breditor/shared-generation-asset-bytes' as const,formatVersion:1 as const,identity:admitted.identity,document:point.document,revision:point.revision,bindings:resolved.bindings,assets:resolved.assets,sourceBytes:records.reduce((sum,row)=>sum+new TextEncoder().encode(row.json).length,0),assetBytes:resolved.assetBytes};
  const current=()=>{guard();resolved.check();guard();},selectedFile=await encodeGenerationAssetData({metadata,records,payloads:resolved.payloads},current,signal);current();
  const encoded=await encodeGenerationParticipant(backup.selection.call(original).identity,selectedFile,source.originalUploads(id),signal);current();
  result=await backup.read.call(Backup,encoded.file,encoded.selection,options);current();
  if(JSON.stringify(backup.records.call(result))!==JSON.stringify(records)||JSON.stringify(backup.recovery.call(result))!==JSON.stringify(live.recovery))throw fail();
  return Object.freeze({kind:'ready' as const,id,sourceFamily:'generation' as const,family:'generation' as const,retained:source.file(),participant:Object.freeze({selection:backup.selection.call(result),file:backup.file.call(result)})});
 }finally{
  try{if(result)backup.dispose.call(result);live?.dispose();if(selected)assets.dispose.call(selected);if(local)assets.dispose.call(local);if(original)backup.dispose.call(original);}finally{work.close();}
 }
}
