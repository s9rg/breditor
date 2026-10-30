/** Read both complete archive roles from genuine admitted current/cut readers.
 * No supplied upload list can omit a lane, old bytes, or unreferenced uploads. */
import {RichAssetArchive} from '@breditor/experimental-rich-content';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {SelectedRoomCurrentArchive} from '../selected_room_current/archive.js';
import {PhysicalRoomRecordCutArchive} from '../physical_room_record_cut/archive.js';
import type {SelectedRoomUploadPin} from '../selected_room_provider/contract.js';
import type {SelectedProviderAssetInfo} from '../selected_room_provider/projection.js';
import {equal} from '../selected_local_metadata_delivery/data.js';
import {fail} from './error.js';
const current={approval:SelectedRoomCurrentArchive.prototype.approval,current:SelectedRoomCurrentArchive.prototype.current,manifest:SelectedRoomCurrentArchive.prototype.manifest,file:SelectedRoomCurrentArchive.prototype.uploadFile};
const cut={root:PhysicalRoomRecordCutArchive.prototype.root,selection:PhysicalRoomRecordCutArchive.prototype.selection,file:PhysicalRoomRecordCutArchive.prototype.uploads};
const read=RichAssetArchive.read,entries=RichAssetArchive.prototype.entries,payload=RichAssetArchive.prototype.blob,dispose=RichAssetArchive.prototype.dispose;
export const localMetadataAssetInfo=(row:SelectedProviderAssetInfo):string=>JSON.stringify([row.asset,row.mime,row.bytes,row.width,row.height]);
export async function readLocalMetadataUploadInventory(room:SelectedRoomCurrentArchive,record:PhysicalRoomRecordCutArchive,options:SharedArchiveIntegrityOptions,check:()=>void,includePayloads=false):Promise<{pins:readonly SelectedRoomUploadPin[];assets:ReadonlyMap<string,SelectedProviderAssetInfo>;payloads:ReadonlyMap<string,Blob>}>{
 check();const approval=current.approval.call(room),selected=current.current.call(room),manifest=current.manifest.call(room),root=cut.root.call(record),adoption=approval.choice.adoption;
 if(!equal(selected.selection,cut.selection.call(record))||adoption.phase!=='ready'||adoption.unreconciledParticipants.length||adoption.participants.length!==root.participants.length||manifest.uploads.length!==adoption.participants.length||adoption.participants.length>1024)throw fail('local_metadata_assets_state');
 const sources=[];
 for(const [index,lane]of adoption.participants.entries()){
  const native=root.participants[index],upload=manifest.uploads[index];if(!native||native.id!==lane.id||native.family!==lane.family||!upload||upload.id!==lane.id||lane.state!=='complete')throw fail('local_metadata_assets_state');
  sources.push({id:lane.id,role:'origin' as const,file:cut.file.call(record,lane.id),limits:lane.limits,sha256:lane.sourceUploadsSha256});
 }
 for(const [index,lane]of adoption.participants.entries())sources.push({id:lane.id,role:'selected' as const,file:current.file.call(room,lane.id),limits:lane.limits,sha256:manifest.uploads[index]!.sha256});
 if(sources.reduce((n,row)=>n+row.file.size,0)>512*1024*1024)throw fail('local_metadata_assets_upload_budget');
 const integrity=prepareArchiveIntegrity(options),assets=new Map<string,SelectedProviderAssetInfo>(),payloads=new Map<string,Blob>(),pins:SelectedRoomUploadPin[]=[];
 for(const row of sources){
  check();if(await integrity.digest(row.file)!==row.sha256)throw fail('local_metadata_assets_state');check();
  const archive=await read.call(RichAssetArchive,row.file,{limits:row.limits,...(options.signal?{signal:options.signal}:{})});
  try{check();const values=entries.call(archive);for(const value of values){const next:SelectedProviderAssetInfo={asset:value.asset,mime:value.mime,bytes:value.bytes,width:value.width,height:value.height},prior=assets.get(value.asset);if(prior&&localMetadataAssetInfo(prior)!==localMetadataAssetInfo(next))throw fail('local_metadata_assets_state');assets.set(value.asset,next);if(includePayloads){const file=payload.call(archive,value.asset);if(!file)throw fail('local_metadata_assets_state');payloads.set(value.asset,file);}}pins.push({id:row.id,role:row.role,bytes:row.file.size,sha256:row.sha256,entries:values});check();}finally{dispose.call(archive);}
 }
 return{pins,assets,payloads};
}
