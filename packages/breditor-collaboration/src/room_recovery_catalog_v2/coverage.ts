/** Combine independently verified native prefixes, not visible-document or DTO equality. */
import {SharedRoomParticipantInventory} from "../room_participant_inventory/inventory.js";
import {frozen} from "../room_participant_inventory/policy.js";
import type {SharedRoomParticipantMissing,SharedRoomParticipantCoverage,SharedRoomParticipantSource,SharedRoomGenerationParticipantSource} from "../room_participant_inventory/types.js";
import type {V2StagedParticipant} from "./staged_participant.js";
const key=(row:SharedRoomParticipantMissing)=>row.kind==="document"?`document:${row.writer}`:row.kind==="review"?`review:${row.actor}`:`unbound:${row.participant}:${row.actor}`;
/** prepareCatalogV2Stage has already refused duplicate writers and review actors across families. */
export function catalogV2Coverage(inventory:SharedRoomParticipantInventory,owners:readonly V2StagedParticipant[]):SharedRoomParticipantCoverage{
 const original:SharedRoomParticipantSource[]=[],generation:SharedRoomGenerationParticipantSource[]=[];
 for(const owner of owners)if(owner.family==="original")original.push({backup:owner.value.policy.options.backup,source:owner.value.source});else generation.push({backup:owner.policy.options.backup,source:owner.source});
 const a=SharedRoomParticipantInventory.prototype.checkSources.call(inventory,original),b=SharedRoomParticipantInventory.prototype.checkGenerationSources.call(inventory,generation),bm=new Map(b.missing.filter(row=>row.kind!=="unbound_review").map(row=>[key(row),row])),missing:SharedRoomParticipantMissing[]=[];
 for(const row of a.missing)if(row.kind!=="unbound_review"){const other=bm.get(key(row));if(other)missing.push(row.reason==="server_ahead"?row:other);}
 const registeredStreamsCovered=missing.length===0;missing.push(...a.missing.filter(row=>row.kind==="unbound_review"),...b.missing.filter(row=>row.kind==="unbound_review"));
 // Revalidate after both readers, preserving genuine capture and inventory lifetime checks.
 SharedRoomParticipantInventory.prototype.checkSources.call(inventory,original);SharedRoomParticipantInventory.prototype.checkGenerationSources.call(inventory,generation);
 return frozen({kind:missing.length?"pending":"covered",registeredStreamsCovered,checkedParticipants:[...a.checkedParticipants,...b.checkedParticipants],missing});
}
