/** Literal namespace/choice admission precedes callbacks and storage access.
 * The journal is explicitly named; no suffix is derived from an opaque name. */
import {executionChoice,executionNames} from '../native_room_execution/plan.js';
import {fields,database,hash,immutable,integer,fail} from '../native_room_execution/policy.js';
import type {RoomRunIdentity,RoomRunEvent,RoomRunStage,RoomRunApproval,RoomRunSnapshot} from './contract.js';
export const MAX_ROOM_RUN_EVENTS=4096;
export const MAX_ROOM_RUN_METADATA_BYTES=32*1024*1024;
const stages:readonly RoomRunStage[]=['start','resume','retired','catalog-started','root-started','root-ready','assets-started','assets-ready'];
export function roomRunIdentity(value:unknown):RoomRunIdentity {
 const r=fields(value,['format','formatVersion','database','execution']);
 if(r['format']!=='breditor/native-room-run'||r['formatVersion']!==1)throw fail('room_execution_policy');
 const name=database(r['database']),execution=executionChoice(r['execution']);
 const names=[...executionNames(execution.plan.layout),execution.plan.preparation.plan.database,...execution.plan.preparation.plan.participants.flatMap(row=>row.namespaces.map(ns=>ns.database))];
 if(names.includes(name))throw fail('room_execution_policy');
 return immutable({format:'breditor/native-room-run',formatVersion:1,database:name,execution});
}
export function roomRunEvent(value:unknown):RoomRunEvent {
 const r=fields(value,['format','formatVersion','execution','sequence','previous','stage']);
 if(r['format']!=='breditor/native-room-run-event'||r['formatVersion']!==1||!stages.includes(r['stage'] as RoomRunStage))throw fail();
 const sequence=integer(r['sequence'],MAX_ROOM_RUN_EVENTS-1),previous=r['previous']===null?null:hash(r['previous']),stage=r['stage'] as RoomRunStage;
 if((sequence===0)!==(previous===null)||(sequence===0)!==(stage==='start'))throw fail();
 return immutable({format:'breditor/native-room-run-event',formatVersion:1,execution:hash(r['execution']),sequence,previous,stage});
}
export function roomRunApproval(identity:RoomRunIdentity,snapshot:RoomRunSnapshot):RoomRunApproval {
 return immutable({format:'breditor/native-room-run-approval',formatVersion:1,identity,head:{...snapshot.head}});
}
