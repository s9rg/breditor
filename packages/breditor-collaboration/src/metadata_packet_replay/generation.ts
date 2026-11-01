/** Re-admit the literal catalog origin, both stored origins and every
 * committed/attempt/pending/LIVE Native generation, without rewriting assets. */
import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import {SharedGenerationParticipantBackup as Backup} from '../generation_participant/backup.js';
import {replayGenerationReferenceRecords,type GenerationRecordReferenceOptions} from '../generation_source/record_reference_capture.js';
import {SharedRichEditor} from '../core.js';
import {forwardProgress} from '../segmented_relay/validation.js';
import type {SharedSegmentedRelayRecovery} from '../segmented_relay/contract.js';
import {nativeRestoreBinding} from '../native_restore_factory.js';
import {snapshotReadFactoryData} from '../operation_read/read_factory_snapshot.js';
import {LoadedNativeReconstructionCurrent as Loaded} from '../selected_native_reconstruction/loaded_current.js';
import {NativeReconstructionWork as Work} from '../selected_native_reconstruction/work_lifetime.js';
import {admitGenerationReconstructionRecords} from '../selected_native_reconstruction/generation_records.js';
import {fields,identifier,fail} from '../selected_native_reconstruction/policy.js';
import type {SharedAssetBytesOptions} from '../asset_bytes/types.js';
import {visitPacketNativeAlias,type MetadataPacketNativeVisit} from './contract.js';
const backup={read:Backup.read,records:Backup.prototype.records,dispose:Backup.prototype.dispose},verify=SharedRichEditor.prototype.verifySegmentedRecoveryOrigin;
type Read=Pick<GenerationRecordReferenceOptions,'restoreSegmented'|'editor'>;
export async function visitGenerationPacketNative<T>(source:Loaded,provided:Readonly<{id:string;read:Read;descriptor:string;assets?:SharedAssetBytesOptions}>,visit:MetadataPacketNativeVisit<T>):Promise<T>{
 source.check();const raw=fields(provided,['id','read','descriptor'],['assets']),id=identifier(raw['id']),entry=source.participant(id);if(entry.family!=='generation'||typeof raw['descriptor']!=='string')throw fail('native_reconstruction_policy');
 const chosen=snapshotReadFactoryData(raw['read'] as Read);fields(chosen,['restoreSegmented'],['editor']);if(typeof chosen.restoreSegmented!=='function')throw fail('native_reconstruction_policy');
 if(chosen.editor!==undefined&&(!chosen.editor||typeof chosen.editor!=='object'||Array.isArray(chosen.editor)||['selectionEditing','reviewedHistory','searchHistory','segmentedHistory'].some(key=>key in chosen.editor!)))throw fail('native_reconstruction_policy');
 const supplied=raw['assets']===undefined?{}:fields(raw['assets'],[],['limits','signal']) as SharedAssetBytesOptions,limits=checkRichAssetLimits(supplied.limits),work=new Work(source,supplied.signal),options={limits,signal:work.signal},check=work.check;
 let original:Backup|undefined,live:Awaited<ReturnType<typeof replayGenerationReferenceRecords>>|undefined;
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
  const selected=live;return await visitPacketNativeAlias(id,selected.core,()=>{check();selected.check();},visit);
 }finally{try{live?.dispose();if(original)backup.dispose.call(original);}finally{work.close();}}
}
