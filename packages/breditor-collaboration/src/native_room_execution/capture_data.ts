/** Build a self-contained whole-room intent without writing a database,
 * retiring a source, acquiring actors or creating an editable destination. */
import {archiveBlob} from '../archive_integrity/policy.js';
import {roomPreparationChoice} from '../native_room_preparation/plan.js';
import {MAX_ROOM_PREPARATION_BYTES} from '../native_room_preparation/policy.js';
import {executionLayout,executionAssetChoices,executionPlan,checkExecutionSources,checkExecutionLayoutPreparation} from './plan.js';
import {RoomExecutionReadScope} from './read_scope.js';
import {withExecutionPrepared} from './prepared_scope.js';
import {executionAssetInputs} from './asset_inputs.js';
import {buildExecutionAssetDecision} from './asset_decisions.js';
import {encodeRoomExecution} from './framing.js';
import {fields,fail} from './policy.js';
import type {RoomExecutionCaptureInput,RoomExecutionReadOptions,RoomExecutionAssetPlan} from './contract.js';
/** Snapshot all literal decisions before the first host/native callback. */
export function snapshotExecutionCapture(value:RoomExecutionCaptureInput){const raw=fields(value,['preparation','layout','decisions']),p=fields(raw['preparation'],['choice','file']),preparation={choice:roomPreparationChoice(p['choice']),file:archiveBlob(p['file'] as Blob,MAX_ROOM_PREPARATION_BYTES)},layout=executionLayout(raw['layout']),decisions=executionAssetChoices(raw['decisions']),ids=preparation.choice.plan.participants.map(row=>row.id);if(JSON.stringify(ids)!==JSON.stringify(layout.participants.map(row=>row.id))||JSON.stringify(ids)!==JSON.stringify(decisions.map(row=>row.id)))throw fail('room_execution_policy');checkExecutionLayoutPreparation(preparation.choice,layout);return Object.freeze({preparation:Object.freeze(preparation),layout,decisions});}
export async function captureRoomExecutionData(provided:RoomExecutionCaptureInput,options:RoomExecutionReadOptions){const chosen=snapshotExecutionCapture(provided),scope=new RoomExecutionReadScope(options);try{return await withExecutionPrepared(chosen.preparation,scope,async context=>{checkExecutionSources(context.before,context.retained,chosen.layout);const assets:RoomExecutionAssetPlan[]=[],union=new Map<string,Blob>(),adoption=new Map<string,Blob>(),parts:Blob[]=[chosen.preparation.file];
 for(const decision of chosen.decisions){scope.check();const built=await buildExecutionAssetDecision(executionAssetInputs(context,chosen.preparation.choice,decision.id,scope),decision,scope.integrity.digest,scope.check,scope.signal);scope.check();assets.push(built.plan);parts.push(built.union,built.adoption);union.set(decision.id,built.union);adoption.set(decision.id,built.adoption);}
 const plan=executionPlan({format:'breditor/native-room-execution-plan',formatVersion:1,preparation:chosen.preparation.choice,layout:chosen.layout,catalog:context.catalog.selection(),assets}),data=await encodeRoomExecution(plan,parts,scope.integrity);scope.check();return Object.freeze({data,preparation:chosen.preparation.file,union,adoption});});}finally{scope.close();}}
