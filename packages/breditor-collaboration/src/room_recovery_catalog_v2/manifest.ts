/** Closed family tags select only closed component readers, never executable recovery code. */
import {inventoryIdentity} from "../room_participant_inventory/parse.js";
import {frozen,MAX_SHARED_ROOM_PARTICIPANT_INVENTORY_BYTES} from "../room_participant_inventory/policy.js";
import {participantSelection} from "../participant_backup/policy.js";
import {MAX_SHARED_PARTICIPANT_BACKUP_BYTES} from "../participant_backup/format.js";
import {generationParticipantSelection} from "../generation_participant/policy.js";
import {MAX_GENERATION_PARTICIPANT_BYTES} from "../generation_participant/codec.js";
import {object,id,bytes,fileIdentity,failure,MAX_SHARED_ROOM_RECOVERY_CATALOG_FILES,MAX_SHARED_ROOM_RECOVERY_CATALOG_BYTES,MAX_SHARED_ROOM_RECOVERY_CATALOG_METADATA_BYTES,MAX_SHARED_ROOM_RECOVERY_SERVER_BYTES} from "../room_recovery_catalog/policy.js";
import type {SharedRoomRecoveryCatalogV2Metadata,SharedRoomRecoveryCatalogV2Entry} from "./contract.js";
export function catalogV2Metadata(input:unknown):SharedRoomRecoveryCatalogV2Metadata {
 const r=object(input,"catalog,format,formatVersion,inventory,participants,server"),i=object(r["inventory"],"bytes,identity");
 if(r["format"]!=="breditor/shared-room-recovery-catalog"||r["formatVersion"]!==2||!Array.isArray(r["participants"])||r["participants"].length>MAX_SHARED_ROOM_RECOVERY_CATALOG_FILES-2)throw failure("catalog_policy");
 const participants=r["participants"].map<SharedRoomRecoveryCatalogV2Entry>(value=>{
  const p=object(value,"bytes,family,id,selection"),entry=id(p["id"]);
  if(p["family"]==="original")return{id:entry,family:"original",selection:participantSelection(p["selection"]),bytes:bytes(p["bytes"],MAX_SHARED_PARTICIPANT_BACKUP_BYTES)};
  if(p["family"]==="generation")return{id:entry,family:"generation",selection:generationParticipantSelection(p["selection"]),bytes:bytes(p["bytes"],MAX_GENERATION_PARTICIPANT_BYTES)};
  throw failure("catalog_policy");
 });
 for(let at=1;at<participants.length;at++)if(participants[at-1]!.id>=participants[at]!.id)throw failure("catalog_policy");
 const result={format:"breditor/shared-room-recovery-catalog" as const,formatVersion:2 as const,catalog:id(r["catalog"]),inventory:{identity:inventoryIdentity(i["identity"]),bytes:bytes(i["bytes"],MAX_SHARED_ROOM_PARTICIPANT_INVENTORY_BYTES)},server:fileIdentity(r["server"],MAX_SHARED_ROOM_RECOVERY_SERVER_BYTES),participants};
 if(result.inventory.bytes+result.server.bytes+participants.reduce((sum,p)=>sum+p.bytes,0)>MAX_SHARED_ROOM_RECOVERY_CATALOG_BYTES||new TextEncoder().encode(JSON.stringify(result)).length>MAX_SHARED_ROOM_RECOVERY_CATALOG_METADATA_BYTES)throw failure("catalog_budget");
 return frozen(result);
}
export function parseCatalogV2Manifest(text:unknown):SharedRoomRecoveryCatalogV2Metadata {
 if(typeof text!=="string"||text.length>MAX_SHARED_ROOM_RECOVERY_CATALOG_METADATA_BYTES||new TextEncoder().encode(text).length>MAX_SHARED_ROOM_RECOVERY_CATALOG_METADATA_BYTES)throw failure("catalog_budget");
 try{const result=catalogV2Metadata(JSON.parse(text));if(JSON.stringify(result)!==text)throw failure("catalog_integrity");return result;}catch{throw failure("catalog_integrity");}
}
