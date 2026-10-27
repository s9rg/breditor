/** Pure two-stage conflict discovery. The second preview requires every first
 * edge choice explicitly. Neither preview saves a choice or opens any target. */
import {archiveBlob} from '../archive_integrity/policy.js';
import {roomPreparationChoice} from '../native_room_preparation/plan.js';
import {MAX_ROOM_PREPARATION_BYTES} from '../native_room_preparation/policy.js';
import type {RoomPreparationFile} from '../native_room_preparation/contract.js';
import type {RoomExecutionReadOptions,RoomExecutionAssetChoices} from './contract.js';
import {fields,rows,fail,MAX_ROOM_EXECUTION_MEMBERS} from './policy.js';
import {executionAssetChoices} from './plan.js';
import {RoomExecutionReadScope} from './read_scope.js';
import {withExecutionPrepared} from './prepared_scope.js';
import {executionAssetInputs} from './asset_inputs.js';
import {previewExecutionAssetUnion,previewExecutionAssetAdoption} from './asset_decisions.js';
function preparation(value:RoomPreparationFile){const row=fields(value,['choice','file']);return{choice:roomPreparationChoice(row['choice']),file:archiveBlob(row['file'] as Blob,MAX_ROOM_PREPARATION_BYTES)};}
export async function previewRoomExecutionUnion(provided:RoomPreparationFile,options:RoomExecutionReadOptions){const input=preparation(provided),scope=new RoomExecutionReadScope(options);try{return await withExecutionPrepared(input,scope,async context=>{const result=[];for(const row of input.choice.plan.participants){scope.check();result.push(Object.freeze({id:row.id,preview:await previewExecutionAssetUnion(executionAssetInputs(context,input.choice,row.id,scope),scope.check,scope.signal)}));}scope.check();return Object.freeze(result);});}finally{scope.close();}}
export async function previewRoomExecutionAdoption(provided:RoomPreparationFile,chosen:readonly Pick<RoomExecutionAssetChoices,'id'|'union'>[],options:RoomExecutionReadOptions){const input=preparation(provided),decisions=executionAssetChoices(rows(chosen,MAX_ROOM_EXECUTION_MEMBERS).map(value=>{const row=fields(value,['id','union']);return{id:row['id'],union:row['union'],adoption:[]};}));if(JSON.stringify(decisions.map(row=>row.id))!==JSON.stringify(input.choice.plan.participants.map(row=>row.id)))throw fail('room_execution_policy');const scope=new RoomExecutionReadScope(options);try{return await withExecutionPrepared(input,scope,async context=>{const result=[];for(const row of decisions){scope.check();result.push(Object.freeze({id:row.id,preview:await previewExecutionAssetAdoption(executionAssetInputs(context,input.choice,row.id,scope),row.union,scope.check,scope.signal)}));}scope.check();return Object.freeze(result);});}finally{scope.close();}}
