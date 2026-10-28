/** Closed mixed-run identity and handoff references. Old run formats refuse. */
import {unionExecutionChoice} from '../native_room_union_execution/plan.js';
import {executionNames} from '../native_room_execution/plan.js';
import {unionPlanTargets} from '../native_room_union/plan.js';
import {recordCutJson,parseRecordCutJson} from '../physical_room_record_cut/json.js';
import {approvalSelection} from '../physical_room_asset_approval/choice.js';
import {fields,database,hash,integer,immutable,fail} from './policy.js';
import type {NativeRoomUnionRunIdentity as Identity,NativeRoomUnionRunEvent as Event,NativeRoomUnionRunStage as Stage,NativeRoomUnionRunApproval as Approval,NativeRoomUnionRunSnapshot as Snapshot,NativeRoomUnionRunHandoff as Handoff} from './contract.js';
export const MAX_UNION_RUN_EVENTS=4096,MAX_UNION_RUN_METADATA_BYTES=64*1024*1024;
const stages:readonly Stage[]=['start','resume','retired','catalog-started','root-started','root-ready','assets-started','assets-ready','handoff-prepared','handoff-observed'];
export function unionRunIdentity(value:unknown):Identity {
 const r=fields(parseRecordCutJson(recordCutJson(value,MAX_UNION_RUN_METADATA_BYTES),MAX_UNION_RUN_METADATA_BYTES),['format','formatVersion','database','execution']);
 if(r['format']!=='breditor/native-room-union-run'||r['formatVersion']!==1)throw fail('room_union_run_policy');
 const name=database(r['database']),execution=unionExecutionChoice(r['execution']),p=execution.plan.preparation.plan;
 const names=[...executionNames(execution.plan.layout),p.database,...unionPlanTargets(p).flatMap(row=>[...row.namespaces.map(ns=>ns.database),...(row.mode==='independent-delivery-union'?[row.unionDatabase]:[])])];
 if(names.includes(name))throw fail('room_union_run_policy');return immutable({format:'breditor/native-room-union-run',formatVersion:1,database:name,execution});
}
export function unionRunHandoff(value:unknown):Handoff {const r=fields(value,['decisionHead','approval','approvalFile']),h=fields(r['decisionHead'],['sequence','sha256']),a=fields(r['approval'],['bytes','sha256']);return immutable({decisionHead:{sequence:integer(h['sequence'],MAX_UNION_RUN_EVENTS-1),sha256:hash(h['sha256'])},approval:{bytes:integer(a['bytes'],MAX_UNION_RUN_METADATA_BYTES,1),sha256:hash(a['sha256'])},approvalFile:approvalSelection(r['approvalFile'])});}
export function unionRunEvent(value:unknown):Event {const r=fields(value,['format','formatVersion','execution','sequence','previous','stage','handoff']);if(r['format']!=='breditor/native-room-union-run-event'||r['formatVersion']!==1||!stages.includes(r['stage'] as Stage))throw fail();const sequence=integer(r['sequence'],MAX_UNION_RUN_EVENTS-1),previous=r['previous']===null?null:hash(r['previous']),stage=r['stage'] as Stage,handoff=r['handoff']===null?null:unionRunHandoff(r['handoff']);if((sequence===0)!==(previous===null)||(sequence===0)!==(stage==='start')||(stage==='handoff-prepared'||stage==='handoff-observed')!==(handoff!==null)||handoff&&handoff.decisionHead.sequence>=sequence)throw fail();return immutable({format:'breditor/native-room-union-run-event',formatVersion:1,execution:hash(r['execution']),sequence,previous,stage,handoff});}
export function unionRunApproval(identity:Identity,snapshot:Snapshot):Approval{return immutable({format:'breditor/native-room-union-run-approval',formatVersion:1,identity,head:{...snapshot.head}});}
