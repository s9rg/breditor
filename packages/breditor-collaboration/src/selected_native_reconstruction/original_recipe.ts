/** Construct a genuine original participant DATA file from retained LIVE work.
 * Complete committed/pending/LIVE origins stay attached separately; the recipe
 * is not an editable source, a source-save ACK or permission to retire originals. */
import {readRichAssetBackup,RichAssetArchive,checkRichAssetLimits} from '@breditor/experimental-rich-content';
import {SharedParticipantBackup} from '../participant_backup/archive.js';
import {encodeParticipantFile} from '../participant_backup/format.js';
import type {SharedParticipantBackupSelection} from '../participant_backup/types.js';
import {captureRecordedAssetReferences,SharedAssetReferenceCapture} from '../asset_references_capture.js';
import {captureSharedAssetBytes,SharedAssetBytesCapture} from '../asset_bytes/capture.js';
import {exportSharedAssetBytesBackup} from '../asset_bytes/export_backup.js';
import type {SharedAssetBytesOptions,SharedAssetBytesResolver,SharedAssetBytesPending} from '../asset_bytes/types.js';
import type {OriginalRecordReferenceOptions} from '../persistence/original_record_reference_capture.js';
import type {SelectedRoomCurrentFile} from '../selected_room_current/contract.js';
import {LoadedNativeReconstructionCurrent} from './loaded_current.js';
import {snapshotReadFactoryData} from '../operation_read/read_factory_snapshot.js';
import {admitOriginalReconstructionNative} from './original_native.js';
import {NativeReconstructionWork} from './work_lifetime.js';
import {fail,fields,identifier} from './policy.js';
const participant={read:SharedParticipantBackup.read,selection:SharedParticipantBackup.prototype.selection,file:SharedParticipantBackup.prototype.file,blob:SharedParticipantBackup.prototype.blob,verify:SharedParticipantBackup.prototype.verifySource,dispose:SharedParticipantBackup.prototype.dispose};
const upload={blob:RichAssetArchive.prototype.blob,dispose:RichAssetArchive.prototype.dispose};
const capture={dispose:SharedAssetReferenceCapture.prototype.dispose,bytesDispose:SharedAssetBytesCapture.prototype.dispose};
export type OriginalReconstructionRecipe=Readonly<{kind:'ready';id:string;sourceFamily:'original';family:'original';retained:SelectedRoomCurrentFile;participant:Readonly<{selection:SharedParticipantBackupSelection;file:Blob}>}>|Readonly<{kind:'pending';id:string;pending:readonly SharedAssetBytesPending[]}>;
export async function buildOriginalReconstructionRecipe(source:LoadedNativeReconstructionCurrent,provided:Readonly<{id:string;read:Pick<OriginalRecordReferenceOptions,'restore'|'editor'>;descriptor:string;assets?:SharedAssetBytesOptions;resolveAsset?:SharedAssetBytesResolver}>):Promise<OriginalReconstructionRecipe> {
 source.check();const raw=fields(provided,['id','read','descriptor'],['assets','resolveAsset']),id=identifier(raw['id']),entry=source.participant(id);if(entry.family!=='original'||typeof raw['descriptor']!=='string'||raw['resolveAsset']!==undefined&&typeof raw['resolveAsset']!=='function')throw fail('native_reconstruction_policy');
 const supplied=raw['assets']===undefined?{}:fields(raw['assets'],[],['limits','signal']) as SharedAssetBytesOptions,limits=checkRichAssetLimits(supplied.limits),chosen=snapshotReadFactoryData(raw['read'] as Pick<OriginalRecordReferenceOptions,'restore'|'editor'>),work=new NativeReconstructionWork(source,supplied.signal),options={limits,signal:work.signal},signal=work.signal,check=work.check,resolve=raw['resolveAsset'] as SharedAssetBytesResolver|undefined;
 let original:SharedParticipantBackup|undefined,local:RichAssetArchive|undefined,selected:RichAssetArchive|undefined,native:Awaited<ReturnType<typeof admitOriginalReconstructionNative>>|undefined,references:SharedAssetReferenceCapture|undefined,bytes:SharedAssetBytesCapture|undefined,result:SharedParticipantBackup|undefined;
 try{
  const read={...chosen,restore:work.restore(chosen.restore,chosen)};
  check();original=await participant.read.call(SharedParticipantBackup,source.participantFile(id),entry.selection,options);check();local=await readRichAssetBackup(source.originalUploads(id),options);check();selected=await readRichAssetBackup(source.selectedUploads(id),options);check();
  native=await admitOriginalReconstructionNative(source,id,original,read,raw['descriptor']);check();references=captureRecordedAssetReferences(native.native.core,native.readers,()=>{check();native!.native.check();});
  const value=await captureSharedAssetBytes({source:references,...options,resolveAsset:async(reference,requested)=>{check();native!.native.check();const blob=upload.blob.call(local!,reference.asset)??upload.blob.call(selected!,reference.asset);if(blob)return{...reference,identity:'content-addressed',blob,check(){check();native!.native.check();}};const retained=participant.blob.call(original!,reference.asset,reference.generation);if(retained)return{...reference,identity:/^sha256:[a-f0-9]{64}$/.test(reference.asset)?'content-addressed':'host-verified',blob:retained,check(){check();native!.native.check();}};return resolve?await work.call(()=>resolve(reference,requested)):undefined;}});check();native.native.check();if(value.kind==='pending')return Object.freeze({kind:'pending',id,pending:value.pending});bytes=value.capture;
  const selectedFile=await exportSharedAssetBytesBackup(bytes,signal?{signal}:{});check();native.native.check();const encoded=await encodeParticipantFile(participant.selection.call(original).identity,selectedFile,source.originalUploads(id),signal);check();native.native.check();result=await participant.read.call(SharedParticipantBackup,encoded.file,encoded.selection,options);participant.verify.call(result,references);check();native.native.check();
  return Object.freeze({kind:'ready',id,sourceFamily:'original',family:'original',retained:source.file(),participant:Object.freeze({selection:participant.selection.call(result),file:participant.file.call(result)})});
 }finally{try{if(result)participant.dispose.call(result);if(bytes)capture.bytesDispose.call(bytes);if(references)capture.dispose.call(references);native?.close();if(selected)upload.dispose.call(selected);if(local)upload.dispose.call(local);if(original)participant.dispose.call(original);}finally{work.close();}}
}
