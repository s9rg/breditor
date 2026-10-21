/** One synchronous complete-source diagnostic cohort. No current authority or activation proof. */
import {SharedParticipantBackup} from "../participant_backup/archive.js";
import {SharedGenerationParticipantBackup} from "../generation_participant/backup.js";
import {readPairedBackupRecord} from "../backups/paired.js";
import {checkInventorySources} from "../room_participant_inventory/coverage.js";
import {checkInventoryGenerationSources} from "../room_participant_inventory/generation_coverage.js";
import {SharedRoomParticipantInventoryError,frozen} from "../room_participant_inventory/policy.js";
import type {SharedRoomParticipantInventoryMetadata,SharedRoomParticipantCoverage,SharedRoomParticipantMissing} from "../room_participant_inventory/types.js";
import type {SharedServerLogGenerationParticipantSource} from "./contract.js";
const originalSelection=SharedParticipantBackup.prototype.selection,originalRecords=SharedParticipantBackup.prototype.records,generationSelection=SharedGenerationParticipantBackup.prototype.selection;
const missingKey=(row:SharedRoomParticipantMissing)=>row.kind==="document"?`document:${row.writer}`:row.kind==="review"?`review:${row.actor}`:`unbound:${row.participant}:${row.actor}`;
export function checkPhysicalMixedSources(metadata:SharedRoomParticipantInventoryMetadata,input:readonly SharedServerLogGenerationParticipantSource[]):SharedRoomParticipantCoverage {
 const refuse=()=>new SharedRoomParticipantInventoryError("inventory_source","Select genuine explicitly tagged original or generation client histories"),duplicate=()=>new SharedRoomParticipantInventoryError("inventory_duplicate","Reconcile duplicate writer or review actor copies explicitly; no copy was selected or discarded");
 if(!Array.isArray(input)||input.length>1024)throw refuse();
 const rows=Array.from(input,row=>{const family=row?.family;if(family!=="original"&&family!=="generation")throw refuse();return{family,backup:row.backup,source:row.source} as SharedServerLogGenerationParticipantSource;});
 const original=rows.filter((row):row is Extract<SharedServerLogGenerationParticipantSource,{family:"original"}>=>row.family==="original"),generation=rows.filter((row):row is Extract<SharedServerLogGenerationParticipantSource,{family:"generation"}>=>row.family==="generation");
 const a=checkInventorySources(metadata,original),b=checkInventoryGenerationSources(metadata,generation),writers=new Set<string>(),actors=new Set<string>();
 for(const row of [...a.checkedParticipants,...b.checkedParticipants]){if(writers.has(row.writer))throw duplicate();writers.add(row.writer);}
 for(const row of rows){let actor:string|undefined;
  if(row.family==="generation")actor=generationSelection.call(row.backup).identity.source.review?.actor;
  else{const paired=originalRecords.call(row.backup).find(record=>record.kind==="paired-session");if(paired)actor=readPairedBackupRecord(paired.json,originalSelection.call(row.backup).identity.source).reviewActor;}
  if(actor!==undefined){if(actors.has(actor))throw duplicate();actors.add(actor);}
 }
 const otherMissing=new Map(b.missing.filter(row=>row.kind!=="unbound_review").map(row=>[missingKey(row),row])),missing:SharedRoomParticipantMissing[]=[];
 for(const row of a.missing)if(row.kind!=="unbound_review"){const other=otherMissing.get(missingKey(row));if(other)missing.push(row.reason==="server_ahead"?row:other);}
 const registeredStreamsCovered=missing.length===0;missing.push(...a.missing.filter(row=>row.kind==="unbound_review"),...b.missing.filter(row=>row.kind==="unbound_review"));
 // All incoming accessors were snapshotted first; recheck genuine readers after joining.
 checkInventorySources(metadata,original);checkInventoryGenerationSources(metadata,generation);
 return frozen({kind:missing.length?"pending":"covered",registeredStreamsCovered,checkedParticipants:[...a.checkedParticipants,...b.checkedParticipants],missing});
}
