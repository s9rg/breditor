/** Closed immutable selections. Matching declarations are necessary, never native ancestry proof. */
import {archiveFields as object,archiveInteger} from "../archive_integrity/policy.js";
import {serverGenerationRoomIdentity} from "../server_generation_archive/identity.js";
import {serverGenerationParticipantIdentity} from "../server_generation_inventory/identity.js";
import {MAX_SHARED_SERVER_GENERATION_ARCHIVE_BYTES} from "../server_generation_archive/framing.js";
import {MAX_SHARED_SERVER_LOG_GENERATION_PARTICIPANT_INVENTORY_BYTES} from "../server_generation_inventory/policy.js";
import {participantSelection} from "../participant_backup/policy.js";
import {generationParticipantSelection} from "../generation_participant/policy.js";
import {MAX_SHARED_PARTICIPANT_BACKUP_BYTES} from "../participant_backup/format.js";
import {MAX_GENERATION_PARTICIPANT_BYTES} from "../generation_participant/codec.js";
import {frozen} from "../room_participant_inventory/policy.js";
import {physicalCatalogName,physicalCatalogFailure,physicalCatalogKnown,MAX_PHYSICAL_ROOM_CATALOG_FILES,MAX_PHYSICAL_ROOM_CATALOG_BYTES,MAX_PHYSICAL_ROOM_CATALOG_METADATA_BYTES} from "./policy.js";
import type {SharedPhysicalRoomRecoveryCatalogMetadata} from "./contract.js";
import type {SharedRoomRecoveryCatalogV2Entry} from "../room_recovery_catalog_v2/contract.js";
function server(value:unknown){const r=object(value,"identity,bytes");return{identity:serverGenerationRoomIdentity(r["identity"]),bytes:archiveInteger(r["bytes"],1,MAX_SHARED_SERVER_GENERATION_ARCHIVE_BYTES)};}
export function physicalCatalogMetadata(value:unknown):SharedPhysicalRoomRecoveryCatalogMetadata {
 try{
  const r=object(value,"format,formatVersion,catalog,origin,current,participants"),c=object(r["current"],"server,participants"),i=object(c["participants"],"identity,bytes");
  if(r["format"]!=="breditor/shared-physical-room-recovery-catalog"||r["formatVersion"]!==1||!Array.isArray(r["participants"])||r["participants"].length>MAX_PHYSICAL_ROOM_CATALOG_FILES-3)throw physicalCatalogFailure("catalog_policy");
  const origin=server(r["origin"]),current={server:server(c["server"]),participants:{identity:serverGenerationParticipantIdentity(i["identity"]),bytes:archiveInteger(i["bytes"],1,MAX_SHARED_SERVER_LOG_GENERATION_PARTICIPANT_INVENTORY_BYTES)}};
  const a=origin.identity.native.source,b=current.server.identity.native.source;
  // Necessary declaration consistency only. The native host still verifies complete ancestry,
  // retained original bytes, permissions and every separately protected registration.
  if(a.document!==b.document||a.owner!==b.owner||a.assetBinding!==b.assetBinding||JSON.stringify(a.profile)!==JSON.stringify(b.profile)||a.writerTransportVersion!==b.writerTransportVersion||a.records>b.records||origin.identity.assets.assets>current.server.identity.assets.assets||origin.identity.assets.bytes>current.server.identity.assets.bytes||JSON.stringify(current.participants.identity.source)!==JSON.stringify(current.server.identity.native))throw physicalCatalogFailure("catalog_integrity");
  const participants=Array.from(r["participants"],value=>{const p=object(value,"id,family,selection,bytes"),id=physicalCatalogName(p["id"]);if(p["family"]==="original")return{id,family:"original",selection:participantSelection(p["selection"]),bytes:archiveInteger(p["bytes"],1,MAX_SHARED_PARTICIPANT_BACKUP_BYTES)} as const;if(p["family"]==="generation")return{id,family:"generation",selection:generationParticipantSelection(p["selection"]),bytes:archiveInteger(p["bytes"],1,MAX_GENERATION_PARTICIPANT_BYTES)} as const;throw physicalCatalogFailure("catalog_policy");}) as SharedRoomRecoveryCatalogV2Entry[];
  for(let at=1;at<participants.length;at++)if(participants[at-1]!.id>=participants[at]!.id)throw physicalCatalogFailure("catalog_policy");
  const result={format:"breditor/shared-physical-room-recovery-catalog" as const,formatVersion:1 as const,catalog:physicalCatalogName(r["catalog"]),origin,current,participants};
  if(origin.bytes+current.server.bytes+current.participants.bytes+participants.reduce((sum,row)=>sum+row.bytes,0)>MAX_PHYSICAL_ROOM_CATALOG_BYTES||new TextEncoder().encode(JSON.stringify(result)).length>MAX_PHYSICAL_ROOM_CATALOG_METADATA_BYTES)throw physicalCatalogFailure("catalog_budget");return frozen(result);
 }catch(error){throw physicalCatalogKnown(error,"catalog_policy");}
}
export function parsePhysicalCatalogManifest(text:unknown):SharedPhysicalRoomRecoveryCatalogMetadata {
 if(typeof text!=="string"||text.length>MAX_PHYSICAL_ROOM_CATALOG_METADATA_BYTES||new TextEncoder().encode(text).length>MAX_PHYSICAL_ROOM_CATALOG_METADATA_BYTES)throw physicalCatalogFailure("catalog_budget");
 try{const result=physicalCatalogMetadata(JSON.parse(text));if(JSON.stringify(result)!==text)throw physicalCatalogFailure("catalog_integrity");return result;}catch(error){throw physicalCatalogKnown(error);}
}
