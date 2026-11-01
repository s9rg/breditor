/** Replay all saved original phases and both literal parent records before
 * lending the final readonly Native reader. Original recipes remain unchanged. */
import {SharedParticipantBackup as Backup} from '../participant_backup/archive.js';
import type {OriginalRecordReferenceOptions} from '../persistence/original_record_reference_capture.js';
import type {SharedAssetBytesOptions} from '../asset_bytes/types.js';
import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import {snapshotReadFactoryData} from '../operation_read/read_factory_snapshot.js';
import {LoadedNativeReconstructionCurrent as Loaded} from '../selected_native_reconstruction/loaded_current.js';
import {NativeReconstructionWork as Work} from '../selected_native_reconstruction/work_lifetime.js';
import {admitOriginalReconstructionParent} from '../selected_native_reconstruction/original_parent_records.js';
import {admitOriginalReconstructionNative} from '../selected_native_reconstruction/original_native.js';
import {fields,identifier,fail} from '../selected_native_reconstruction/policy.js';
import {visitPacketNativeAlias,type MetadataPacketNativeVisit} from './contract.js';
const backup={read:Backup.read,dispose:Backup.prototype.dispose};
export async function visitOriginalPacketNative<T>(source:Loaded,provided:Readonly<{id:string;read:Pick<OriginalRecordReferenceOptions,'restore'|'editor'>;descriptor:string;assets?:SharedAssetBytesOptions}>,visit:MetadataPacketNativeVisit<T>):Promise<T>{
 source.check();const raw=fields(provided,['id','read','descriptor'],['assets']),id=identifier(raw['id']),entry=source.participant(id);if(entry.family!=='original'||typeof raw['descriptor']!=='string')throw fail('native_reconstruction_policy');
 const supplied=raw['assets']===undefined?{}:fields(raw['assets'],[],['limits','signal']) as SharedAssetBytesOptions,limits=checkRichAssetLimits(supplied.limits),chosen=snapshotReadFactoryData(raw['read'] as Pick<OriginalRecordReferenceOptions,'restore'|'editor'>),work=new Work(source,supplied.signal),options={limits,signal:work.signal},check=work.check;
 let original:Backup|undefined,selected:Awaited<ReturnType<typeof admitOriginalReconstructionNative>>|undefined;
 try{
  const read={...chosen,restore:work.restore(chosen.restore,chosen)};
  original=await backup.read.call(Backup,source.participantFile(id),entry.selection,options);check();await admitOriginalReconstructionParent(source,id,original,read,options,check);check();
  selected=await admitOriginalReconstructionNative(source,id,original,read,raw['descriptor']);check();const native=selected.native;
  return await visitPacketNativeAlias(id,native.core,()=>{check();native.check();},visit,native.state.paired?.versions??[]);
 }finally{try{selected?.close();if(original)backup.dispose.call(original);}finally{work.close();}}
}
